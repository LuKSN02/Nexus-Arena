/* ==========================================================================
   nexus-worker.js — Cloudflare Worker (plano gratuito) — API da Nexus Arena
   --------------------------------------------------------------------------
   Rotas:
     POST /                       login Discord → Firebase Custom Token
     POST /economy/daily          bônus diário (+moedas, +XP)
     POST /economy/xp             XP por ação (like/share/bookmark), com teto diário
     POST /economy/claim          resgata recompensa do Passe de Batalha
     POST /economy/unlock         compra item da Loja de Recompensas com moedas
     POST /economy/order-rewards  credita moedas/passe/emblema de um pedido
     POST /newsletter/subscribe   cria inscrição PENDENTE e manda e-mail de confirmação
     GET  /newsletter/confirm     link do e-mail: confirma a inscrição
     GET  /newsletter/unsubscribe link no rodapé dos e-mails: cancela a inscrição

   Por que existe: moedas, XP, emblemas e a lista de inscritos NÃO podem ser
   escritos pelo navegador (qualquer um editaria o próprio saldo no console).
   O front-end só PEDE a ação; este Worker valida e grava no Firestore com a
   conta de serviço (que ignora as regras de segurança).

   SEGREDOS (Settings → Variables and Secrets; marque "Secret"):
     FIREBASE_CLIENT_EMAIL   client_email do JSON da conta de serviço
     FIREBASE_PRIVATE_KEY    private_key do JSON (com os \n)
     EMAILJS_PRIVATE_KEY     EmailJS → Account → API Keys → Private Key
   VARIÁVEIS (texto):
     DISCORD_CLIENT_ID       o mesmo de js/api.js
     ALLOWED_ORIGIN          https://luksn02.github.io   (sem barra, sem caminho)
     FIREBASE_PROJECT_ID     ex.: nexus-a-5dea9  (Firebase → Configurações do projeto)
     SITE_URL                https://luksn02.github.io/Nexus-Arena/
     ORDERS_CUTOFF           ex.: 2026-10-10T12:00:00.000Z — pedidos anteriores NÃO são creditados de novo
     REQUIRE_PAYMENT         (opcional) "1" só quando existir pagamento real — veja README
     EMAILJS_SERVICE_ID      service_iykqsil
     EMAILJS_TEMPLATE_ID     template_zvykdae
     EMAILJS_PUBLIC_KEY      HFY4O0h1zvtNX8N_r

   NUNCA coloque a chave privada no front-end nem no repositório.
   ========================================================================== */

/* Catálogo — GERADO por `node server/gen-catalog.js` a partir de js/data.js.
   Se mudar preços/recompensas/temporada lá, gere de novo e cole aqui. */
const CATALOG = {
  "rewards": {
    "frame": {
      "neon": 4000,
      "toxic": 5000,
      "glacial": 6000,
      "inferno": 8000,
      "void": 10000,
      "royal": 12000
    },
    "badge": {
      "legend": 15000,
      "vip": 9000,
      "strategist": 6000
    },
    "banner": {
      "aurora": 5000,
      "plasma": 7000,
      "circuito": 9000,
      "eclipse": 12000
    },
    "title": {
      "invicto": 3000,
      "mestre-estrategista": 6000,
      "lenda-da-arena": 10000,
      "campeao-mundial": 16000
    }
  },
  "season": {
    "id": "season-01",
    "maxLevel": 30,
    "xpPerLevel": 500,
    "rewards": {
      "free": {
        "5": {
          "type": "coins",
          "amount": 300
        },
        "10": {
          "type": "coins",
          "amount": 500
        },
        "15": {
          "type": "coins",
          "amount": 800
        },
        "20": {
          "type": "coins",
          "amount": 1000
        },
        "25": {
          "type": "coins",
          "amount": 1200
        },
        "30": {
          "type": "coins",
          "amount": 2000
        }
      },
      "premium": {
        "5": {
          "type": "coins",
          "amount": 800
        },
        "10": {
          "type": "coins",
          "amount": 1200
        },
        "15": {
          "type": "coins",
          "amount": 1800
        },
        "20": {
          "type": "coins",
          "amount": 2400
        },
        "25": {
          "type": "coins",
          "amount": 3000
        },
        "30": {
          "type": "coins",
          "amount": 5000
        }
      }
    }
  },
  "coinPack": {
    "productId": "p9",
    "coinsPerUnit": 5000
  },
  "passProductId": "p8"
};

const DAILY_BONUS = 15;
const DAILY_BONUS_XP = 50;
const ORDER_XP = 40;
const XP_ACTIONS = { like: 10, share: 15, bookmark: 10 };
const XP_DAILY_CAP = 300;            // teto de XP vindo de ações (não conta bônus/pedido)
const ACTIVE_FIELD = { frame: 'activeFrame', badge: null, banner: 'activeBanner', title: 'activeTitle' };
const UNLOCK_FIELD = { frame: 'unlockedFrames', badge: 'badges', banner: 'unlockedBanners', title: 'unlockedTitles' };
const SUB_COOLDOWN_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 48 * 3600 * 1000;

const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

/* ------------------------------ utilitários ------------------------------ */
function b64url(input){
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeBytes(s){
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function b64urlDecodeStr(s){ return new TextDecoder().decode(b64urlDecodeBytes(s)); }
function randomToken(n = 24){ return b64url(crypto.getRandomValues(new Uint8Array(n))); }
function safeEqual(a, b){
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function escHtml(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function isValidEmail(e){ return typeof e === 'string' && e.length < 255 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
/* Dia de calendário em São Paulo (o servidor roda em UTC). */
function dayKeySP(date = new Date()){
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function yesterdayKeySP(){
  return dayKeySP(new Date(Date.now() - 24 * 3600 * 1000));
}

class HttpError extends Error {
  constructor(status, code){ super(code); this.status = status; this.code = code; }
}

/* ----------------------------- assinatura RS256 ---------------------------- */
async function importPrivateKey(env){
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
async function signJwt(env, payload){
  const data = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify(payload));
  const key = await importPrivateKey(env);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return data + '.' + b64url(sig);
}
function signCustomToken(env, uid){
  const now = Math.floor(Date.now() / 1000);
  return signJwt(env, { iss: env.FIREBASE_CLIENT_EMAIL, sub: env.FIREBASE_CLIENT_EMAIL, aud: AUD, iat: now, exp: now + 3600, uid });
}

/* ------------------- token de acesso do Google (Firestore) ----------------- */
let _gToken = null; // { value, exp }
async function googleAccessToken(env){
  if (_gToken && _gToken.exp > Date.now() + 60000) return _gToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(env, {
    iss: env.FIREBASE_CLIENT_EMAIL, sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat: now, exp: now + 3600
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(assertion)
  });
  if (!res.ok) throw new HttpError(500, 'google-token');
  const j = await res.json();
  _gToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return _gToken.value;
}

/* --------------------- verificação do ID token do Firebase ----------------- */
let _jwks = null; // { keys, exp }
async function getJwks(){
  if (_jwks && _jwks.exp > Date.now()) return _jwks.keys;
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!res.ok) throw new HttpError(500, 'jwks');
  const j = await res.json();
  _jwks = { keys: j.keys, exp: Date.now() + 3600 * 1000 };
  return _jwks.keys;
}
async function verifyIdToken(env, request){
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) throw new HttpError(401, 'auth');
  const parts = m[1].split('.');
  if (parts.length !== 3) throw new HttpError(401, 'auth');
  let header, payload;
  try{ header = JSON.parse(b64urlDecodeStr(parts[0])); payload = JSON.parse(b64urlDecodeStr(parts[1])); }
  catch(e){ throw new HttpError(401, 'auth'); }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'auth');
  const jwk = (await getJwks()).find(k => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'auth');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecodeBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'auth');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.FIREBASE_PROJECT_ID
      || payload.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID
      || !payload.sub || typeof payload.exp !== 'number' || payload.exp < now || payload.iat > now + 300){
    throw new HttpError(401, 'auth');
  }
  return { uid: payload.sub, email: payload.email || null };
}

/* ------------------------------ Firestore REST ----------------------------- */
function fsBase(env){ return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`; }
function docPath(env, path){ return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`; }
function pathUrl(env, path){ return fsBase(env) + '/' + path.split('/').map(encodeURIComponent).join('/'); }

function enc(v){
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  throw new Error('tipo');
}
function dec(v){
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
}
function decDoc(doc){
  if (!doc || !doc.fields) return {};
  return Object.fromEntries(Object.entries(doc.fields).map(([k, x]) => [k, dec(x)]));
}

async function fsFetch(env, url, init){
  const token = await googleAccessToken(env);
  const res = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  return res;
}
async function fsGet(env, path){
  const res = await fsFetch(env, pathUrl(env, path), { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(500, 'firestore-get');
  return decDoc(await res.json());
}

/* Transação: leitura + escrita atômicas (o Firestore refaz se alguém mexer no
   mesmo documento no meio — evita resgatar duas vezes com requisições paralelas).
   fn(tx) usa tx.get(path) e tx.set(path, fields[, {merge}]) / tx.del(path). */
async function runTx(env, fn){
  for (let attempt = 0; attempt < 4; attempt++){
    const begin = await fsFetch(env, `${fsBase(env)}:beginTransaction`, { method: 'POST', body: '{}' });
    if (!begin.ok) throw new HttpError(500, 'firestore-tx');
    const { transaction } = await begin.json();
    const writes = [];
    const tx = {
      async get(path){
        const res = await fsFetch(env, pathUrl(env, path) + '?transaction=' + encodeURIComponent(transaction), { method: 'GET' });
        if (res.status === 404) return null;
        if (!res.ok) throw new HttpError(500, 'firestore-get');
        return decDoc(await res.json());
      },
      set(path, data, merge = true){
        const w = { update: { name: docPath(env, path), fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) } };
        if (merge) w.updateMask = { fieldPaths: Object.keys(data).map(k => '`' + k.replace(/`/g, '') + '`') };
        writes.push(w);
      },
      del(path){ writes.push({ delete: docPath(env, path) }); }
    };
    let result;
    try{ result = await fn(tx); }
    catch(e){
      // libera a transação sem gravar
      await fsFetch(env, `${fsBase(env)}:rollback`, { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => {});
      throw e;
    }
    const commit = await fsFetch(env, `${fsBase(env)}:commit`, { method: 'POST', body: JSON.stringify({ writes, transaction }) });
    if (commit.ok) return result;
    if (commit.status === 409 || commit.status === 400 && (await commit.clone().text()).includes('ABORTED')) continue;
    throw new HttpError(500, 'firestore-commit');
  }
  throw new HttpError(503, 'busy');
}

/* ------------------------- regras do Passe de Batalha ---------------------- */
function freshPass(){
  return { seasonId: CATALOG.season.id, xp: 0, level: 1, hasPremium: false, claimedFree: [], claimedPremium: [] };
}
function normalizePass(p){
  if (!p || p.seasonId !== CATALOG.season.id) return freshPass();
  return { ...freshPass(), ...p, claimedFree: p.claimedFree || [], claimedPremium: p.claimedPremium || [] };
}
function addXpToPass(pass, amount){
  pass.xp += amount;
  const level = Math.min(CATALOG.season.maxLevel, 1 + Math.floor(pass.xp / CATALOG.season.xpPerLevel));
  const leveledUp = level > pass.level;
  pass.level = level;
  return leveledUp;
}
const passDoc = uid => `seasonPasses/${uid}`;
const userDoc = uid => `users/${uid}`;
const publicPass = p => ({ seasonId: p.seasonId, xp: p.xp, level: p.level, hasPremium: p.hasPremium, claimedFree: p.claimedFree, claimedPremium: p.claimedPremium });
/* Campos de economia que o cliente recebe de volta */
function econView(u){
  return {
    coins: u.coins || 0, badges: u.badges || [],
    unlockedFrames: u.unlockedFrames || [], unlockedBanners: u.unlockedBanners || [], unlockedTitles: u.unlockedTitles || [],
    activeFrame: u.activeFrame || null, activeBanner: u.activeBanner || null, activeTitle: u.activeTitle || null
  };
}

/* ---------------------------------- economia -------------------------------- */
async function requireUser(tx, uid){
  const u = await tx.get(userDoc(uid));
  if (!u) throw new HttpError(404, 'user');
  return u;
}

async function economyDaily(env, uid){
  const today = dayKeySP();
  return runTx(env, async (tx) => {
    const u = await requireUser(tx, uid);
    const pass = normalizePass(await tx.get(passDoc(uid)));
    if (u.lastDailyBonus === today){
      return { claimed: false, amount: 0, coins: u.coins || 0, pass: publicPass(pass) };
    }
    const streak = u.lastDailyBonus === yesterdayKeySP() ? (u.dailyStreak || 0) + 1 : 1;
    const coins = (u.coins || 0) + DAILY_BONUS;
    const leveledUp = addXpToPass(pass, DAILY_BONUS_XP);
    tx.set(userDoc(uid), { coins, lastDailyBonus: today, dailyStreak: streak });
    tx.set(passDoc(uid), pass);
    return { claimed: true, amount: DAILY_BONUS, coins, streak, pass: publicPass(pass), leveledUp };
  });
}

async function economyXp(env, uid, body){
  const amount = XP_ACTIONS[body.kind];
  if (!amount) throw new HttpError(400, 'kind');
  const today = dayKeySP();
  return runTx(env, async (tx) => {
    await requireUser(tx, uid);
    const raw = await tx.get(passDoc(uid));
    const pass = normalizePass(raw);
    const usedToday = raw && raw.xpDay === today ? (raw.xpToday || 0) : 0;
    if (usedToday + amount > XP_DAILY_CAP){
      return { granted: 0, capped: true, pass: publicPass(pass), leveledUp: false };
    }
    const leveledUp = addXpToPass(pass, amount);
    tx.set(passDoc(uid), { ...pass, xpDay: today, xpToday: usedToday + amount });
    return { granted: amount, pass: publicPass(pass), leveledUp };
  });
}

async function economyClaim(env, uid, body){
  const level = Number(body.level);
  const track = body.track;
  if (track !== 'free' && track !== 'premium') throw new HttpError(400, 'track');
  const reward = CATALOG.season.rewards[track][String(level)];
  if (!Number.isInteger(level) || !reward) throw new HttpError(400, 'reward');
  return runTx(env, async (tx) => {
    const u = await requireUser(tx, uid);
    const pass = normalizePass(await tx.get(passDoc(uid)));
    if (pass.level < level) throw new HttpError(409, 'level');
    if (track === 'premium' && !pass.hasPremium) throw new HttpError(403, 'premium');
    const field = track === 'free' ? 'claimedFree' : 'claimedPremium';
    if (pass[field].includes(level)) throw new HttpError(409, 'claimed');
    pass[field] = [...pass[field], level];
    const coins = (u.coins || 0) + reward.amount;
    tx.set(userDoc(uid), { coins });
    tx.set(passDoc(uid), pass);
    return { pass: publicPass(pass), reward, coins };
  });
}

async function economyUnlock(env, uid, body){
  const { type, key } = body;
  const cost = CATALOG.rewards[type] && CATALOG.rewards[type][key];
  if (typeof cost !== 'number') throw new HttpError(400, 'item');
  const field = UNLOCK_FIELD[type];
  return runTx(env, async (tx) => {
    const u = await requireUser(tx, uid);
    const owned = u[field] || [];
    if (owned.includes(key)) throw new HttpError(409, 'owned');
    if ((u.coins || 0) < cost) throw new HttpError(402, 'coins');
    const patch = { coins: (u.coins || 0) - cost, [field]: [...owned, key] };
    if (ACTIVE_FIELD[type]) patch[ACTIVE_FIELD[type]] = key;
    tx.set(userDoc(uid), patch);
    return econView({ ...u, ...patch });
  });
}

/* Credita o que um pedido dá (moedas do pacote, passe, emblema de 1ª compra).
   Idempotente: o pedido é marcado com rewardsGranted. */
async function economyOrderRewards(env, uid, body){
  const orderId = String(body.orderId || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(orderId)) throw new HttpError(400, 'order');
  return runTx(env, async (tx) => {
    const order = await tx.get(`orders/${orderId}`);
    if (!order || order.ownerKey !== uid) throw new HttpError(404, 'order');
    // Quando houver pagamento real (webhook marcando paymentStatus='paid' com a
    // conta de serviço), ligue REQUIRE_PAYMENT=1 e só pedidos pagos creditam.
    if (env.REQUIRE_PAYMENT === '1' && order.paymentStatus !== 'paid') throw new HttpError(402, 'unpaid');
    const u = await requireUser(tx, uid);
    const pass = normalizePass(await tx.get(passDoc(uid)));
    // Pedidos feitos ANTES desta versão já foram creditados pelo app antigo:
    // não creditar de novo. ORDERS_CUTOFF = data/hora (ISO) em que você publicou o Worker.
    const cutoff = env.ORDERS_CUTOFF || '2026-10-10T00:00:00.000Z';
    if (order.rewardsGranted || !order.createdAt || order.createdAt < cutoff){
      return { already: true, coinsGained: 0, gainedBuyer: false, gainedPass: false, user: econView(u), pass: publicPass(pass) };
    }
    const items = Array.isArray(order.items) ? order.items : [];
    const qtyOf = (pid) => items.filter(i => i && i.productId === pid)
      .reduce((s, i) => s + (Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 10 ? i.qty : 0), 0);

    const patch = {};
    const badges = new Set(u.badges || []);
    let gainedBuyer = false, gainedPass = false;
    if (!badges.has('buyer')){ badges.add('buyer'); gainedBuyer = true; }

    const coinsGained = qtyOf(CATALOG.coinPack.productId) * CATALOG.coinPack.coinsPerUnit;
    if (coinsGained) patch.coins = (u.coins || 0) + coinsGained;

    if (qtyOf(CATALOG.passProductId) > 0 && !badges.has('season-pass')){
      badges.add('season-pass'); gainedPass = true;
      pass.hasPremium = true;
      patch.unlockedFrames = [...new Set([...(u.unlockedFrames || []), 'cyber'])];
      patch.activeFrame = 'cyber';
    }
    if (gainedBuyer || gainedPass) patch.badges = [...badges];

    addXpToPass(pass, ORDER_XP);
    if (Object.keys(patch).length) tx.set(userDoc(uid), patch);
    tx.set(passDoc(uid), pass);
    tx.set(`orders/${orderId}`, { rewardsGranted: true });
    return { already: false, coinsGained, gainedBuyer, gainedPass, user: econView({ ...u, ...patch }), pass: publicPass(pass) };
  });
}

/* --------------------------------- newsletter -------------------------------- */
const subKey = email => encodeURIComponent(email);
const confirmUrl = (request, email, token) =>
  `${new URL(request.url).origin}/newsletter/confirm?e=${b64url(email)}&t=${encodeURIComponent(token)}`;
const unsubUrl = (origin, email, token) =>
  `${origin}/newsletter/unsubscribe?e=${b64url(email)}&t=${encodeURIComponent(token)}`;

async function sendEmailJs(env, params){
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID, template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY, accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: params
    })
  });
  if (!res.ok) throw new HttpError(502, 'email');
}

async function newsletterSubscribe(env, request, uid, body){
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, 'email');
  const now = Date.now();
  const token = randomToken();
  const status = await runTx(env, async (tx) => {
    const existing = await tx.get(`newsletterSubs/${subKey(email)}`);
    if (existing && existing.unsubToken) return 'already';
    const pending = await tx.get(`newsletterPending/${subKey(email)}`);
    if (pending && now - (pending.lastSentAt || 0) < SUB_COOLDOWN_MS) return 'wait';
    tx.set(`newsletterPending/${subKey(email)}`, { email, token, createdAt: now, lastSentAt: now, requestedBy: uid }, false);
    return 'sent';
  });
  if (status !== 'sent') return { status };
  const link = confirmUrl(request, email, token);
  await sendEmailJs(env, {
    to_email: email,
    subject: 'Confirme sua inscrição na newsletter da Nexus Arena',
    body: `<p>Recebemos um pedido para inscrever este e-mail na newsletter da <b>Nexus Arena</b>.</p>`
        + `<p><a href="${escHtml(link)}" style="background:#ff4d2e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Confirmar inscrição</a></p>`
        + `<p>Se o botão não funcionar, copie este endereço no navegador:<br>${escHtml(link)}</p>`
        + `<p>O link vale por 48 horas. Se não foi você, é só ignorar este e-mail — nada será assinado.</p>`
  });
  return { status: 'sent' };
}

function htmlPage(env, title, msg){
  const site = escHtml(env.SITE_URL || '/');
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>`
    + `<style>body{font-family:system-ui,sans-serif;background:#0b0f14;color:#e8eef5;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}`
    + `main{max-width:420px;text-align:center}a{color:#ff6a4d}</style></head><body><main><h1>${escHtml(title)}</h1><p>${escHtml(msg)}</p><p><a href="${site}">Voltar para a Nexus Arena</a></p></main></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
function emailFromParam(e){
  try{ const s = b64urlDecodeStr(String(e || '')).toLowerCase(); return isValidEmail(s) ? s : null; }catch(_){ return null; }
}

async function newsletterConfirm(env, url){
  const email = emailFromParam(url.searchParams.get('e'));
  const t = url.searchParams.get('t') || '';
  if (!email || !t) return htmlPage(env, 'Link inválido', 'Esse link de confirmação não é válido.');
  const outcome = await runTx(env, async (tx) => {
    const sub = await tx.get(`newsletterSubs/${subKey(email)}`);
    if (sub && sub.unsubToken) return 'ok';
    const p = await tx.get(`newsletterPending/${subKey(email)}`);
    if (!p || !safeEqual(p.token || '', t)) return 'invalid';
    if (Date.now() - (p.createdAt || 0) > PENDING_TTL_MS) return 'expired';
    tx.set(`newsletterSubs/${subKey(email)}`, {
      email, subscribedAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), unsubToken: randomToken()
    }, false);
    tx.del(`newsletterPending/${subKey(email)}`);
    return 'ok';
  });
  if (outcome === 'ok') return htmlPage(env, 'Inscrição confirmada!', 'Pronto — você vai receber o resumo de notícias da Nexus Arena. Dá para cancelar a qualquer momento pelo link no rodapé dos e-mails.');
  if (outcome === 'expired') return htmlPage(env, 'Link expirado', 'Esse link venceu. Faça a inscrição de novo no site para receber outro.');
  return htmlPage(env, 'Link inválido', 'Esse link de confirmação não é válido ou já foi usado.');
}

async function newsletterUnsubscribe(env, url){
  const email = emailFromParam(url.searchParams.get('e'));
  const t = url.searchParams.get('t') || '';
  if (!email || !t) return htmlPage(env, 'Link inválido', 'Esse link de cancelamento não é válido.');
  const ok = await runTx(env, async (tx) => {
    const sub = await tx.get(`newsletterSubs/${subKey(email)}`);
    if (!sub) return 'gone';
    if (!sub.unsubToken || !safeEqual(sub.unsubToken, t)) return 'invalid';
    tx.del(`newsletterSubs/${subKey(email)}`);
    return 'ok';
  });
  if (ok === 'invalid') return htmlPage(env, 'Link inválido', 'Esse link de cancelamento não é válido.');
  return htmlPage(env, 'Inscrição cancelada', 'Você não receberá mais a newsletter da Nexus Arena.');
}

/* ------------------------------ login com Discord --------------------------- */
async function discordLogin(env, body, json){
  const accessToken = body.accessToken;
  if (!accessToken || typeof accessToken !== 'string') return json({ error: 'token' }, 400);
  // Pergunta ao Discord de quem é o token E para qual aplicação ele foi
  // emitido — sem essa checagem, um token de OUTRO app serviria para
  // entrar como qualquer pessoa ("confused deputy").
  const res = await fetch('https://discord.com/api/oauth2/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return json({ error: 'discord' }, 401);
  const info = await res.json();
  if (!info.application || info.application.id !== env.DISCORD_CLIENT_ID) return json({ error: 'app' }, 401);
  if (!info.user || !info.user.id) return json({ error: 'user' }, 401);
  // /oauth2/@me NÃO devolve o e-mail; ele vem de /users/@me (escopo "email").
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!meRes.ok) return json({ error: 'discord-user' }, 401);
  const u = await meRes.json();
  if (!u || u.id !== info.user.id) return json({ error: 'user' }, 401);
  const customToken = await signCustomToken(env, `discord_${u.id}`);
  return json({ customToken, user: { id: u.id, username: u.username, global_name: u.global_name, avatar: u.avatar, email: u.email || null } });
}

/* ---------------------------------- roteador -------------------------------- */
export default {
  async fetch(request, env){
    const url = new URL(request.url);

    // Links clicados em e-mails (navegação, sem CORS/Origin).
    if (request.method === 'GET' && (url.pathname === '/newsletter/confirm' || url.pathname === '/newsletter/unsubscribe')){
      try{
        return url.pathname === '/newsletter/confirm' ? await newsletterConfirm(env, url) : await newsletterUnsubscribe(env, url);
      }catch(e){
        return htmlPage(env, 'Algo deu errado', 'Tente novamente em instantes.');
      }
    }

    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'origin' }, 403);

    let body;
    try{ body = await request.json(); }catch(e){ return json({ error: 'body' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'body' }, 400);

    try{
      if (url.pathname === '/') return await discordLogin(env, body, json);

      const { uid } = await verifyIdToken(env, request);
      switch (url.pathname){
        case '/economy/daily':         return json(await economyDaily(env, uid));
        case '/economy/xp':            return json(await economyXp(env, uid, body));
        case '/economy/claim':         return json(await economyClaim(env, uid, body));
        case '/economy/unlock':        return json(await economyUnlock(env, uid, body));
        case '/economy/order-rewards': return json(await economyOrderRewards(env, uid, body));
        case '/newsletter/subscribe':  return json(await newsletterSubscribe(env, request, uid, body));
        default:                       return json({ error: 'not-found' }, 404);
      }
    }catch(e){
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      console.error(e && e.stack || e);
      return json({ error: 'server' }, 500);
    }
  }
};

// Exportado para testes locais (não afeta o Worker).
export { CATALOG, dayKeySP, normalizePass, addXpToPass, enc, dec };
