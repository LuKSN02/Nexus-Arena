/* ==========================================================================
   db.js — Camada de "banco de dados" (Firestore)
   --------------------------------------------------------------------------
   Versão migrada para o Firebase. Toda função aqui fala com o Firestore
   através da ponte em window.fb (definida em firebase-init.js). api.js
   continua sendo a única camada que app.js conhece — nada na UI precisa
   saber que o banco agora é o Firestore em vez do localStorage.

   Única exceção: o carrinho de um usuário "guest" (não logado) continua no
   localStorage, porque o app inteiro fica atrás da tela de login e esse
   caminho só existe por uma fração de segundo durante o carregamento
   inicial — não vale a pena gastar uma escrita no Firestore para isso.

   Coleções usadas no Firestore:
     users/{uid}              — perfil (sem senha: isso é o Firebase Auth)
     comments/{id}            — comentários de notícias (+ respostas via parentId)
     articleLikes/{articleId} — { userIds: [uid, ...] }
     reviews/{id}             — avaliações de produtos
     orders/{id}              — pedidos (campo ownerKey = uid)
     carts/{uid}               — { items: [{productId, qty}] }
     wishlists/{uid}           — { productIds: [...] }
     bookmarks/{uid}           — { articleIds: [...] } (notícias salvas)
     notifications/{id}        — campo ownerKey = uid
     newsletterSubs/{email}    — doc id = e-mail (URL-encoded)
     meta/seedStatus           — trava para o seed de conteúdo de demonstração rodar 1x só
   ========================================================================== */

const DB = {
  KEYS: {
    CART_PREFIX: 'na_db_cart_' // usado só para o carrinho de convidado (guest), em localStorage
  },

  _fs(){ return window.fb.firestore; },
  _col(name){ return window.fb.collection(this._fs(), name); },
  _doc(name, id){ return window.fb.doc(this._fs(), name, id); },

  _localGet(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  },
  _localSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ console.error('DB local write error', key, e); return false; }
  },

  // ---- users ----
  async getUserById(uid){
    const snap = await window.fb.getDoc(this._doc('users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  async findUserByField(field, value){
    const q = window.fb.query(this._col('users'), window.fb.where(field, '==', value), window.fb.limit(1));
    const snap = await window.fb.getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },
  async findUserByEmailOrUsername(identifier){
    const id = String(identifier).trim().toLowerCase();
    return (await this.findUserByField('emailLower', id)) || (await this.findUserByField('usernameLower', id));
  },
  async upsertUser(uid, patch){
    await window.fb.setDoc(this._doc('users', uid), patch, { merge: true });
    return this.getUserById(uid);
  },
  async deleteUser(uid){
    await window.fb.deleteDoc(this._doc('users', uid));
  },

  // ---- comentários ----
  async getCommentsByArticle(articleId){
    const q = window.fb.query(this._col('comments'), window.fb.where('articleId', '==', articleId));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async getCommentsByUser(userId){
    const q = window.fb.query(this._col('comments'), window.fb.where('userId', '==', userId));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async getCommentById(id){
    const snap = await window.fb.getDoc(this._doc('comments', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  async addComment(comment){
    const ref = await window.fb.addDoc(this._col('comments'), comment);
    return { id: ref.id, ...comment };
  },
  async toggleCommentLike(commentId, uid, like){
    await window.fb.updateDoc(this._doc('comments', commentId), {
      likes: like ? window.fb.arrayUnion(uid) : window.fb.arrayRemove(uid)
    });
  },
  async deleteComment(commentId){
    await window.fb.deleteDoc(this._doc('comments', commentId));
  },

  // ---- curtidas de notícia (documento por artigo) ----
  async getArticleLikeIds(articleId){
    const snap = await window.fb.getDoc(this._doc('articleLikes', articleId));
    return snap.exists() ? (snap.data().userIds || []) : [];
  },
  async toggleArticleLike(articleId, uid, like){
    await window.fb.setDoc(this._doc('articleLikes', articleId), {
      userIds: like ? window.fb.arrayUnion(uid) : window.fb.arrayRemove(uid)
    }, { merge: true });
  },

  // ---- carrinho ----
  async getCart(ownerKey){
    if (ownerKey === 'guest') return this._localGet(this.KEYS.CART_PREFIX + 'guest', []);
    const snap = await window.fb.getDoc(this._doc('carts', ownerKey));
    return snap.exists() ? (snap.data().items || []) : [];
  },
  async saveCart(ownerKey, items){
    if (ownerKey === 'guest') return this._localSet(this.KEYS.CART_PREFIX + 'guest', items);
    await window.fb.setDoc(this._doc('carts', ownerKey), { items }, { merge: true });
  },

  // ---- lista de desejos ----
  async getWishlist(ownerKey){
    const snap = await window.fb.getDoc(this._doc('wishlists', ownerKey));
    return snap.exists() ? (snap.data().productIds || []) : [];
  },
  async saveWishlist(ownerKey, productIds){
    await window.fb.setDoc(this._doc('wishlists', ownerKey), { productIds }, { merge: true });
  },

  // ---- notícias salvas (bookmarks) ----
  async getBookmarks(ownerKey){
    const snap = await window.fb.getDoc(this._doc('bookmarks', ownerKey));
    return snap.exists() ? (snap.data().articleIds || []) : [];
  },
  async saveBookmarks(ownerKey, articleIds){
    await window.fb.setDoc(this._doc('bookmarks', ownerKey), { articleIds }, { merge: true });
  },

  // ---- avaliações de produtos ----
  async getReviewsByProduct(productId){
    const q = window.fb.query(this._col('reviews'), window.fb.where('productId', '==', productId));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async getReviewsByUser(userId){
    const q = window.fb.query(this._col('reviews'), window.fb.where('userId', '==', userId));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async getReviewById(id){
    const snap = await window.fb.getDoc(this._doc('reviews', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  async findReview(productId, userId){
    const q = window.fb.query(
      this._col('reviews'),
      window.fb.where('productId', '==', productId),
      window.fb.where('userId', '==', userId),
      window.fb.limit(1)
    );
    const snap = await window.fb.getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },
  async upsertReview(id, data){
    if (id){
      await window.fb.updateDoc(this._doc('reviews', id), data);
      return { id, ...data };
    }
    const ref = await window.fb.addDoc(this._col('reviews'), data);
    return { id: ref.id, ...data };
  },
  async deleteReview(reviewId){
    await window.fb.deleteDoc(this._doc('reviews', reviewId));
  },

  // ---- newsletter ----
  async addNewsletterSub(email){
    await window.fb.setDoc(this._doc('newsletterSubs', encodeURIComponent(email)), {
      email, subscribedAt: new Date().toISOString()
    }, { merge: true });
  },

  /* Usado pelo painel admin (NewsletterAdmin) para disparar o blast real. */
  async getAllNewsletterSubs(){
    const snap = await window.fb.getDocs(window.fb.collection(window.fb.firestore, 'newsletterSubs'));
    return snap.docs.map(d => d.data());
  },

  // ---- notificações ----
  async getNotifications(ownerKey){
    const q = window.fb.query(this._col('notifications'), window.fb.where('ownerKey', '==', ownerKey));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async addNotification(notif){
    const ref = await window.fb.addDoc(this._col('notifications'), notif);
    return { id: ref.id, ...notif };
  },
  async markNotificationRead(notifId){
    await window.fb.updateDoc(this._doc('notifications', notifId), { read: true });
  },
  async markAllNotificationsRead(ownerKey){
    const list = await this.getNotifications(ownerKey);
    await Promise.all(list.filter(n => !n.read).map(n => this.markNotificationRead(n.id)));
  },

  // ---- pedidos ----
  async addOrder(order){
    const ref = await window.fb.addDoc(this._col('orders'), order);
    return { id: ref.id, ...order };
  },
  async getOrdersByOwner(ownerKey){
    const q = window.fb.query(this._col('orders'), window.fb.where('ownerKey', '==', ownerKey));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ---- exclusão de conta: limpa tudo vinculado ao uid ----
  async wipeUserData(uid){
    await window.fb.deleteDoc(this._doc('carts', uid)).catch(() => {});
    await window.fb.deleteDoc(this._doc('wishlists', uid)).catch(() => {});
    await window.fb.deleteDoc(this._doc('bookmarks', uid)).catch(() => {});
    const notifs = await this.getNotifications(uid);
    await Promise.all(notifs.map(n => window.fb.deleteDoc(this._doc('notifications', n.id)).catch(() => {})));
  },

  // ---- seed de conteúdo de demonstração (roda 1x só, globalmente) ----
  async isSeeded(){
    const snap = await window.fb.getDoc(this._doc('meta', 'seedStatus'));
    return snap.exists();
  },
  async markSeeded(){
    await window.fb.setDoc(this._doc('meta', 'seedStatus'), { seeded: true, seededAt: new Date().toISOString() });
  }
};
