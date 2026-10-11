/* ==========================================================================
   api.js — Camada de "API" (agora falando de verdade com o Firebase)
   --------------------------------------------------------------------------
   Toda a UI (app.js) só conversa com este objeto — por isso a migração do
   localStorage para o Firebase só tocou este arquivo e o db.js. Auth vira
   Firebase Authentication; tudo o que era "tabela" no localStorage vira
   coleção no Firestore (veja o cabeçalho de db.js).

   Conteúdo de catálogo (PRODUCTS, em data.js) continua estático — só dado
   gerado pelo usuário (conta, comentários, avaliações, pedidos, carrinho,
   lista de desejos, notificações) foi para o Firestore.

   NEWS (data.js) é o conteúdo de demonstração e continua estático, mas
   getNews()/getArticle() agora mesclam com notícias reais cadastradas pelo
   admin no Firestore (coleção "articles", ver js/db.js) — são as que
   aparecem com botões de editar/remover no painel ADMIN. As notícias
   estáticas de data.js não são editáveis por ali (ficam só no código).
   ========================================================================== */

/* ==========================================================================
   Login com Discord — OAuth2 "implicit grant", 100% client-side.
   --------------------------------------------------------------------------
   Sem backend (Cloud Functions exigiriam o plano Blaze pra chamar a API do
   Discord), então NÃO passamos pelo Firebase Auth nativo. O fluxo é:

   1) startDiscordLogin() manda o navegador pro Discord.
   2) O Discord devolve o usuário pro próprio site, com um access_token
      direto no #fragmento da URL (nunca chega a ir pro servidor).
   3) handleDiscordRedirect() (chamado no boot, em app.js) lê esse token,
      busca os dados do usuário na API do Discord, cria uma sessão anônima
      no Firebase Auth (signInAnonymously — permitido no plano Spark) só
      pra ter um uid, e grava o perfil em users/{uid} do jeito de sempre.

   Importante: client ID de OAuth2 não é segredo (é público por natureza,
   diferente do client secret) — por isso pode ficar aqui no front-end.
   O client SECRET nunca é usado nesse fluxo, porque o implicit grant não
   precisa dele (é o próprio Discord quem exige isso pra flows sem backend).

   Limitação: como não há backend pra validar identidade entre dispositivos,
   isso vira uma sessão por navegador — a mesma pessoa logando pelo Discord
   em outro aparelho ganha um perfil novo, sem ligação com o primeiro.
   ========================================================================== */
const DISCORD_CLIENT_ID = '1545831405936836658';
const DISCORD_SCOPE = 'identify email';

/* URL do Worker que troca o access_token do Discord por um Firebase Custom
   Token com uid ESTÁVEL (discord_<id>) — assim a conta sobrevive a logout,
   outro aparelho ou limpeza do navegador. Código pronto em
   server/nexus-worker.js (Cloudflare Workers, plano grátis, não exige
   Blaze). Enquanto estiver vazio, o app usa o modo antigo (sessão anônima por
   navegador), que PERDE a conta ao sair. */
const DISCORD_TOKEN_ENDPOINT = 'https://nexus-discord-auth.trajano-neves01.workers.dev';
/* O mesmo Worker também faz a economia (moedas/XP/recompensas) e a newsletter. */
const WORKER_URL = DISCORD_TOKEN_ENDPOINT;

const WORKER_ERRORS = {
  auth: 'Sua sessão expirou. Entre novamente.',
  user: 'Usuário não encontrado.',
  level: 'Você ainda não alcançou esse nível.',
  premium: 'Essa recompensa é exclusiva de quem tem o Passe de Batalha.',
  claimed: 'Recompensa já resgatada.',
  reward: 'Não há recompensa nesse nível.',
  coins: 'Você não tem moedas Nexus suficientes.',
  owned: 'Você já desbloqueou esse item.',
  item: 'Item indisponível.',
  email: 'Informe um e-mail válido.',
  unpaid: 'Pedido ainda não confirmado como pago.',
  busy: 'Servidor ocupado, tente de novo em instantes.',
  origin: 'Origem não autorizada.'
};

/* Chama uma rota do Worker com o ID token do Firebase. Lança { message, code }. */
async function workerCall(path, body = {}){
  const user = window.fb && window.fb.auth && window.fb.auth.currentUser;
  if (!user) throw { code: 'auth', message: WORKER_ERRORS.auth };
  let res;
  try{
    const token = await user.getIdToken();
    res = await fetch(WORKER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    });
  }catch(e){
    throw { code: 'network', message: 'Sem conexão com o servidor. Tente novamente.' };
  }
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if (!res.ok){
    const code = data && data.error || 'server';
    throw { code, message: WORKER_ERRORS[code] || 'Não foi possível concluir a ação agora.' };
  }
  return data;
}

// Tenta de novo (com uma pequena espera) quando o Firestore recusa por
// "permission-denied" — usado logo após qualquer login novo, porque às
// vezes a 1ª ou 2ª chamada saem antes do SDK terminar de propagar a sessão
// recém-criada pros outros lugares (o Firestore só vê a sessão via um
// listener interno, que é assíncrono).
async function withPermissionRetry(fn, { retries = 2, delayMs = 350 } = {}){
  for (let attempt = 0; ; attempt++){
    try{
      return await fn();
    }catch(err){
      if (err && err.code === 'permission-denied' && attempt < retries){
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

const Api = {

  /* Escolhe e RESERVA um nome de usuário livre (usado no login social e no
     Discord). Se o nome já existe, acrescenta números até achar um livre. */
  async _pickUsername(base, uid){
    base = (base || 'Jogador').replace(/\s+/g, '').slice(0, 20) || 'Jogador';
    for (let i = 0; i < 6; i++){
      const cand = i === 0 ? base : base.slice(0, 16) + Math.floor(100 + Math.random() * 900);
      try{
        if (!(await DB.isUsernameTaken(cand.toLowerCase()))){
          await DB.claimUsername(cand.toLowerCase(), uid);
          return cand;
        }
      }catch(e){ /* tenta outro */ }
    }
    return base;
  },

  /* -------------------- login com Discord (OAuth2 manual) -------------------- */

  // Chamado pelo clique no botão "Entrar com Discord" — redireciona a página.
  startDiscordLogin(){
    const redirectUri = location.origin + location.pathname;
    const state = Utils.uid('st') + Math.random().toString(36).slice(2);
    try{ sessionStorage.setItem('na_discord_state', state); }catch(e){}
    const url = 'https://discord.com/oauth2/authorize'
      + '?client_id=' + encodeURIComponent(DISCORD_CLIENT_ID)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&response_type=token'
      + '&scope=' + encodeURIComponent(DISCORD_SCOPE)
      + '&state=' + encodeURIComponent(state);
    location.href = url;
  },

  // Chamado uma vez no boot do app (init(), em app.js), ANTES de checar a
  // sessão normal do Firebase. Retorna o usuário público se veio um token
  // de volta do Discord na URL; retorna null se não tinha nada pra processar.
  async handleDiscordRedirect(){
    if (!location.hash) return null;

    const params = new URLSearchParams(location.hash.slice(1));
    const accessToken = params.get('access_token');
    const oauthError = params.get('error');
    const oauthErrorDesc = params.get('error_description');
    // Só processa se o fragmento realmente é uma resposta OAuth do Discord.
    if (!accessToken && !oauthError) return null;
    const returnedState = params.get('state');
    let expectedState = null;
    try{ expectedState = sessionStorage.getItem('na_discord_state'); sessionStorage.removeItem('na_discord_state'); }catch(e){}
    // Limpa o #fragmento da URL pra não deixar o token exposto no histórico
    // do navegador nem processar de novo se a pessoa der F5.
    history.replaceState(null, '', location.pathname + location.search);

    // Proteção contra login CSRF: o "state" que voltou precisa ser o mesmo
    // que geramos em startDiscordLogin() neste navegador.
    if (!expectedState || returnedState !== expectedState){
      Toast.show('Não foi possível validar o login com o Discord. Tente novamente.', 'error', 'alertCircle');
      return null;
    }

    if (oauthError){
      Toast.show(`Discord recusou o login: ${oauthErrorDesc || oauthError}`, 'error', 'alertCircle');
      return null;
    }
    if (!accessToken) return null;

    let discordUser;
    let customToken = null;
    try{
      if (DISCORD_TOKEN_ENDPOINT){
        // O Worker valida o token junto ao Discord (inclusive que ele foi
        // emitido para ESTE app) e devolve os dados + o Custom Token.
        const res = await fetch(DISCORD_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken })
        });
        if (!res.ok) throw new Error('status ' + res.status);
        const data = await res.json();
        discordUser = data.user;
        customToken = data.customToken;
        if (!discordUser || !customToken) throw new Error('resposta inválida');
      } else {
        const res = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error('status ' + res.status);
        discordUser = await res.json();
      }
    }catch(err){
      console.error('Erro ao buscar dados do usuário no Discord:', err);
      Toast.show('Não foi possível entrar com o Discord. Tente novamente.', 'error', 'alertCircle');
      return null;
    }

    if (!discordUser.email){
      Toast.show('Não foi possível obter seu e-mail do Discord. Verifique se ele está confirmado na sua conta Discord e tente de novo.', 'error', 'alertCircle');
      return null;
    }

    // Cria (ou reaproveita) a sessão anônima do Firebase Auth que serve de
    // "uid" pra pendurar o perfil no Firestore. Sempre força a renovação do
    // token antes de tocar no Firestore — mesmo reaproveitando uma sessão já
    // aberta — porque sem isso a primeira leitura/escrita pode sair antes do
    // SDK terminar de propagar a sessão, e o Firestore recusa com
    // "permissão insuficiente" mesmo a sessão sendo válida.
    const ensureSession = async () => {
      let user = window.fb.auth.currentUser;
      if (customToken){
        const cred = await window.fb.signInWithCustomToken(window.fb.auth, customToken);
        user = cred.user;
      } else if (!user){
        const cred = await window.fb.signInAnonymously(window.fb.auth);
        user = cred.user;
      }
      await user.getIdToken(true);
      return user;
    };

    let fbUser;
    let profile;
    try{
      fbUser = await ensureSession();
      profile = await withPermissionRetry(() => DB.getUserById(fbUser.uid));
    }catch(err){
      if (err.code === 'permission-denied'){
        // Sessão existente inválida por algum motivo (ex.: apagada na mão
        // no console do Firebase durante testes) — descarta e recomeça.
        try{
          await window.fb.signOut(window.fb.auth).catch(() => {});
          const cred = customToken
            ? await window.fb.signInWithCustomToken(window.fb.auth, customToken)
            : await window.fb.signInAnonymously(window.fb.auth);
          await cred.user.getIdToken(true);
          fbUser = cred.user;
          profile = await withPermissionRetry(() => DB.getUserById(fbUser.uid));
        }catch(err2){
          console.error('Erro ao criar sessão para o login com Discord:', err2);
          Toast.show('Não foi possível iniciar a sessão. Tente novamente.', 'error', 'alertCircle');
          return null;
        }
      } else {
        console.error('Erro ao criar sessão para o login com Discord:', err);
        Toast.show('Não foi possível iniciar a sessão. Tente novamente.', 'error', 'alertCircle');
        return null;
      }
    }

    try{
      if (!profile){
        const avatarUrl = discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : null;
        const username = await this._pickUsername(discordUser.global_name || discordUser.username, fbUser.uid);
        const tag = String(Math.floor(1000 + Math.random() * 9000));
        const bg = BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
        const newProfile = {
          username, usernameLower: username.toLowerCase(),
          tag, email: discordUser.email, emailLower: discordUser.email.toLowerCase(),
          avatar: avatarUrl || Utils.avatarDataUri(username, bg),
          banner: bg,
          bannerImage: null,
          customStatus: '',
          badges: ['founder'],
          coins: 0,
          activeFrame: null,
          unlockedFrames: [],
          authProvider: 'discord',
          discordId: discordUser.id,
          createdAt: new Date().toISOString()
        };
        profile = await withPermissionRetry(() => DB.upsertUser(fbUser.uid, newProfile));
      }
    }catch(err){
      console.error('Erro ao salvar perfil do Discord no Firestore:', err);
      Toast.show('Não foi possível salvar seu perfil. Tente novamente.', 'error', 'alertCircle');
      return null;
    }
    return this._publicUser(profile);
  },

  /* ============================== AUTH ============================== */

  async register({ username, email, password }){
    username = username.trim();
    email = email.trim();

    if (!username || username.length < 3){
      throw { field: 'username', message: 'O nome de usuário precisa ter ao menos 3 caracteres.' };
    }
    if (!Utils.isValidEmail(email)){
      throw { field: 'email', message: 'Informe um e-mail válido.' };
    }
    const strength = Utils.passwordStrength(password);
    if (strength.score < 2){
      throw { field: 'password', message: 'Senha muito fraca. Combine letras maiúsculas, números e símbolos.' };
    }
    let usernameTaken;
    try{
      usernameTaken = await DB.isUsernameTaken(username.toLowerCase());
    }catch(err){
      console.error('Erro ao checar usuário no Firestore:', err);
      throw { message: `Não foi possível checar o usuário no banco de dados. Código: ${err.code || err.message || 'desconhecido'}.` };
    }
    if (usernameTaken){
      throw { field: 'username', message: 'Este nome de usuário já está em uso.' };
    }

    let cred;
    try{
      cred = await window.fb.createUserWithEmailAndPassword(window.fb.auth, email, password);
    }catch(err){
      if (err.code === 'auth/email-already-in-use'){
        throw { field: 'email', message: 'Já existe uma conta com este e-mail.' };
      }
      if (err.code === 'auth/invalid-email'){
        throw { field: 'email', message: 'Informe um e-mail válido.' };
      }
      if (err.code === 'auth/weak-password'){
        throw { field: 'password', message: 'O Firebase exige senha com pelo menos 6 caracteres.' };
      }
      if (err.code === 'auth/operation-not-allowed'){
        throw { message: 'O login por e-mail/senha não está ativado nesse projeto Firebase. Ative em Authentication → Método de login.' };
      }
      if (err.code === 'auth/configuration-not-found'){
        throw { message: 'A Authentication ainda não foi inicializada nesse projeto Firebase. Abra a aba Authentication no console e clique em "Vamos começar" antes de ativar o provedor.' };
      }
      if (err.code === 'auth/network-request-failed'){
        throw { message: 'Falha de conexão com o Firebase. Verifique sua internet e tente novamente.' };
      }
      console.error('Erro no cadastro (Firebase Auth):', err);
      throw { message: `Não foi possível criar a conta. Código do erro: ${err.code || err.message || 'desconhecido'}.` };
    }

    // Reserva o nome de usuário. Se alguém pegou no meio tempo, desfaz a
    // conta recém-criada para não sobrar uma conta sem perfil.
    try{
      if (await DB.isUsernameTaken(username.toLowerCase())) throw { code: 'taken' };
      await DB.claimUsername(username.toLowerCase(), cred.user.uid);
    }catch(err){
      await window.fb.fbDeleteUser(cred.user).catch(() => {});
      if (err && err.code === 'taken') throw { field: 'username', message: 'Este nome de usuário já está em uso.' };
      throw { message: `Não foi possível reservar o nome de usuário. Código: ${err.code || 'desconhecido'}.` };
    }

    try{ await window.fb.fbUpdateProfile(cred.user, { displayName: username }); }catch(e){}
    // E-mail de verificação (necessário, por exemplo, para contas admin).
    try{ await window.fb.sendEmailVerification(cred.user); }catch(e){}

    const tag = String(Math.floor(1000 + Math.random() * 9000));
    const bg = BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
    const profile = {
      username, usernameLower: username.toLowerCase(),
      tag, email, emailLower: email.toLowerCase(),
      avatar: Utils.avatarDataUri(username, bg),
      banner: bg,
      bannerImage: null,
      customStatus: '',
      badges: ['founder'],
      coins: 0,
      activeFrame: null,
      unlockedFrames: [],
      createdAt: new Date().toISOString()
    };
    try{
      await DB.upsertUser(cred.user.uid, profile);
    }catch(err){
      await DB.releaseUsername(username.toLowerCase());
      await window.fb.fbDeleteUser(cred.user).catch(() => {});
      throw { message: `Não foi possível salvar seu perfil. Tente de novo. Código: ${err.code || 'desconhecido'}.` };
    }
    return this._publicUser({ id: cred.user.uid, ...profile });
  },

  /* ---------------- login social (OAuth2) ---------------- */
  async loginWithProvider(providerKey){
    const providerMap = {
      google: window.fb.googleProvider,
      x: window.fb.twitterProvider
      // discord fica de fora: usa o fluxo manual (startDiscordLogin /
      // handleDiscordRedirect), não o signInWithPopup do Firebase.
    };
    const provider = providerMap[providerKey];
    if (!provider) throw { message: 'Provedor de login não suportado.' };

    let result;
    try{
      result = await window.fb.signInWithPopup(window.fb.auth, provider);
    }catch(err){
      if (err.code === 'auth/operation-not-allowed'){
        throw { message: 'Esse provedor de login ainda não foi ativado no Firebase. Ative em Authentication → Método de login.' };
      }
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request'){
        throw { message: 'Login cancelado.' };
      }
      if (err.code === 'auth/account-exists-with-different-credential'){
        throw { message: 'Já existe uma conta com este e-mail usando outro método de login. Entre com e-mail e senha (ou o provedor original).' };
      }
      console.error('Erro no login social:', err);
      throw { message: `Não foi possível entrar com essa rede. Código do erro: ${err.code || err.message || 'desconhecido'}.` };
    }

    const fbUser = result.user;

    if (!fbUser.email){
      // X/Discord nem sempre devolvem e-mail — mantém o e-mail obrigatório
      // em qualquer forma de cadastro, igual ao fluxo de e-mail/senha.
      await window.fb.fbDeleteUser(fbUser).catch(() => {});
      throw { message: 'Não foi possível obter seu e-mail nesse provedor. Tente outro método de login ou libere a permissão de e-mail na tela de autorização.' };
    }

    let profile = await DB.getUserById(fbUser.uid);
    if (!profile){
      const username = await this._pickUsername(fbUser.displayName || fbUser.email.split('@')[0], fbUser.uid);
      const tag = String(Math.floor(1000 + Math.random() * 9000));
      const bg = BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
      const newProfile = {
        username, usernameLower: username.toLowerCase(),
        tag, email: fbUser.email, emailLower: fbUser.email.toLowerCase(),
        avatar: fbUser.photoURL || Utils.avatarDataUri(username, bg),
        banner: bg,
        bannerImage: null,
        customStatus: '',
        badges: ['founder'],
        coins: 0,
        activeFrame: null,
        unlockedFrames: [],
        authProvider: providerKey,
        createdAt: new Date().toISOString()
      };
      profile = await DB.upsertUser(fbUser.uid, newProfile);
    }
    return this._publicUser(profile);
  },

  async login({ identifier, password }){
    identifier = (identifier || '').trim();
    if (!identifier){
      throw { field: 'identifier', message: 'Informe seu e-mail ou usuário.' };
    }

    // Login por nome de usuário foi removido: resolver nome -> e-mail exigiria
    // deixar a coleção "users" (com e-mails) legível publicamente.
    if (!Utils.isValidEmail(identifier)){
      throw { field: 'identifier', message: 'Entre com o e-mail da sua conta.' };
    }
    const email = identifier;

    let cred;
    try{
      cred = await window.fb.signInWithEmailAndPassword(window.fb.auth, email, password);
    }catch(err){
      if (['auth/wrong-password', 'auth/invalid-credential', 'auth/user-not-found'].includes(err.code)){
        throw { field: 'password', message: 'Senha incorreta. Tente novamente.' };
      }
      if (err.code === 'auth/too-many-requests'){
        throw { message: 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.' };
      }
      if (err.code === 'auth/network-request-failed'){
        throw { message: 'Falha de conexão com o Firebase. Verifique sua internet e tente novamente.' };
      }
      console.error('Erro no login (Firebase Auth):', err);
      throw { message: `Não foi possível entrar. Código do erro: ${err.code || err.message || 'desconhecido'}.` };
    }

    const profile = await DB.getUserById(cred.user.uid);
    if (!profile){
      throw { message: 'Conta autenticada, mas o perfil não foi encontrado no banco de dados.' };
    }
    return this._publicUser(profile);
  },

  async logout(){
    await window.fb.signOut(window.fb.auth);
    return true;
  },

  /* Envia o e-mail de redefinição de senha do Firebase Auth. Aceita e-mail
     OU usuário (mesma resolução usada no login). Por segurança, NUNCA
     revela se a conta existe ou não: tanto no caso de sucesso quanto no
     caso de "não achei essa conta", a mensagem devolvida ao chamador é
     genérica — assim ninguém consegue usar esse campo pra descobrir quais
     e-mails/usuários estão cadastrados na base (enumeração de contas). */
  async forgotPassword(identifier){
    identifier = (identifier || '').trim();
    if (!identifier){
      throw { field: 'identifier', message: 'Informe o e-mail da sua conta.' };
    }

    const email = Utils.isValidEmail(identifier) ? identifier : null;

    if (email){
      try{
        await window.fb.sendPasswordResetEmail(window.fb.auth, email);
      }catch(err){
        // auth/user-not-found é esperado quando o e-mail não existe no Auth
        // (ex.: ficou órfão no Firestore) — engolimos silenciosamente para
        // manter a mensagem genérica. Outros erros (rede, etc.) sobem.
        if (err.code && err.code !== 'auth/user-not-found'){
          if (err.code === 'auth/too-many-requests'){
            throw { message: 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.' };
          }
          if (err.code === 'auth/network-request-failed'){
            throw { message: 'Falha de conexão com o Firebase. Verifique sua internet e tente novamente.' };
          }
          console.error('Erro ao enviar redefinição de senha:', err);
        }
      }
    }

    return true;
  },

  /* Resolve o usuário da sessão atual de forma assíncrona (Firebase Auth
     restaura a sessão via callback, não dá pra checar isso de forma
     síncrona como era com localStorage). Use uma vez, no carregamento
     inicial do app. */
  /* ==========================================================================
     BÔNUS DIÁRIO — moedas Nexus grátis
     --------------------------------------------------------------------------
     Regra: 1 crédito por conta a cada 24h (baseado em data de calendário,
     não em "últimas 24h" corridas, para não dar brecha de ficar reivindicando
     de 5 em 5 minutos perto da virada). Valor pequeno de propósito, para não
     inflacionar a economia da Loja de Recompensas (que hoje custa moedas
     compradas com dinheiro real via pacote p9).
     ========================================================================== */
  DAILY_BONUS_AMOUNT: 15,

  /* O servidor decide (dia de calendário de São Paulo, valor, sequência). */
  async claimDailyBonus(userId){
    return workerCall('/economy/daily');
  },

  onAuthReady(){
    return new Promise((resolve) => {
      const unsubscribe = window.fb.onAuthStateChanged(window.fb.auth, async (fbUser) => {
        unsubscribe();
        if (!fbUser){ resolve(null); return; }
        const profile = await DB.getUserById(fbUser.uid);
        resolve(profile ? this._publicUser(profile) : null);
      });
    });
  },

  async updateProfile(userId, patch){
    const profile = await DB.upsertUser(userId, patch);
    if (!profile) throw { field: null, message: 'Usuário não encontrado.' };
    return this._publicUser(profile);
  },

  _publicUser(user){
    const { usernameLower, emailLower, ...rest } = user;
    return rest;
  },

  /* Como a sessão atual foi criada: 'password' | 'google' | 'x' | 'other'
     (Discord e sessões anônimas caem em 'other'). */
  getAuthMethod(){
    const u = window.fb.auth.currentUser;
    const id = u && u.providerData && u.providerData[0] && u.providerData[0].providerId;
    if (id === 'password') return 'password';
    if (id === 'google.com') return 'google';
    if (id === 'twitter.com') return 'x';
    return 'other';
  },

  /* Garante que o nome de usuário da conta esteja reservado em usernames/.
     Contas criadas antes da coleção existir ganham a reserva no próximo login
     (se o nome ainda estiver livre). Silencioso: nunca quebra o boot. */
  async ensureUsernameClaim(user){
    try{
      if (!user || !user.username) return;
      const lower = user.username.toLowerCase();
      if (!(await DB.isUsernameTaken(lower))) await DB.claimUsername(lower, user.id);
    }catch(e){ /* sem permissão ou offline: tenta de novo no próximo login */ }
  },

  async changePassword(userId, currentPassword, newPassword){
    if (this.getAuthMethod() !== 'password'){
      throw { message: 'Sua conta entra por Google, X ou Discord — a senha é gerenciada por esse serviço.' };
    }
    const strength = Utils.passwordStrength(newPassword);
    if (strength.score < 2){
      throw { field: 'new', message: 'A nova senha é muito fraca.' };
    }
    const fbUser = window.fb.auth.currentUser;
    if (!fbUser) throw { message: 'Sessão expirada. Entre novamente.' };

    try{
      const cred = window.fb.EmailAuthProvider.credential(fbUser.email, currentPassword);
      await window.fb.reauthenticateWithCredential(fbUser, cred);
    }catch(err){
      throw { field: 'current', message: 'Senha atual incorreta.' };
    }
    await window.fb.updatePassword(fbUser, newPassword);
    return true;
  },

  /* ============================== NOTÍCIAS ============================== */

  async getNews(category){
    const [custom, likeCounts, commentCounts] = await Promise.all([
      DB.getArticles(),
      DB.getAllArticleLikeCounts().catch(() => ({})),
      DB.getAllArticleCommentCounts().catch(() => ({}))
    ]);
    const merged = [
      ...custom.map(a => ({ ...a, isCustom: true })),
      ...NEWS.map(n => ({ ...n, isCustom: false }))
    ].sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0));
    const list = merged.filter(n => !category || category === 'todos' || n.category === category);
    // Curtidas e comentários dos usuários somam aos números base da notícia.
    return list.map(n => ({
      ...n,
      likeCount: (n.likes || 0) + (likeCounts[n.id] || 0),
      comments: (n.comments || 0) + (commentCounts[n.id] || 0)
    }));
  },

  /* -------------------- notícias reais (admin) -------------------- */
  async createArticle({ category, title, excerpt, content, author, readTime, coverImage }){
    if (!title || !title.trim()) throw { message: 'Dê um título para a notícia.' };
    if (!excerpt || !excerpt.trim()) throw { message: 'Escreva um resumo curto.' };
    if (!content || !content.length) throw { message: 'Escreva o conteúdo da notícia.' };
    const wordCount = content.join(' ').trim().split(/\s+/).length;
    const payload = {
      category: category || 'geral',
      title: title.trim(),
      excerpt: excerpt.trim(),
      content,
      author: (author || '').trim() || 'Redação Nexus',
      readTime: readTime || Math.max(1, Math.round(wordCount / 200)),
      coverImage: coverImage ? coverImage.trim() : null,
      likes: 0,
      comments: 0,
      createdAt: new Date().toISOString()
    };
    return DB.createArticle(payload);
  },
  async updateArticle(id, { category, title, excerpt, content, author, readTime, coverImage }){
    if (!title || !title.trim()) throw { message: 'Dê um título para a notícia.' };
    if (!excerpt || !excerpt.trim()) throw { message: 'Escreva um resumo curto.' };
    if (!content || !content.length) throw { message: 'Escreva o conteúdo da notícia.' };
    await DB.updateArticle(id, {
      category: category || 'geral',
      title: title.trim(),
      excerpt: excerpt.trim(),
      content,
      author: (author || '').trim() || 'Redação Nexus',
      readTime: readTime || Math.max(1, Math.round(content.join(' ').trim().split(/\s+/).length / 200)),
      coverImage: coverImage ? coverImage.trim() : null
    });
  },
  async deleteArticle(id){
    await DB.deleteArticle(id);
  },
  async getCustomArticles(){
    const list = await DB.getArticles();
    return list.sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0));
  },

  async subscribeNewsletter(email){
    email = email.trim().toLowerCase();
    if (!Utils.isValidEmail(email)){
      throw { message: 'Informe um e-mail válido.' };
    }
    // Double opt-in: o servidor manda um e-mail de confirmação; só entra na
    // lista quando a pessoa clica no link. Devolve 'sent' | 'wait' | 'already'.
    const r = await workerCall('/newsletter/subscribe', { email });
    return r.status;
  },

  async getArticle(id){
    let art = NEWS.find(n => n.id === id);
    let isCustom = false;
    if (!art){
      art = await DB.getArticleById(id);
      isCustom = true;
    }
    if (!art) throw { message: 'Notícia não encontrada.' };
    const likeIds = await DB.getArticleLikeIds(id);
    return { ...art, isCustom, likeCount: (art.likes || 0) + likeIds.length };
  },

  async toggleArticleLike(articleId, userId){
    const likeIds = await DB.getArticleLikeIds(articleId);
    const has = likeIds.includes(userId);
    await DB.toggleArticleLike(articleId, userId, !has);
    return { liked: !has, count: has ? likeIds.length - 1 : likeIds.length + 1 };
  },

  async getComments(articleId){
    const list = await DB.getCommentsByArticle(articleId);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addComment(articleId, user, text, parentId = null){
    text = text.trim();
    if (!text) throw { message: 'Escreva algo antes de comentar.' };
    if (text.length > 500) throw { message: 'Comentário muito longo (máx. 500 caracteres).' };
    const saved = await DB.addComment({
      articleId,
      parentId: parentId || null,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      text,
      createdAt: new Date().toISOString(),
      likes: []
    });
    DB.bumpCommentCount(articleId, 1).catch(() => {});
    return saved;
  },

  async toggleCommentLike(commentId, userId){
    const c = await DB.getCommentById(commentId);
    if (!c) throw { message: 'Comentário não encontrado.' };
    const likes = c.likes || [];
    const has = likes.includes(userId);
    await DB.toggleCommentLike(commentId, userId, !has);
    return { liked: !has, count: has ? likes.length - 1 : likes.length + 1 };
  },

  async deleteComment(commentId, userId){
    const c = await DB.getCommentById(commentId);
    if (!c) throw { message: 'Comentário não encontrado.' };
    if (c.userId !== userId) throw { message: 'Você só pode remover seus próprios comentários.' };
    await DB.deleteComment(commentId);
    DB.bumpCommentCount(c.articleId, -1).catch(() => {});
    return true;
  },

  /* ============================== LOJA ============================== */

  async getProducts(category){
    return PRODUCTS.filter(p => !category || category === 'todos' || p.category === category);
  },

  async getProduct(id){
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) throw { message: 'Produto não encontrado.' };
    return p;
  },

  /* ---------------- carrinho ---------------- */
  async getCart(ownerKey){
    return withPermissionRetry(() => DB.getCart(ownerKey));
  },

  async saveCart(ownerKey, items){
    return DB.saveCart(ownerKey, items);
  },

  async placeOrder(ownerKey, order){
    const orderNumber = Utils.uid('order').toUpperCase();
    const record = await DB.addOrder({ ownerKey, orderNumber, ...order, createdAt: new Date().toISOString() });
    await DB.saveCart(ownerKey, []);
    return { ...record, id: orderNumber, docId: record.id };
  },

  async getOrderHistory(ownerKey){
    const list = await DB.getOrdersByOwner(ownerKey);
    return list
      .map(o => ({ ...o, docId: o.id, id: o.orderNumber || o.id }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async hasPurchased(ownerKey, productId){
    const orders = await DB.getOrdersByOwner(ownerKey);
    return orders.some(o => (o.items || []).some(i => i.productId === productId));
  },

  /* ---------------- lista de desejos ---------------- */
  async getWishlist(ownerKey){
    return withPermissionRetry(() => DB.getWishlist(ownerKey));
  },

  async toggleWishlist(ownerKey, productId){
    const list = await DB.getWishlist(ownerKey);
    const has = list.includes(productId);
    const updated = has ? list.filter(id => id !== productId) : [...list, productId];
    await DB.saveWishlist(ownerKey, updated);
    return { inWishlist: !has, list: updated };
  },

  /* ---------------- notícias salvas (bookmarks) ---------------- */
  async getBookmarks(ownerKey){
    return withPermissionRetry(() => DB.getBookmarks(ownerKey));
  },

  async toggleBookmark(ownerKey, articleId){
    const list = await DB.getBookmarks(ownerKey);
    const has = list.includes(articleId);
    const updated = has ? list.filter(id => id !== articleId) : [...list, articleId];
    await DB.saveBookmarks(ownerKey, updated);
    return { bookmarked: !has, list: updated };
  },

  /* ---------------- passe de batalha ---------------- */
  /* Só leitura: o documento do passe é escrito pelo Worker. Sem documento (ou
     de temporada antiga) devolve um passe zerado em memória. */
  async getSeasonPass(ownerKey){
    return withPermissionRetry(async () => {
      const season = BATTLE_PASS_SEASON;
      const pass = await DB.getSeasonPass(ownerKey);
      if (!pass || pass.seasonId !== season.id){
        return { seasonId: season.id, xp: 0, level: 1, hasPremium: false, claimedFree: [], claimedPremium: [] };
      }
      return { claimedFree: [], claimedPremium: [], ...pass };
    });
  },

  /* kind: 'like' | 'share' | 'bookmark' — o valor de XP e o teto diário são do servidor. */
  async grantSeasonXp(ownerKey, kind){
    const r = await workerCall('/economy/xp', { kind });
    return { pass: r.pass, leveledUp: !!r.leveledUp };
  },

  async claimSeasonReward(ownerKey, level, track){
    return workerCall('/economy/claim', { level, track });
  },

  /* Compra um item da Loja de Recompensas; devolve os campos de economia do perfil. */
  async unlockReward(type, key){
    return workerCall('/economy/unlock', { type, key });
  },

  /* Credita moedas/passe/emblema do pedido (idempotente no servidor). */
  async claimOrderRewards(orderDocId){
    return workerCall('/economy/order-rewards', { orderId: orderDocId });
  },

  /* ---------------- avaliações de produtos ---------------- */
  async getReviews(productId){
    const list = await DB.getReviewsByProduct(productId);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addReview(productId, user, { rating, text }){
    rating = Number(rating);
    text = (text || '').trim();
    if (!rating || rating < 1 || rating > 5){
      throw { field: 'rating', message: 'Escolha uma nota de 1 a 5 estrelas.' };
    }
    if (text.length < 5){
      throw { field: 'text', message: 'Escreva um comentário um pouco mais detalhado.' };
    }
    if (text.length > 400){
      throw { field: 'text', message: 'Comentário muito longo (máx. 400 caracteres).' };
    }

    const existing = await DB.findReview(productId, user.id);
    const verified = await this.hasPurchased(user.id, productId);
    const data = {
      productId, userId: user.id, username: user.username, avatar: user.avatar,
      rating, text, verified, createdAt: new Date().toISOString()
    };
    return DB.upsertReview(existing ? existing.id : null, data);
  },

  async deleteReview(reviewId, userId){
    const r = await DB.getReviewById(reviewId);
    if (!r) throw { message: 'Avaliação não encontrada.' };
    if (r.userId !== userId) throw { message: 'Você só pode remover suas próprias avaliações.' };
    await DB.deleteReview(reviewId);
    return true;
  },

  /* ---------------- cupom de desconto ---------------- */
  async applyCoupon(code){
    const found = COUPONS.find(c => c.code === String(code).trim().toUpperCase());
    if (!found){
      throw { message: 'Cupom inválido ou expirado.' };
    }
    return found;
  },

  /* ==========================================================================
     CENTRAL DA COMUNIDADE
     --------------------------------------------------------------------------
     Posts de notícia OU vídeo enviados por qualquer usuário logado. Todo post
     nasce com status 'pending' e só aparece no feed público depois que um
     admin aprova (ver approveCommunityPost/rejectCommunityPost). A validação
     "de verdade" (quem pode aprovar, quem pode editar o quê) está no
     firestore.rules — o que está aqui é validação de formulário/UX, não
     segurança.
     ========================================================================== */

  async getCommunityFeed(){
    const list = await DB.getApprovedCommunityPosts();
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async getMyCommunityPosts(userId){
    const list = await DB.getCommunityPostsByAuthor(userId);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async getPendingCommunityPosts(){
    const list = await DB.getPendingCommunityPosts();
    return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  async getArticleHighlights(articleId){
    const list = await DB.getHighlightsByArticle(articleId);
    return list.sort((a, b) => (this._score(b) - this._score(a)));
  },

  // Destaques agregados pra Central (todos os vídeos aprovados marcados
  // como "Melhor Momento", tenham ou não notícia vinculada), ordenados
  // pelos mais votados.
  async getAggregatedHighlights(){
    const all = await DB.getApprovedCommunityPosts();
    return all
      .filter(p => p.type === 'video' && p.isHighlight)
      .sort((a, b) => this._score(b) - this._score(a))
      .slice(0, 12);
  },

  _score(post){
    return (post.upvotes ? post.upvotes.length : 0) - (post.downvotes ? post.downvotes.length : 0);
  },

  // Cria o post. Vídeos são sempre por link externo (YouTube/Twitch/Kick) —
  // sem upload de arquivo, porque isso exigiria Firebase Storage, que no
  // plano Spark (gratuito) agora fica atrás do plano Blaze.
  async createCommunityPost(user, { type, title, body, game, videoUrl, relatedArticleId, isHighlight }){
    title = (title || '').trim();
    body = (body || '').trim();
    if (!title) throw { field: 'title', message: 'Dê um título para o post.' };
    if (title.length > 120) throw { field: 'title', message: 'Título muito longo (máx. 120 caracteres).' };
    if (type !== 'news' && type !== 'video') throw { message: 'Tipo de post inválido.' };
    if (type === 'news' && !body) throw { field: 'body', message: 'Escreva o conteúdo da notícia.' };
    if (body.length > 5000) throw { field: 'body', message: 'Texto muito longo (máx. 5000 caracteres).' };

    let finalVideoUrl = null;
    if (type === 'video'){
      videoUrl = Utils.safeHttpUrl(videoUrl);
      if (!videoUrl) throw { field: 'video', message: 'Cole um link de vídeo válido (começando com http/https, sem espaços ou aspas).' };
      finalVideoUrl = videoUrl;
    }

    const post = {
      type,
      title,
      body: type === 'news' ? body : (body || ''),
      game: game || null,
      videoSource: type === 'video' ? 'link' : null,
      videoUrl: finalVideoUrl,
      videoStoragePath: null,
      relatedArticleId: relatedArticleId || null,
      isHighlight: type === 'video' ? !!isHighlight : false,
      authorId: user.id,
      authorUsername: user.username,
      authorAvatar: user.avatar,
      status: 'pending',
      rejectionReason: null,
      upvotes: [],
      downvotes: [],
      createdAt: new Date().toISOString(),
      approvedAt: null
    };
    return DB.createCommunityPost(post);
  },

  async approveCommunityPost(postId){
    await DB.updateCommunityPost(postId, { status: 'approved', approvedAt: new Date().toISOString(), rejectionReason: null });
  },

  async rejectCommunityPost(postId, reason){
    await DB.updateCommunityPost(postId, { status: 'rejected', rejectionReason: (reason || '').trim() || 'Não especificado.' });
  },

  async deleteCommunityPost(post){
    await DB.deleteCommunityPost(post.id);
  },

  // direction: 'up' | 'down'. Chamar de novo com a mesma direção remove o
  // voto (toggle); chamar com a direção oposta troca o voto.
  async voteCommunityPost(postId, userId, direction){
    const post = await DB.getCommunityPostById(postId);
    if (!post) throw { message: 'Post não encontrado.' };
    const upvoted = (post.upvotes || []).includes(userId);
    const downvoted = (post.downvotes || []).includes(userId);

    if (direction === 'up'){
      await DB.toggleCommunityVote(postId, userId, upvoted ? null : 'up');
    } else {
      await DB.toggleCommunityVote(postId, userId, downvoted ? null : 'down');
    }
    return DB.getCommunityPostById(postId);
  },

  async getCommunityPostComments(postId){
    const list = await DB.getCommentsByCommunityPost(postId);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addCommunityPostComment(postId, user, text){
    text = (text || '').trim();
    if (!text) throw { message: 'Escreva algo antes de comentar.' };
    if (text.length > 500) throw { message: 'Comentário muito longo (máx. 500 caracteres).' };
    return DB.addComment({
      communityPostId: postId,
      articleId: null,
      parentId: null,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      text,
      createdAt: new Date().toISOString(),
      likes: []
    });
  },

  /* ============================== NOTIFICAÇÕES ============================== */

  async getNotifications(ownerKey){
    const list = await withPermissionRetry(() => DB.getNotifications(ownerKey));
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addNotification(ownerKey, { type = 'info', title, message, meta = null }){
    await DB.addNotification({ ownerKey, type, title, message, meta, read: false, createdAt: new Date().toISOString() });
    return this.getNotifications(ownerKey);
  },

  async markNotificationRead(ownerKey, notifId){
    await DB.markNotificationRead(notifId);
    return this.getNotifications(ownerKey);
  },

  async markAllNotificationsRead(ownerKey){
    await DB.markAllNotificationsRead(ownerKey);
    return this.getNotifications(ownerKey);
  },

  /* ============================== CONTA ============================== */

  async exportAccountData(userId){
    const user = await DB.getUserById(userId);
    if (!user) throw { message: 'Usuário não encontrado.' };
    const [orders, wishlist, bookmarks, cart, comments, reviews, notifications] = await Promise.all([
      DB.getOrdersByOwner(userId),
      DB.getWishlist(userId),
      DB.getBookmarks(userId),
      DB.getCart(userId),
      DB.getCommentsByUser(userId),
      DB.getReviewsByUser(userId),
      DB.getNotifications(userId)
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: this._publicUser(user),
      orders, wishlist, bookmarks, cart, comments, reviews, notifications
    };
  },

  async deleteAccount(userId, password){
    const fbUser = window.fb.auth.currentUser;
    if (!fbUser) throw { message: 'Sessão expirada. Entre novamente.' };

    // 1) Confirma a identidade ANTES de apagar qualquer coisa (se isso falhar,
    //    nada foi tocado). O método depende de como a pessoa entra.
    const method = this.getAuthMethod();
    try{
      if (method === 'password'){
        const cred = window.fb.EmailAuthProvider.credential(fbUser.email, password);
        await window.fb.reauthenticateWithCredential(fbUser, cred);
      } else if (method === 'google' || method === 'x'){
        await window.fb.reauthenticateWithPopup(fbUser, method === 'google' ? window.fb.googleProvider : window.fb.twitterProvider);
      } else {
        // Discord/sessão personalizada: não há como reautenticar sem refazer o
        // login. O Firebase só aceita excluir a conta com login recente.
        const last = Date.parse(fbUser.metadata && fbUser.metadata.lastSignInTime) || 0;
        if (Date.now() - last > 4 * 60 * 1000){
          throw { code: 'na/stale' };
        }
      }
    }catch(err){
      if (err && err.code === 'na/stale'){
        throw { message: 'Por segurança, saia da conta, entre de novo pelo Discord e peça a exclusão logo em seguida (em até 4 minutos).' };
      }
      if (method === 'password') throw { field: 'password', message: 'Senha incorreta.' };
      if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')){
        throw { message: 'Confirmação cancelada. Nada foi excluído.' };
      }
      throw { message: 'Não foi possível confirmar sua identidade. Nada foi excluído.' };
    }

    // 2) Apaga tudo que pertence à conta (comentários, avaliações, pedidos,
    //    posts, notificações, carrinho...), libera o nome de usuário e só
    //    então o perfil e o login.
    const me = await DB.getUserById(userId);
    const failures = await DB.deleteAllUserContent(userId);
    if (failures.length) console.warn('Exclusão de conta: itens que não puderam ser apagados', failures);
    if (me && me.usernameLower) await DB.releaseUsername(me.usernameLower);
    await DB.deleteUser(userId);

    try{
      await window.fb.fbDeleteUser(fbUser);
    }catch(err){
      throw { message: 'Seus dados foram apagados, mas não foi possível remover o login. Entre de novo e repita a exclusão.' };
    }
    return true;
  }
};
