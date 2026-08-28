/* ==========================================================================
   db.js — Camada de "banco de dados" (localStorage)
   --------------------------------------------------------------------------
   Este projeto roda 100% no navegador, então o localStorage faz o papel do
   banco de dados persistente. A camada API (api.js) fala apenas com o
   objeto DB abaixo — se um dia isso virar um back-end real (Node/Express +
   Postgres, por exemplo), só a implementação interna de cada método do DB
   precisa mudar; o resto do app não percebe a diferença.
   ========================================================================== */

const DB = {
  KEYS: {
    USERS: 'na_db_users',
    SESSION: 'na_db_session',
    COMMENTS: 'na_db_comments',
    ARTICLE_LIKES: 'na_db_article_likes',
    ORDERS: 'na_db_orders',
    CART_PREFIX: 'na_db_cart_',
    WISHLIST_PREFIX: 'na_db_wishlist_',
    REVIEWS: 'na_db_reviews',
    NEWSLETTER: 'na_db_newsletter',
    NOTIFICATIONS_PREFIX: 'na_db_notifications_',
    SEEDED: 'na_db_seeded_v1'
  },

  _get(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      console.error('DB read error', key, e);
      return fallback;
    }
  },
  _set(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(e){
      console.error('DB write error', key, e);
      return false;
    }
  },

  // ---- users ----
  getUsers(){ return this._get(this.KEYS.USERS, []); },
  saveUsers(users){ return this._set(this.KEYS.USERS, users); },
  findUserByEmailOrUsername(identifier){
    const id = String(identifier).trim().toLowerCase();
    return this.getUsers().find(u => u.email.toLowerCase() === id || u.username.toLowerCase() === id);
  },
  findUserById(userId){ return this.getUsers().find(u => u.id === userId); },
  upsertUser(user){
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    this.saveUsers(users);
    return user;
  },
  deleteUser(userId){
    const users = this.getUsers().filter(u => u.id !== userId);
    return this.saveUsers(users);
  },

  // ---- session ----
  getSessionUserId(){ return this._get(this.KEYS.SESSION, null); },
  setSessionUserId(userId){ this._set(this.KEYS.SESSION, userId); },
  clearSession(){ this._set(this.KEYS.SESSION, null); },

  // ---- comments ----
  getComments(){ return this._get(this.KEYS.COMMENTS, []); },
  saveComments(list){ return this._set(this.KEYS.COMMENTS, list); },

  // ---- article likes: { [articleId]: [userId, ...] } ----
  getArticleLikes(){ return this._get(this.KEYS.ARTICLE_LIKES, {}); },
  saveArticleLikes(map){ return this._set(this.KEYS.ARTICLE_LIKES, map); },

  // ---- cart (por usuário, ou "guest" quando deslogado) ----
  getCart(ownerKey){ return this._get(this.KEYS.CART_PREFIX + ownerKey, []); },
  saveCart(ownerKey, items){ return this._set(this.KEYS.CART_PREFIX + ownerKey, items); },

  // ---- lista de desejos (por usuário) ----
  getWishlist(ownerKey){ return this._get(this.KEYS.WISHLIST_PREFIX + ownerKey, []); },
  saveWishlist(ownerKey, productIds){ return this._set(this.KEYS.WISHLIST_PREFIX + ownerKey, productIds); },

  // ---- remoção completa dos dados pessoais de um usuário (exclusão de conta) ----
  wipeUserData(ownerKey){
    try{
      localStorage.removeItem(this.KEYS.CART_PREFIX + ownerKey);
      localStorage.removeItem(this.KEYS.WISHLIST_PREFIX + ownerKey);
      localStorage.removeItem(this.KEYS.NOTIFICATIONS_PREFIX + ownerKey);
    }catch(e){ console.error('DB wipe error', e); }
  },

  // ---- avaliações de produtos ----
  getReviews(){ return this._get(this.KEYS.REVIEWS, []); },
  saveReviews(list){ return this._set(this.KEYS.REVIEWS, list); },

  // ---- inscrições da newsletter ----
  getNewsletterSubs(){ return this._get(this.KEYS.NEWSLETTER, []); },
  saveNewsletterSubs(list){ return this._set(this.KEYS.NEWSLETTER, list); },

  // ---- notificações (por usuário) ----
  getNotifications(ownerKey){ return this._get(this.KEYS.NOTIFICATIONS_PREFIX + ownerKey, []); },
  saveNotifications(ownerKey, list){ return this._set(this.KEYS.NOTIFICATIONS_PREFIX + ownerKey, list); },
  clearNotifications(ownerKey){ try{ localStorage.removeItem(this.KEYS.NOTIFICATIONS_PREFIX + ownerKey); }catch(e){} },

  // ---- orders ----
  getOrders(){ return this._get(this.KEYS.ORDERS, []); },
  saveOrders(list){ return this._set(this.KEYS.ORDERS, list); },

  isSeeded(){ return this._get(this.KEYS.SEEDED, false); },
  markSeeded(){ this._set(this.KEYS.SEEDED, true); }
};
