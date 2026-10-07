/* ==========================================================================
   discord-token-worker.js — Cloudflare Worker (plano gratuito)
   --------------------------------------------------------------------------
   Troca o access_token do Discord (implicit grant) por um Firebase Custom
   Token com uid estável "discord_<id>". Não usa Cloud Functions nem Blaze.

   COMO PUBLICAR
   1. Firebase Console → Configurações do projeto → Contas de serviço →
      "Gerar nova chave privada" (baixa um JSON).
   2. npm i -g wrangler && wrangler init (ou cole este arquivo em um Worker
      novo pelo painel da Cloudflare).
   3. Defina os segredos (wrangler secret put NOME):
        FIREBASE_CLIENT_EMAIL  -> campo "client_email" do JSON
        FIREBASE_PRIVATE_KEY   -> campo "private_key" do JSON (com os \n)
      E as variáveis (wrangler.toml ou painel):
        DISCORD_CLIENT_ID      -> o mesmo de DISCORD_CLIENT_ID em js/api.js
        ALLOWED_ORIGIN         -> ex.: https://nexus-a-5dea9.web.app
   4. Copie a URL do Worker para DISCORD_TOKEN_ENDPOINT em js/api.js.

   NUNCA coloque a chave privada no front-end nem no repositório.
   ========================================================================== */

const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

function b64url(input){
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signCustomToken(env, uid){
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: AUD,
    iat: now,
    exp: now + 3600,
    uid
  };
  const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));

  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return data + '.' + b64url(sig);
}

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'origin' }, 403);

    let accessToken;
    try{ ({ accessToken } = await request.json()); }catch(e){ return json({ error: 'body' }, 400); }
    if (!accessToken || typeof accessToken !== 'string') return json({ error: 'token' }, 400);

    // Pergunta ao Discord de quem é o token E para qual aplicação ele foi
    // emitido — sem essa checagem, um token de OUTRO app serviria para
    // entrar como qualquer pessoa ("confused deputy").
    const res = await fetch('https://discord.com/api/oauth2/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return json({ error: 'discord' }, 401);
    const info = await res.json();
    if (!info.application || info.application.id !== env.DISCORD_CLIENT_ID) return json({ error: 'app' }, 401);
    if (!info.user || !info.user.id) return json({ error: 'user' }, 401);

    // /oauth2/@me NÃO devolve o e-mail; ele vem de /users/@me (escopo "email").
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!meRes.ok) return json({ error: 'discord-user' }, 401);
    const u = await meRes.json();
    if (!u || u.id !== info.user.id) return json({ error: 'user' }, 401);

    const customToken = await signCustomToken(env, `discord_${u.id}`);
    return json({
      customToken,
      user: { id: u.id, username: u.username, global_name: u.global_name, avatar: u.avatar, email: u.email || null }
    });
  }
};
