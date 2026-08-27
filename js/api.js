/* ==========================================================================
   api.js — Camada de "API" (simula chamadas assíncronas a um back-end)
   --------------------------------------------------------------------------
   Cada método devolve uma Promise, tem uma latência artificial e pode
   rejeitar com { field, message }, exatamente como uma API real faria.
   Toda a UI (app.js) só conversa com este objeto — trocar isso por chamadas
   `fetch()` reais para um servidor Node/Express (por exemplo) não exigiria
   mudar nada fora deste arquivo.
   ========================================================================== */

const Api = {

  /* -------------------- seed inicial -------------------- */
  seedIfNeeded(){
    if (DB.isSeeded()) return;

    // Comentários semente em algumas notícias, de "usuários" fictícios do sistema
    const seedAuthors = [
      { name: 'RedShift', bg: '#ff3b5c' },
      { name: 'Kaelen', bg: '#2fd9c7' },
      { name: 'Vhex', bg: '#ffb93d' },
      { name: 'Nyra', bg: '#3fa9ff' }
    ];
    const comments = [];
    ['n1', 'n2', 'n3', 'n4'].forEach((articleId, i) => {
      const a = seedAuthors[i % seedAuthors.length];
      comments.push({
        id: Utils.uid('c'),
        articleId,
        userId: 'system',
        username: a.name,
        avatar: Utils.avatarDataUri(a.name, a.bg),
        text: i % 2 === 0
          ? 'Já esperava essa movimentação, faz sentido com o que vinha rolando nos bastidores.'
          : 'Curioso pra ver como isso muda o meta nas próximas semanas.',
        createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000 * 6).toISOString(),
        likes: []
      });
    });
    DB.saveComments(comments);
    DB.saveArticleLikes({});
    DB.markSeeded();
  },

  /* ============================== AUTH ============================== */

  async register({ username, email, password }){
    await Utils.delay();
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
    if (DB.findUserByEmailOrUsername(email)){
      throw { field: 'email', message: 'Já existe uma conta com este e-mail.' };
    }
    if (DB.findUserByEmailOrUsername(username)){
      throw { field: 'username', message: 'Este nome de usuário já está em uso.' };
    }

    const tag = String(Math.floor(1000 + Math.random() * 9000));
    const bg = BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
    const user = {
      id: Utils.uid('u'),
      username, tag, email,
      passHash: Utils.simpleHash(password),
      avatar: Utils.avatarDataUri(username, bg),
      banner: bg,
      bannerImage: null,
      customStatus: '',
      badges: ['founder'],
      createdAt: new Date().toISOString()
    };
    DB.upsertUser(user);
    DB.setSessionUserId(user.id);
    return this._publicUser(user);
  },

  async login({ identifier, password }){
    await Utils.delay();
    if (!identifier || !identifier.trim()){
      throw { field: 'identifier', message: 'Informe seu e-mail ou usuário.' };
    }
    const user = DB.findUserByEmailOrUsername(identifier);
    if (!user){
      throw { field: 'identifier', message: 'Não encontramos uma conta com esse e-mail ou usuário.' };
    }
    if (user.passHash !== Utils.simpleHash(password)){
      throw { field: 'password', message: 'Senha incorreta. Tente novamente.' };
    }
    DB.upsertUser(user);
    DB.setSessionUserId(user.id);
    return this._publicUser(user);
  },

  async logout(){
    await Utils.delay(150);
    DB.clearSession();
    return true;
  },

  getCurrentUser(){
    const id = DB.getSessionUserId();
    if (!id) return null;
    const user = DB.findUserById(id);
    return user ? this._publicUser(user) : null;
  },

  async updateProfile(userId, patch){
    await Utils.delay(300);
    const user = DB.findUserById(userId);
    if (!user) throw { field: null, message: 'Usuário não encontrado.' };
    Object.assign(user, patch);
    DB.upsertUser(user);
    return this._publicUser(user);
  },

  _publicUser(user){
    const { passHash, ...rest } = user;
    return rest;
  },

  async changePassword(userId, currentPassword, newPassword){
    await Utils.delay(320);
    const user = DB.findUserById(userId);
    if (!user) throw { field: null, message: 'Usuário não encontrado.' };
    if (user.passHash !== Utils.simpleHash(currentPassword)){
      throw { field: 'current', message: 'Senha atual incorreta.' };
    }
    const strength = Utils.passwordStrength(newPassword);
    if (strength.score < 2){
      throw { field: 'new', message: 'A nova senha é muito fraca.' };
    }
    user.passHash = Utils.simpleHash(newPassword);
    DB.upsertUser(user);
    return true;
  },

  /* ============================== NOTÍCIAS ============================== */

  async getNews(category){
    await Utils.delay(260);
    const likesMap = DB.getArticleLikes();
    const list = NEWS.filter(n => !category || category === 'todos' || n.category === category);
    return list.map(n => ({ ...n, likeCount: n.likes + (likesMap[n.id]?.length || 0) }));
  },

  async getArticle(id){
    await Utils.delay(200);
    const art = NEWS.find(n => n.id === id);
    if (!art) throw { message: 'Notícia não encontrada.' };
    const likesMap = DB.getArticleLikes();
    return { ...art, likeCount: art.likes + (likesMap[id]?.length || 0) };
  },

  async toggleArticleLike(articleId, userId){
    await Utils.delay(150);
    const map = DB.getArticleLikes();
    const list = map[articleId] || [];
    const has = list.includes(userId);
    map[articleId] = has ? list.filter(u => u !== userId) : [...list, userId];
    DB.saveArticleLikes(map);
    return { liked: !has, count: map[articleId].length };
  },

  async getComments(articleId){
    await Utils.delay(220);
    return DB.getComments()
      .filter(c => c.articleId === articleId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addComment(articleId, user, text){
    await Utils.delay(260);
    text = text.trim();
    if (!text) throw { message: 'Escreva algo antes de comentar.' };
    if (text.length > 500) throw { message: 'Comentário muito longo (máx. 500 caracteres).' };
    const comment = {
      id: Utils.uid('c'),
      articleId,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      text,
      createdAt: new Date().toISOString(),
      likes: []
    };
    const list = DB.getComments();
    list.push(comment);
    DB.saveComments(list);
    return comment;
  },

  async toggleCommentLike(commentId, userId){
    await Utils.delay(120);
    const list = DB.getComments();
    const c = list.find(x => x.id === commentId);
    if (!c) throw { message: 'Comentário não encontrado.' };
    const has = c.likes.includes(userId);
    c.likes = has ? c.likes.filter(u => u !== userId) : [...c.likes, userId];
    DB.saveComments(list);
    return { liked: !has, count: c.likes.length };
  },

  async deleteComment(commentId, userId){
    await Utils.delay(200);
    const list = DB.getComments();
    const c = list.find(x => x.id === commentId);
    if (!c) throw { message: 'Comentário não encontrado.' };
    if (c.userId !== userId) throw { message: 'Você só pode remover seus próprios comentários.' };
    DB.saveComments(list.filter(x => x.id !== commentId));
    return true;
  },

  /* ============================== LOJA ============================== */

  async getProducts(category){
    await Utils.delay(260);
    return PRODUCTS.filter(p => !category || category === 'todos' || p.category === category);
  },

  async getProduct(id){
    await Utils.delay(150);
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) throw { message: 'Produto não encontrado.' };
    return p;
  },

  async placeOrder(ownerKey, order){
    await Utils.delay(700);
    const record = {
      id: Utils.uid('order').toUpperCase(),
      ownerKey,
      ...order,
      createdAt: new Date().toISOString()
    };
    const list = DB.getOrders();
    list.push(record);
    DB.saveOrders(list);
    DB.saveCart(ownerKey, []);
    return record;
  }
};
