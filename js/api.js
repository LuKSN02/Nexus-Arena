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
    });
    if (comments[0]){
      comments.push({
        id: Utils.uid('c'),
        articleId: comments[0].articleId,
        parentId: comments[0].id,
        userId: 'system',
        username: 'Nyra',
        avatar: Utils.avatarDataUri('Nyra', '#3fa9ff'),
        text: 'Concordo, dava pra ver isso vindo desde a última janela de transferências.',
        createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        likes: []
      });
    }
    DB.saveComments(comments);
    DB.saveArticleLikes({});

    const reviews = [
      { productId: 'p1', name: 'RedShift', bg: '#ff3b5c', rating: 5, text: 'Sensor extremamente preciso, uso há 3 meses em jogos competitivos e não travou uma vez.' },
      { productId: 'p1', name: 'Vhex', bg: '#ffb93d', rating: 4, text: 'Ótimo mouse, só achei o cabo um pouco rígido no começo, mas depois amacia.' },
      { productId: 'p3', name: 'Kaelen', bg: '#2fd9c7', rating: 5, text: 'Som do switch é viciante e o hot-swap facilitou muito trocar pra um switch mais silencioso.' },
      { productId: 'p5', name: 'Nyra', bg: '#3fa9ff', rating: 4, text: 'Áudio posicional ajudou bastante a identificar passos em jogos táticos.' }
    ];
    DB.saveReviews(reviews.map((r, i) => ({
      id: Utils.uid('rev'),
      productId: r.productId,
      userId: 'system',
      username: r.name,
      avatar: Utils.avatarDataUri(r.name, r.bg),
      rating: r.rating,
      text: r.text,
      verified: true,
      createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000 * 30).toISOString()
    })));

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

  async subscribeNewsletter(email){
    await Utils.delay(400);
    email = email.trim().toLowerCase();
    if (!Utils.isValidEmail(email)){
      throw { message: 'Informe um e-mail válido.' };
    }
    const list = DB.getNewsletterSubs();
    if (!list.includes(email)){
      list.push(email);
      DB.saveNewsletterSubs(list);
    }
    return true;
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

  async addComment(articleId, user, text, parentId = null){
    await Utils.delay(260);
    text = text.trim();
    if (!text) throw { message: 'Escreva algo antes de comentar.' };
    if (text.length > 500) throw { message: 'Comentário muito longo (máx. 500 caracteres).' };
    const comment = {
      id: Utils.uid('c'),
      articleId,
      parentId: parentId || null,
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
  },

  async getOrderHistory(ownerKey){
    await Utils.delay(250);
    return DB.getOrders()
      .filter(o => o.ownerKey === ownerKey)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  hasPurchased(ownerKey, productId){
    return DB.getOrders().some(o => o.ownerKey === ownerKey && (o.items || []).some(i => i.productId === productId));
  },

  /* ---------------- lista de desejos ---------------- */
  async getWishlist(ownerKey){
    await Utils.delay(150);
    return DB.getWishlist(ownerKey);
  },

  async toggleWishlist(ownerKey, productId){
    await Utils.delay(150);
    const list = DB.getWishlist(ownerKey);
    const has = list.includes(productId);
    const updated = has ? list.filter(id => id !== productId) : [...list, productId];
    DB.saveWishlist(ownerKey, updated);
    return { inWishlist: !has, list: updated };
  },

  /* ---------------- avaliações de produtos ---------------- */
  async getReviews(productId){
    await Utils.delay(220);
    return DB.getReviews()
      .filter(r => r.productId === productId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addReview(productId, user, { rating, text }){
    await Utils.delay(300);
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
    const list = DB.getReviews();
    const existing = list.find(r => r.productId === productId && r.userId === user.id);
    const verified = this.hasPurchased(user.id, productId);

    if (existing){
      existing.rating = rating;
      existing.text = text;
      existing.createdAt = new Date().toISOString();
      existing.verified = verified;
      DB.saveReviews(list);
      return existing;
    }
    const review = {
      id: Utils.uid('rev'),
      productId,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      rating, text, verified,
      createdAt: new Date().toISOString()
    };
    list.push(review);
    DB.saveReviews(list);
    return review;
  },

  async deleteReview(reviewId, userId){
    await Utils.delay(200);
    const list = DB.getReviews();
    const r = list.find(x => x.id === reviewId);
    if (!r) throw { message: 'Avaliação não encontrada.' };
    if (r.userId !== userId) throw { message: 'Você só pode remover suas próprias avaliações.' };
    DB.saveReviews(list.filter(x => x.id !== reviewId));
    return true;
  },

  /* ---------------- cupom de desconto ---------------- */
  async applyCoupon(code){
    await Utils.delay(400);
    const found = COUPONS.find(c => c.code === String(code).trim().toUpperCase());
    if (!found){
      throw { message: 'Cupom inválido ou expirado.' };
    }
    return found;
  },

  /* ============================== NOTIFICAÇÕES ============================== */

  async getNotifications(ownerKey){
    await Utils.delay(180);
    return DB.getNotifications(ownerKey).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addNotification(ownerKey, { type = 'info', title, message, meta = null }){
    const list = DB.getNotifications(ownerKey);
    list.push({
      id: Utils.uid('notif'),
      type, title, message, meta,
      read: false,
      createdAt: new Date().toISOString()
    });
    DB.saveNotifications(ownerKey, list);
    return list;
  },

  async markNotificationRead(ownerKey, notifId){
    await Utils.delay(100);
    const list = DB.getNotifications(ownerKey);
    const n = list.find(x => x.id === notifId);
    if (n) n.read = true;
    DB.saveNotifications(ownerKey, list);
    return list;
  },

  async markAllNotificationsRead(ownerKey){
    await Utils.delay(150);
    const list = DB.getNotifications(ownerKey).map(n => ({ ...n, read: true }));
    DB.saveNotifications(ownerKey, list);
    return list;
  },

  /* ============================== CONTA ============================== */

  async exportAccountData(userId){
    await Utils.delay(400);
    const user = DB.findUserById(userId);
    if (!user) throw { message: 'Usuário não encontrado.' };
    const { passHash, ...publicUser } = user;
    return {
      exportedAt: new Date().toISOString(),
      profile: publicUser,
      orders: DB.getOrders().filter(o => o.ownerKey === userId),
      wishlist: DB.getWishlist(userId),
      cart: DB.getCart(userId),
      comments: DB.getComments().filter(c => c.userId === userId),
      reviews: DB.getReviews().filter(r => r.userId === userId),
      notifications: DB.getNotifications(userId)
    };
  },

  async deleteAccount(userId, password){
    await Utils.delay(500);
    const user = DB.findUserById(userId);
    if (!user) throw { message: 'Usuário não encontrado.' };
    if (user.passHash !== Utils.simpleHash(password)){
      throw { field: 'password', message: 'Senha incorreta.' };
    }
    DB.deleteUser(userId);
    DB.wipeUserData(userId);
    DB.clearSession();
    return true;
  }
};
