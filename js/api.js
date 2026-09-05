/* ==========================================================================
   api.js — Camada de "API" (agora falando de verdade com o Firebase)
   --------------------------------------------------------------------------
   Toda a UI (app.js) só conversa com este objeto — por isso a migração do
   localStorage para o Firebase só tocou este arquivo e o db.js. Auth vira
   Firebase Authentication; tudo o que era "tabela" no localStorage vira
   coleção no Firestore (veja o cabeçalho de db.js).

   Conteúdo de catálogo (NEWS e PRODUCTS, em data.js) continua estático —
   só dado gerado pelo usuário (conta, comentários, avaliações, pedidos,
   carrinho, lista de desejos, notificações) foi para o Firestore.
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
const DISCORD_CLIENT_ID = 'COLE_AQUI_O_CLIENT_ID_DO_DISCORD';
const DISCORD_SCOPE = 'identify email';

const Api = {

  /* -------------------- login com Discord (OAuth2 manual) -------------------- */

  // Chamado pelo clique no botão "Entrar com Discord" — redireciona a página.
  startDiscordLogin(){
    const redirectUri = location.origin + location.pathname;
    const url = 'https://discord.com/oauth2/authorize'
      + '?client_id=' + encodeURIComponent(DISCORD_CLIENT_ID)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&response_type=token'
      + '&scope=' + encodeURIComponent(DISCORD_SCOPE);
    location.href = url;
  },

  // Chamado uma vez no boot do app (init(), em app.js), ANTES de checar a
  // sessão normal do Firebase. Retorna o usuário público se veio um token
  // de volta do Discord na URL; retorna null se não tinha nada pra processar.
  async handleDiscordRedirect(){
    if (!location.hash || !location.hash.includes('access_token')) return null;

    const params = new URLSearchParams(location.hash.slice(1));
    const accessToken = params.get('access_token');
    // Limpa o #fragmento da URL pra não deixar o token exposto no histórico
    // do navegador nem processar de novo se a pessoa der F5.
    history.replaceState(null, '', location.pathname + location.search);
    if (!accessToken) return null;

    let discordUser;
    try{
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('status ' + res.status);
      discordUser = await res.json();
    }catch(err){
      console.error('Erro ao buscar dados do usuário no Discord:', err);
      Toast.show('Não foi possível entrar com o Discord. Tente novamente.', 'error', 'alertCircle');
      return null;
    }

    if (!discordUser.email){
      Toast.show('Não foi possível obter seu e-mail do Discord. Verifique se ele está confirmado na sua conta Discord e tente de novo.', 'error', 'alertCircle');
      return null;
    }

    // Se já existe uma sessão (anônima ou não) nesse navegador, reaproveita.
    // Só cria uma sessão anônima nova se realmente não tiver nenhuma.
    let fbUser = window.fb.auth.currentUser;
    if (!fbUser){
      try{
        const cred = await window.fb.signInAnonymously(window.fb.auth);
        fbUser = cred.user;
      }catch(err){
        console.error('Erro ao criar sessão anônima:', err);
        Toast.show('Não foi possível iniciar a sessão. Tente novamente.', 'error', 'alertCircle');
        return null;
      }
    }

    let profile = await DB.getUserById(fbUser.uid);
    if (!profile){
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;
      const username = (discordUser.global_name || discordUser.username || 'Jogador').replace(/\s+/g, '').slice(0, 20);
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
      profile = await DB.upsertUser(fbUser.uid, newProfile);
    }
    return this._publicUser(profile);
  },

  /* -------------------- seed inicial (roda 1x só, globalmente) -------------------- */
  async seedIfNeeded(){
    if (await DB.isSeeded()) return;

    const seedAuthors = [
      { name: 'RedShift', bg: '#ff3b5c' },
      { name: 'Kaelen', bg: '#2fd9c7' },
      { name: 'Vhex', bg: '#ffb93d' },
      { name: 'Nyra', bg: '#3fa9ff' }
    ];
    let firstComment = null;
    for (let i = 0; i < 4; i++){
      const articleId = ['n1', 'n2', 'n3', 'n4'][i];
      const a = seedAuthors[i % seedAuthors.length];
      const saved = await DB.addComment({
        articleId,
        parentId: null,
        userId: 'system',
        username: a.name,
        avatar: Utils.avatarDataUri(a.name, a.bg),
        text: i % 2 === 0
          ? 'Já esperava essa movimentação, faz sentido com o que vinha rolando nos bastidores.'
          : 'Curioso pra ver como isso muda o meta nas próximas semanas.',
        createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000 * 6).toISOString(),
        likes: []
      });
      if (i === 0) firstComment = saved;
    }
    if (firstComment){
      await DB.addComment({
        articleId: firstComment.articleId,
        parentId: firstComment.id,
        userId: 'system',
        username: 'Nyra',
        avatar: Utils.avatarDataUri('Nyra', '#3fa9ff'),
        text: 'Concordo, dava pra ver isso vindo desde a última janela de transferências.',
        createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        likes: []
      });
    }

    const reviews = [
      { productId: 'p1', name: 'RedShift', bg: '#ff3b5c', rating: 5, text: 'Sensor extremamente preciso, uso há 3 meses em jogos competitivos e não travou uma vez.' },
      { productId: 'p1', name: 'Vhex', bg: '#ffb93d', rating: 4, text: 'Ótimo mouse, só achei o cabo um pouco rígido no começo, mas depois amacia.' },
      { productId: 'p3', name: 'Kaelen', bg: '#2fd9c7', rating: 5, text: 'Som do switch é viciante e o hot-swap facilitou muito trocar pra um switch mais silencioso.' },
      { productId: 'p5', name: 'Nyra', bg: '#3fa9ff', rating: 4, text: 'Áudio posicional ajudou bastante a identificar passos em jogos táticos.' }
    ];
    for (let i = 0; i < reviews.length; i++){
      const r = reviews[i];
      await DB.upsertReview(null, {
        productId: r.productId,
        userId: 'system',
        username: r.name,
        avatar: Utils.avatarDataUri(r.name, r.bg),
        rating: r.rating,
        text: r.text,
        verified: true,
        createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000 * 30).toISOString()
      });
    }

    await DB.markSeeded();
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
      usernameTaken = await DB.findUserByField('usernameLower', username.toLowerCase());
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

    await window.fb.fbUpdateProfile(cred.user, { displayName: username });

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
    await DB.upsertUser(cred.user.uid, profile);
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
      const username = (fbUser.displayName || fbUser.email.split('@')[0]).replace(/\s+/g, '').slice(0, 20) || 'Jogador';
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

    let email = identifier;
    if (!Utils.isValidEmail(identifier)){
      const found = await DB.findUserByField('usernameLower', identifier.toLowerCase());
      if (!found){
        throw { field: 'identifier', message: 'Não encontramos uma conta com esse e-mail ou usuário.' };
      }
      email = found.email;
    }

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
      throw { field: 'identifier', message: 'Informe seu e-mail ou usuário.' };
    }

    let email = identifier;
    if (!Utils.isValidEmail(identifier)){
      const found = await DB.findUserByField('usernameLower', identifier.toLowerCase());
      email = found ? found.email : null;
    }

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

  async claimDailyBonus(userId){
    const profile = await DB.getUserById(userId);
    if (!profile) throw { message: 'Usuário não encontrado.' };

    const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, fuso do navegador
    if (profile.lastDailyBonus === todayKey){
      return { claimed: false, amount: 0, coins: profile.coins || 0, nextAt: null };
    }

    // Sequência de dias consecutivos (opcional, só para exibir "streak" na UI —
    // não altera o valor da recompensa, mantendo o economy cap intacto).
    const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = profile.lastDailyBonus === yesterdayKey ? (profile.dailyStreak || 0) + 1 : 1;

    const newCoins = (profile.coins || 0) + this.DAILY_BONUS_AMOUNT;
    await DB.upsertUser(userId, {
      coins: newCoins,
      lastDailyBonus: todayKey,
      dailyStreak: streak
    });

    return { claimed: true, amount: this.DAILY_BONUS_AMOUNT, coins: newCoins, streak };
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

  async changePassword(userId, currentPassword, newPassword){
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
    const list = NEWS.filter(n => !category || category === 'todos' || n.category === category);
    return Promise.all(list.map(async n => {
      const likeIds = await DB.getArticleLikeIds(n.id);
      return { ...n, likeCount: n.likes + likeIds.length };
    }));
  },

  async subscribeNewsletter(email){
    email = email.trim().toLowerCase();
    if (!Utils.isValidEmail(email)){
      throw { message: 'Informe um e-mail válido.' };
    }
    await DB.addNewsletterSub(email);
    return true;
  },

  async getArticle(id){
    const art = NEWS.find(n => n.id === id);
    if (!art) throw { message: 'Notícia não encontrada.' };
    const likeIds = await DB.getArticleLikeIds(id);
    return { ...art, likeCount: art.likes + likeIds.length };
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
    return DB.addComment({
      articleId,
      parentId: parentId || null,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      text,
      createdAt: new Date().toISOString(),
      likes: []
    });
  },

  async toggleCommentLike(commentId, userId){
    const c = await DB.getCommentById(commentId);
    if (!c) throw { message: 'Comentário não encontrado.' };
    const has = c.likes.includes(userId);
    await DB.toggleCommentLike(commentId, userId, !has);
    return { liked: !has, count: has ? c.likes.length - 1 : c.likes.length + 1 };
  },

  async deleteComment(commentId, userId){
    const c = await DB.getCommentById(commentId);
    if (!c) throw { message: 'Comentário não encontrado.' };
    if (c.userId !== userId) throw { message: 'Você só pode remover seus próprios comentários.' };
    await DB.deleteComment(commentId);
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
    return DB.getCart(ownerKey);
  },

  async saveCart(ownerKey, items){
    return DB.saveCart(ownerKey, items);
  },

  async placeOrder(ownerKey, order){
    const orderNumber = Utils.uid('order').toUpperCase();
    const record = await DB.addOrder({ ownerKey, orderNumber, ...order, createdAt: new Date().toISOString() });
    await DB.saveCart(ownerKey, []);
    return { ...record, id: orderNumber };
  },

  async getOrderHistory(ownerKey){
    const list = await DB.getOrdersByOwner(ownerKey);
    return list
      .map(o => ({ ...o, id: o.orderNumber || o.id }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async hasPurchased(ownerKey, productId){
    const orders = await DB.getOrdersByOwner(ownerKey);
    return orders.some(o => (o.items || []).some(i => i.productId === productId));
  },

  /* ---------------- lista de desejos ---------------- */
  async getWishlist(ownerKey){
    return DB.getWishlist(ownerKey);
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
    return DB.getBookmarks(ownerKey);
  },

  async toggleBookmark(ownerKey, articleId){
    const list = await DB.getBookmarks(ownerKey);
    const has = list.includes(articleId);
    const updated = has ? list.filter(id => id !== articleId) : [...list, articleId];
    await DB.saveBookmarks(ownerKey, updated);
    return { bookmarked: !has, list: updated };
  },

  /* ---------------- passe de batalha ---------------- */
  async getSeasonPass(ownerKey){
    const season = BATTLE_PASS_SEASON;
    let pass = await DB.getSeasonPass(ownerKey);
    if (!pass || pass.seasonId !== season.id){
      pass = { seasonId: season.id, xp: 0, level: 1, hasPremium: false, claimedFree: [], claimedPremium: [] };
      await DB.saveSeasonPass(ownerKey, pass);
    }
    return pass;
  },

  async grantSeasonXp(ownerKey, amount){
    const season = BATTLE_PASS_SEASON;
    const pass = await this.getSeasonPass(ownerKey);
    pass.xp += amount;
    const newLevel = Math.min(season.maxLevel, 1 + Math.floor(pass.xp / season.xpPerLevel));
    const leveledUp = newLevel > pass.level;
    pass.level = newLevel;
    await DB.saveSeasonPass(ownerKey, pass);
    return { pass, leveledUp };
  },

  async claimSeasonReward(ownerKey, level, track){
    const season = BATTLE_PASS_SEASON;
    const pass = await this.getSeasonPass(ownerKey);
    if (pass.level < level) throw { message: 'Você ainda não alcançou esse nível.' };
    if (track === 'premium' && !pass.hasPremium) throw { message: 'Essa recompensa é exclusiva de quem tem o Passe de Batalha.' };
    const claimedField = track === 'free' ? 'claimedFree' : 'claimedPremium';
    if (pass[claimedField].includes(level)) throw { message: 'Recompensa já resgatada.' };
    const reward = season.rewards[track][level];
    if (!reward) throw { message: 'Não há recompensa nesse nível.' };

    const profile = await DB.getUserById(ownerKey);
    const coins = (profile.coins || 0) + reward.amount;
    await DB.upsertUser(ownerKey, { coins });
    pass[claimedField].push(level);
    await DB.saveSeasonPass(ownerKey, pass);
    return { pass, reward, coins };
  },

  async activateSeasonPremium(ownerKey){
    const pass = await this.getSeasonPass(ownerKey);
    if (!pass.hasPremium){
      pass.hasPremium = true;
      await DB.saveSeasonPass(ownerKey, pass);
    }
    return pass;
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

  /* ============================== NOTIFICAÇÕES ============================== */

  async getNotifications(ownerKey){
    const list = await DB.getNotifications(ownerKey);
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

    try{
      const cred = window.fb.EmailAuthProvider.credential(fbUser.email, password);
      await window.fb.reauthenticateWithCredential(fbUser, cred);
    }catch(err){
      throw { field: 'password', message: 'Senha incorreta.' };
    }

    await DB.wipeUserData(userId);
    await DB.deleteUser(userId);
    await window.fb.fbDeleteUser(fbUser);
    return true;
  }
};
