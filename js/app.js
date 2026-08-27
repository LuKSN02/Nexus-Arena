/* ==========================================================================
   app.js — Estado da aplicação, roteamento de views e interações
   ========================================================================== */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $all = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const State = {
  user: null,
  view: 'home',
  newsCategory: 'todos',
  shopCategory: 'todos',
  searchQuery: '',
  heroIndex: 0,
  heroTimer: null,
  visibleArticles: 6,
  cart: [],
  maxPrice: 700,
  checkoutStep: 1,
  paymentMethod: 'card',
  shippingData: null,
  lastOrder: null,
  articles: [],
  products: []
};

const NAV_ITEMS = [
  { view: 'home', icon: 'newspaper', label: 'Notícias' },
  { view: 'shop', icon: 'box', label: 'Loja' }
];

function cartOwnerKey(){ return State.user ? State.user.id : 'guest'; }

/* ============================================================================
   BOOTSTRAP
   ========================================================================== */
document.addEventListener('DOMContentLoaded', init);

async function init(){
  Toast.init();
  Api.seedIfNeeded();
  fillStaticIcons();
  bindAuthEvents();
  bindShellEvents();
  bindGlobalDelegatedEvents();

  const current = Api.getCurrentUser();
  if (current){
    State.user = current;
    State.cart = DB.getCart(cartOwnerKey());
    enterApp();
  } else {
    State.cart = DB.getCart('guest');
    showAuthScreen();
  }
}

function fillStaticIcons(){
  $('#searchIcon').innerHTML = Icons.svg('search', 16);
  $('#cartIcon').innerHTML = Icons.svg('cart', 18);
  $('#drawerCartIcon').innerHTML = Icons.svg('cart', 17);
  $('#mobileMenuBtn').innerHTML = Icons.svg('menu', 18);
  $all('.modal__close').forEach(b => b.innerHTML = Icons.svg('close', 15));
  $('#closeCartBtn').innerHTML = Icons.svg('close', 15);
  $all('[data-toggle-pwd]').forEach(b => b.innerHTML = Icons.svg('eye', 16));
  $('#navLinks').innerHTML = NAV_ITEMS.map(n =>
    `<button class="nav-link${n.view === 'home' ? ' active' : ''}" data-view="${n.view}" type="button">${Icons.svg(n.icon, 15)}<span>${n.label}</span></button>`
  ).join('');
}

/* ============================================================================
   TELA DE AUTENTICAÇÃO
   ========================================================================== */
function showAuthScreen(){
  $('#appShell').classList.add('hidden');
  $('#authScreen').classList.remove('hidden');
}

function enterApp(){
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  updateProfileChip();
  buildTicker();
  navigateTo('home');
  renderCartDrawer();
}

function switchAuthTab(tab){
  $all('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('#loginForm').classList.toggle('hidden', tab !== 'login');
  $('#registerForm').classList.toggle('hidden', tab !== 'register');
  $('#authAlert').innerHTML = '';
  if (tab === 'login'){
    $('#authSwitchHint').innerHTML = `Ainda não tem conta? <a href="#" class="link-accent" id="gotoRegister">Cadastre-se</a>`;
  } else {
    $('#authSwitchHint').innerHTML = `Já tem uma conta? <a href="#" class="link-accent" id="gotoLogin">Entrar</a>`;
  }
}

function setFieldState(wrapId, hintId, state, message){
  const wrap = $('#' + wrapId);
  const hint = $('#' + hintId);
  wrap.classList.remove('error', 'valid');
  if (state === 'error'){
    wrap.classList.add('error');
    hint.className = 'field-hint error';
    hint.innerHTML = `${Icons.svg('alertCircle', 12)}<span>${Utils.escapeHtml(message || '')}</span>`;
  } else if (state === 'valid'){
    wrap.classList.add('valid');
    hint.className = 'field-hint ok';
    hint.innerHTML = message ? `${Icons.svg('check', 12)}<span>${Utils.escapeHtml(message)}</span>` : '';
  } else {
    hint.className = 'field-hint';
    hint.innerHTML = message ? `<span>${Utils.escapeHtml(message)}</span>` : '';
  }
}

function showFormAlert(containerSel, message, type = 'error'){
  const el = $(containerSel);
  el.innerHTML = `<div class="form-alert ${type === 'success' ? 'success' : ''}">${Icons.svg(type === 'success' ? 'checkCircle' : 'alertCircle', 16)}<span>${Utils.escapeHtml(message)}</span></div>`;
}

function bindAuthEvents(){
  $all('.auth-tab').forEach(tab => tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab)));

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'gotoRegister'){ e.preventDefault(); switchAuthTab('register'); }
    if (e.target && e.target.id === 'gotoLogin'){ e.preventDefault(); switchAuthTab('login'); }
  });

  $all('[data-toggle-pwd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('#' + btn.dataset.togglePwd);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = Icons.svg(show ? 'eyeOff' : 'eye', 16);
    });
  });

  // ---- validação em tempo real: login ----
  $('#loginIdentifier').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (!v) setFieldState('loginIdentifierWrap', 'loginIdentifierHint', 'default', '');
    else setFieldState('loginIdentifierWrap', 'loginIdentifierHint', 'default', '');
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#authAlert').innerHTML = '';
    const identifier = $('#loginIdentifier').value;
    const password = $('#loginPassword').value;
    setFieldState('loginIdentifierWrap', 'loginIdentifierHint', 'default', '');
    setFieldState('loginPasswordWrap', 'loginPasswordHint', 'default', '');

    const btn = $('#loginSubmit');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try{
      const user = await Api.login({ identifier, password });
      State.user = user;
      State.cart = DB.getCart(cartOwnerKey());
      Toast.show(`Bem-vindo de volta, ${user.username}!`, 'success', 'checkCircle');
      enterApp();
      $('#loginForm').reset();
    }catch(err){
      if (err.field === 'identifier') setFieldState('loginIdentifierWrap', 'loginIdentifierHint', 'error', err.message);
      else if (err.field === 'password') setFieldState('loginPasswordWrap', 'loginPasswordHint', 'error', err.message);
      else showFormAlert('#authAlert', err.message || 'Não foi possível entrar.');
    }finally{
      btn.disabled = false; btn.textContent = 'Entrar na plataforma';
    }
  });

  // ---- validação em tempo real: cadastro ----
  $('#regUsername').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (!v) return setFieldState('regUsernameWrap', 'regUsernameHint', 'default', 'Ao menos 3 caracteres.');
    if (v.length < 3) return setFieldState('regUsernameWrap', 'regUsernameHint', 'error', 'Muito curto.');
    if (DB.findUserByEmailOrUsername(v)) return setFieldState('regUsernameWrap', 'regUsernameHint', 'error', 'Este usuário já existe.');
    setFieldState('regUsernameWrap', 'regUsernameHint', 'valid', 'Disponível.');
  });

  $('#regEmail').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (!v) return setFieldState('regEmailWrap', 'regEmailHint', 'default', '');
    if (!Utils.isValidEmail(v)) return setFieldState('regEmailWrap', 'regEmailHint', 'error', 'E-mail inválido.');
    if (DB.findUserByEmailOrUsername(v)) return setFieldState('regEmailWrap', 'regEmailHint', 'error', 'Já existe conta com este e-mail.');
    setFieldState('regEmailWrap', 'regEmailHint', 'valid', 'E-mail válido.');
  });

  $('#regPassword').addEventListener('input', (e) => {
    const { score, label, checks } = Utils.passwordStrength(e.target.value);
    $all('#pwdMeter i').forEach((bar, i) => {
      bar.className = i < score ? `on-${score}` : '';
    });
    if (!e.target.value){ setFieldState('regPasswordWrap', 'regPasswordHint', 'default', 'Use 8+ caracteres, maiúscula, número e símbolo.'); return; }
    if (score < 2) setFieldState('regPasswordWrap', 'regPasswordHint', 'error', `Senha ${label.toLowerCase()}. Adicione mais variedade.`);
    else setFieldState('regPasswordWrap', 'regPasswordHint', 'valid', `Força: ${label}.`);
    validatePasswordMatch();
  });

  $('#regPassword2').addEventListener('input', validatePasswordMatch);
  function validatePasswordMatch(){
    const p1 = $('#regPassword').value, p2 = $('#regPassword2').value;
    if (!p2) return setFieldState('regPassword2Wrap', 'regPassword2Hint', 'default', '');
    if (p1 !== p2) setFieldState('regPassword2Wrap', 'regPassword2Hint', 'error', 'As senhas não coincidem.');
    else setFieldState('regPassword2Wrap', 'regPassword2Hint', 'valid', 'Senhas coincidem.');
  }

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#authAlert').innerHTML = '';
    const username = $('#regUsername').value.trim();
    const email = $('#regEmail').value.trim();
    const password = $('#regPassword').value;
    const password2 = $('#regPassword2').value;

    if (password !== password2){
      setFieldState('regPassword2Wrap', 'regPassword2Hint', 'error', 'As senhas não coincidem.');
      return;
    }

    const btn = $('#registerSubmit');
    btn.disabled = true; btn.textContent = 'Criando conta...';
    try{
      const user = await Api.register({ username, email, password });
      State.user = user;
      State.cart = DB.getCart(cartOwnerKey());
      Toast.show(`Conta criada! Bem-vindo, ${user.username}.`, 'success', 'checkCircle');
      enterApp();
      $('#registerForm').reset();
    }catch(err){
      if (err.field === 'username') setFieldState('regUsernameWrap', 'regUsernameHint', 'error', err.message);
      else if (err.field === 'email') setFieldState('regEmailWrap', 'regEmailHint', 'error', err.message);
      else if (err.field === 'password') setFieldState('regPasswordWrap', 'regPasswordHint', 'error', err.message);
      else showFormAlert('#authAlert', err.message || 'Não foi possível criar a conta.');
    }finally{
      btn.disabled = false; btn.textContent = 'Criar minha conta';
    }
  });
}

/* ============================================================================
   SHELL: navbar, ticker, busca, carrinho, perfil
   ========================================================================== */
function bindShellEvents(){
  $('#mobileMenuBtn').addEventListener('click', () => {
    $('#navLinks').classList.toggle('mobile-open');
  });

  $('#navLinks').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    navigateTo(btn.dataset.view);
    $('#navLinks').classList.remove('mobile-open');
  });

  $('#searchInput').addEventListener('input', Utils.debounce((e) => {
    State.searchQuery = e.target.value.trim().toLowerCase();
    if (State.view === 'home') renderHomeView();
    else if (State.view === 'shop') renderShopView();
  }, 260));

  $('#cartBtn').addEventListener('click', openCart);
  $('#closeCartBtn').addEventListener('click', closeCart);
  $('#cartOverlay').addEventListener('click', () => { closeCart(); closeModal(); });

  $('#profileChip').addEventListener('click', openProfilePanel);

  $('#footerProfileLink').addEventListener('click', (e) => { e.preventDefault(); openProfilePanel(); });
  $('#footerCartLink').addEventListener('click', (e) => { e.preventDefault(); openCart(); });

  $all('[data-footer-view]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(a.dataset.footerView);
      if (a.dataset.footerView === 'home') { State.newsCategory = a.dataset.footerCat; renderHomeView(); }
      if (a.dataset.footerView === 'shop') { State.shopCategory = a.dataset.footerCat; renderShopView(); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function updateProfileChip(){
  if (!State.user) return;
  $('#chipAvatar').src = State.user.avatar;
  $('#chipName').textContent = State.user.username;
  $('#chipTag').textContent = '#' + State.user.tag;
}

function buildTicker(){
  const items = [
    ...NEWS.slice(0, 5).map(n => ({ label: catInfo(n.category).label, text: n.title })),
    { label: 'LOJA', text: 'Frete grátis em compras acima de R$ 300 na loja de periféricos' }
  ];
  const html = items.map(i => `<span class="ticker__item"><b>${Utils.escapeHtml(i.label)}</b><span class="ticker__sep">·</span>${Utils.escapeHtml(i.text)}</span>`).join('');
  $('#tickerTrack').innerHTML = html + html; // duplicado para loop contínuo
}

/* ============================================================================
   ROTEAMENTO DE VIEWS
   ========================================================================== */
function navigateTo(view){
  if (view === 'checkout'){
    const { items } = cartTotals();
    if (!items.length){
      Toast.show('Seu carrinho está vazio.', 'warn');
      view = 'shop';
    }
  }
  State.view = view;
  $all('#navLinks .nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  if (view === 'home') renderHomeView();
  else if (view === 'shop') renderShopView();
  else if (view === 'checkout') renderCheckoutView();
  window.scrollTo(0, 0);
}

/* ============================================================================
   HOME / NOTÍCIAS
   ========================================================================== */
async function renderHomeView(){
  const main = $('#mainContent');
  main.innerHTML = `
    <div class="page container">
      <div class="hero-carousel" id="heroCarousel">
        <div class="hero-track" id="heroTrack"></div>
        <button class="hero-nav prev" id="heroPrev">${Icons.svg('chevronLeft', 18)}</button>
        <button class="hero-nav next" id="heroNext">${Icons.svg('chevronRight', 18)}</button>
        <div class="hero-dots" id="heroDots"></div>
      </div>

      <div class="section-head" style="margin-top:34px;">
        <div>
          <span class="section-eyebrow">COBERTURA COMPLETA</span>
          <h2>${Icons.svg('newspaper', 20)}Últimas notícias</h2>
        </div>
        <div class="chip-row" id="categoryChips"></div>
      </div>

      <div class="article-grid" id="articleGrid"></div>
      <div class="load-more-wrap" id="loadMoreWrap"></div>
    </div>
  `;

  const news = await Api.getNews();
  State.articles = news;

  renderHeroCarousel(news.slice(0, 4));
  renderCategoryChips();
  renderArticleGrid();
}

function renderCategoryChips(){
  const chips = [{ key: 'todos', label: 'Todos', color: '#8a90a8' }, ...CATEGORIES];
  $('#categoryChips').innerHTML = chips.map(c => `
    <button class="chip ${State.newsCategory === c.key ? 'active' : ''}" data-cat="${c.key}" type="button">
      <span class="chip__dot" style="background:${c.color}"></span>${c.label}
    </button>`).join('');
}

function renderHeroCarousel(slides){
  clearInterval(State.heroTimer);
  const track = $('#heroTrack');
  track.innerHTML = slides.map(a => `
    <div class="hero-slide">
      <div class="hero-slide__bg">${gameArt(a.category, a.id)}</div>
      <div class="hero-slide__scrim"></div>
      <div class="hero-slide__content">
        <span class="chip">${catInfo(a.category).label}</span>
        <h3>${Utils.escapeHtml(a.title)}</h3>
        <p>${Utils.escapeHtml(a.excerpt)}</p>
        <div class="hero-meta">
          <span>${Icons.svg('clock', 13)} ${a.readTime} min de leitura</span>
          <span>${Icons.svg('heart', 13)} ${a.likes}</span>
          <span>${Icons.svg('comment', 13)} ${a.comments}</span>
        </div>
        <button class="btn btn-primary" style="margin-top:18px;" data-open-article="${a.id}">Ler matéria completa ${Icons.svg('arrowRight', 15)}</button>
      </div>
    </div>`).join('');

  $('#heroDots').innerHTML = slides.map((_, i) => `<button class="${i === 0 ? 'active' : ''}" data-hero-dot="${i}"></button>`).join('');
  State.heroIndex = 0;
  positionHero();

  $('#heroPrev').onclick = () => { State.heroIndex = (State.heroIndex - 1 + slides.length) % slides.length; positionHero(); restartHeroTimer(slides.length); };
  $('#heroNext').onclick = () => { State.heroIndex = (State.heroIndex + 1) % slides.length; positionHero(); restartHeroTimer(slides.length); };
  $all('[data-hero-dot]').forEach(d => d.addEventListener('click', () => { State.heroIndex = Number(d.dataset.heroDot); positionHero(); restartHeroTimer(slides.length); }));

  const carousel = $('#heroCarousel');
  carousel.addEventListener('mouseenter', () => clearInterval(State.heroTimer));
  carousel.addEventListener('mouseleave', () => restartHeroTimer(slides.length));
  restartHeroTimer(slides.length);
}

function positionHero(){
  $('#heroTrack').style.transform = `translateX(-${State.heroIndex * 100}%)`;
  $all('#heroDots button').forEach((d, i) => d.classList.toggle('active', i === State.heroIndex));
}
function restartHeroTimer(len){
  clearInterval(State.heroTimer);
  State.heroTimer = setInterval(() => { State.heroIndex = (State.heroIndex + 1) % len; positionHero(); }, 5500);
}

function filteredArticles(){
  return State.articles.filter(a => {
    const catOk = State.newsCategory === 'todos' || a.category === State.newsCategory;
    const q = State.searchQuery;
    const searchOk = !q || a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q);
    return catOk && searchOk;
  });
}

function renderArticleGrid(){
  const list = filteredArticles();
  const visible = list.slice(0, State.visibleArticles);
  const grid = $('#articleGrid');

  if (!visible.length){
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:40px 0;">Nenhuma notícia encontrada para esse filtro.</p>`;
    $('#loadMoreWrap').innerHTML = '';
    return;
  }

  grid.innerHTML = visible.map((a, i) => `
    <article class="article-card" data-open-article="${a.id}">
      <div class="article-card__media">
        ${gameArt(a.category, a.id + i)}
        <span class="article-card__idx">${String(i + 1).padStart(2, '0')}</span>
      </div>
      <div class="article-card__body">
        <span class="article-card__cat">${catInfo(a.category).label}</span>
        <h4>${Utils.escapeHtml(a.title)}</h4>
        <p class="excerpt">${Utils.escapeHtml(a.excerpt)}</p>
        <div class="article-card__foot">
          <span class="stat">${Icons.svg('clock', 12)} ${a.readTime} min</span>
          <span class="stat">${Icons.svg('heart', 12)} ${a.likeCount ?? a.likes}</span>
          <span class="stat">${Icons.svg('comment', 12)} ${a.comments}</span>
        </div>
      </div>
    </article>`).join('');

  $('#loadMoreWrap').innerHTML = list.length > visible.length
    ? `<button class="btn btn-secondary" id="loadMoreBtn">Carregar mais notícias ${Icons.svg('chevronDown', 15)}</button>`
    : '';
  const moreBtn = $('#loadMoreBtn');
  if (moreBtn) moreBtn.addEventListener('click', () => { State.visibleArticles += 6; renderArticleGrid(); });
}

/* ============================================================================
   ARTIGO — MODAL + COMENTÁRIOS
   ========================================================================== */
async function openArticleModal(id){
  const article = await Api.getArticle(id);
  const comments = await Api.getComments(id);
  const likesMap = DB.getArticleLikes();
  const liked = State.user ? (likesMap[id] || []).includes(State.user.id) : false;

  openModal('lg', `
    <div class="article-hero-media">${gameArt(article.category, article.id)}</div>
    <div class="article-body">
      <span class="chip">${catInfo(article.category).label}</span>
      <h2 style="margin-top:12px;">${Utils.escapeHtml(article.title)}</h2>
      <div class="article-meta-row">
        <span>${Icons.svg('user', 13)} ${article.author}</span>
        <span>${Icons.svg('clock', 13)} ${article.readTime} min de leitura</span>
      </div>
      <div class="article-content">${article.content.map(p => `<p>${Utils.escapeHtml(p)}</p>`).join('')}</div>

      <div class="article-actions">
        <button class="reaction-btn ${liked ? 'liked' : ''}" id="articleLikeBtn">${Icons.svg('heart', 15)}<span id="articleLikeCount">${article.likeCount}</span></button>
        <button class="reaction-btn" id="articleShareBtn">${Icons.svg('share', 15)}Compartilhar</button>
        <button class="reaction-btn" id="articleBookmarkBtn">${Icons.svg('bookmark', 15)}Salvar</button>
      </div>

      <div class="comments">
        <h3>${Icons.svg('comment', 16)}Comentários (<span id="commentCount">${comments.length}</span>)</h3>
        ${State.user ? `
          <div class="comment-form">
            <textarea id="commentInput" placeholder="Compartilhe sua opinião sobre essa notícia..." maxlength="500"></textarea>
            <button class="btn btn-primary" id="commentSubmit" style="align-self:flex-end;">Comentar</button>
          </div>` : `<p style="margin-bottom:16px;">Entre na sua conta para comentar.</p>`}
        <div class="comment-list" id="commentList"></div>
      </div>
    </div>
  `, 'Notícia');

  renderCommentList(comments);

  $('#articleLikeBtn').addEventListener('click', async () => {
    if (!State.user) return Toast.show('Entre na sua conta para curtir.', 'warn');
    const res = await Api.toggleArticleLike(id, State.user.id);
    $('#articleLikeBtn').classList.toggle('liked', res.liked);
    $('#articleLikeCount').textContent = article.likes + res.count;
    renderArticleGrid();
  });
  $('#articleShareBtn').addEventListener('click', () => Toast.show('Link da notícia copiado para a área de transferência.', 'info', 'share'));
  $('#articleBookmarkBtn').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('liked');
    Toast.show('Notícia salva nos seus favoritos.', 'info', 'bookmark');
  });

  const submitBtn = $('#commentSubmit');
  if (submitBtn){
    submitBtn.addEventListener('click', async () => {
      const text = $('#commentInput').value;
      submitBtn.disabled = true;
      try{
        await Api.addComment(id, State.user, text);
        $('#commentInput').value = '';
        const fresh = await Api.getComments(id);
        renderCommentList(fresh);
        $('#commentCount').textContent = fresh.length;
        Toast.show('Comentário publicado.', 'success');
      }catch(err){
        Toast.show(err.message || 'Não foi possível comentar.', 'error');
      }finally{
        submitBtn.disabled = false;
      }
    });
  }

  function renderCommentList(list){
    const box = $('#commentList');
    if (!list.length){
      box.innerHTML = `<p style="color:var(--text-faint);">Seja o primeiro a comentar.</p>`;
      return;
    }
    box.innerHTML = list.map(c => {
      const likedByMe = State.user && c.likes.includes(State.user.id);
      const mine = State.user && c.userId === State.user.id;
      return `
      <div class="comment" data-comment-id="${c.id}">
        <img class="avatar" src="${c.avatar}" width="34" height="34" alt="">
        <div class="comment__body">
          <div class="comment__head">
            <span class="comment__name">${Utils.escapeHtml(c.username)}</span>
            <span class="comment__time">${Utils.timeAgo(c.createdAt)}</span>
          </div>
          <p class="comment__text">${Utils.escapeHtml(c.text)}</p>
          <div class="comment__actions">
            <button data-like-comment="${c.id}" class="${likedByMe ? 'liked' : ''}">${Icons.svg('heart', 13)} ${c.likes.length}</button>
            ${mine ? `<button data-delete-comment="${c.id}">${Icons.svg('trash', 13)} Remover</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    $all('[data-like-comment]').forEach(b => b.addEventListener('click', async () => {
      if (!State.user) return Toast.show('Entre na sua conta para curtir.', 'warn');
      await Api.toggleCommentLike(b.dataset.likeComment, State.user.id);
      const fresh = await Api.getComments(id);
      renderCommentList(fresh);
    }));
    $all('[data-delete-comment]').forEach(b => b.addEventListener('click', async () => {
      await Api.deleteComment(b.dataset.deleteComment, State.user.id);
      const fresh = await Api.getComments(id);
      renderCommentList(fresh);
      $('#commentCount').textContent = fresh.length;
      Toast.show('Comentário removido.', 'info', 'trash');
    }));
  }
}

/* ============================================================================
   LOJA
   ========================================================================== */
async function renderShopView(){
  const main = $('#mainContent');
  main.innerHTML = `
    <div class="page container">
      <div class="section-head">
        <div>
          <span class="section-eyebrow">PERIFÉRICOS E ITENS GAMER</span>
          <h2>${Icons.svg('box', 20)}Loja Nexus</h2>
        </div>
      </div>
      <div class="shop-layout">
        <aside class="filter-panel">
          <h4>CATEGORIAS</h4>
          <div id="shopFilterCats"></div>
          <div class="panel-divider"></div>
          <h4>PREÇO MÁXIMO</h4>
          <input type="range" min="50" max="700" step="10" value="${State.maxPrice}" class="price-slider" id="priceSlider">
          <div class="filter-opt" style="border:none;padding-top:8px;">
            <span class="mono" id="priceSliderVal">${Utils.brl(State.maxPrice)}</span>
          </div>
        </aside>
        <div>
          <div class="product-grid" id="productGrid"></div>
        </div>
      </div>
    </div>
  `;

  State.products = await Api.getProducts();
  renderShopFilters();
  renderProductGrid();

  $('#priceSlider').addEventListener('input', (e) => {
    State.maxPrice = Number(e.target.value);
    $('#priceSliderVal').textContent = Utils.brl(State.maxPrice);
    renderProductGrid();
  });
}

function renderShopFilters(){
  const cats = [{ key: 'todos', label: 'Todos os produtos', icon: 'grid' }, ...PRODUCT_CATS];
  $('#shopFilterCats').innerHTML = cats.map(c => {
    const count = c.key === 'todos' ? PRODUCTS.length : PRODUCTS.filter(p => p.category === c.key).length;
    return `
    <div class="filter-opt">
      <label>
        <input type="radio" name="shopcat" ${State.shopCategory === c.key ? 'checked' : ''} data-shop-cat="${c.key}">
        ${Icons.svg(c.icon, 15)} ${c.label}
      </label>
      <span class="filter-opt__count">${count}</span>
    </div>`;
  }).join('');

  $all('[data-shop-cat]').forEach(inp => inp.addEventListener('change', () => {
    State.shopCategory = inp.dataset.shopCat;
    renderProductGrid();
  }));
}

function filteredProducts(){
  return State.products.filter(p => {
    const catOk = State.shopCategory === 'todos' || p.category === State.shopCategory;
    const priceOk = p.price <= State.maxPrice;
    const q = State.searchQuery;
    const searchOk = !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    return catOk && priceOk && searchOk;
  });
}

function renderProductGrid(){
  const list = filteredProducts();
  const grid = $('#productGrid');
  if (!list.length){
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:40px 0;">Nenhum produto encontrado com esses filtros.</p>`;
    return;
  }
  const catMeta = key => PRODUCT_CATS.find(c => c.key === key);
  grid.innerHTML = list.map(p => {
    const c = catMeta(p.category);
    return `
    <div class="product-card" data-product-card="${p.id}">
      ${p.tag ? `<span class="product-card__tag">${p.tag}</span>` : ''}
      <div class="product-card__media" style="color:var(--teal)">${Icons.svg(c.icon, 56)}</div>
      <div class="product-card__body">
        <span class="product-card__cat">${c.label}</span>
        <h4>${Utils.escapeHtml(p.name)}</h4>
        <div class="product-card__rating">${Icons.svg('star', 13)} ${p.rating} <span class="mono">(${p.reviews})</span></div>
        <div class="product-card__price-row">
          <span class="price">${Utils.brl(p.price)}</span>
          ${p.oldPrice ? `<span class="price-old">${Utils.brl(p.oldPrice)}</span>` : ''}
        </div>
      </div>
      <div class="product-card__foot">
        <div class="add-cart-row">
          <div class="qty-stepper">
            <button type="button" data-qty-minus="${p.id}">${Icons.svg('minus', 13)}</button>
            <span id="qty-${p.id}">1</span>
            <button type="button" data-qty-plus="${p.id}">${Icons.svg('plus', 13)}</button>
          </div>
          <button class="btn btn-primary btn-sm" data-add-cart="${p.id}">${Icons.svg('cart', 14)} Adicionar</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $all('[data-qty-minus]').forEach(b => b.addEventListener('click', () => {
    const el = $('#qty-' + b.dataset.qtyMinus);
    el.textContent = Math.max(1, Number(el.textContent) - 1);
  }));
  $all('[data-qty-plus]').forEach(b => b.addEventListener('click', () => {
    const el = $('#qty-' + b.dataset.qtyPlus);
    el.textContent = Math.min(20, Number(el.textContent) + 1);
  }));
  $all('[data-add-cart]').forEach(b => b.addEventListener('click', () => {
    const qty = Number($('#qty-' + b.dataset.addCart).textContent);
    addToCart(b.dataset.addCart, qty);
  }));
}

/* ============================================================================
   CARRINHO
   ========================================================================== */
function persistCart(){ DB.saveCart(cartOwnerKey(), State.cart); }

function addToCart(productId, qty = 1){
  const existing = State.cart.find(i => i.productId === productId);
  if (existing) existing.qty = Math.min(20, existing.qty + qty);
  else State.cart.push({ productId, qty });
  persistCart();
  renderCartDrawer();
  const product = PRODUCTS.find(p => p.id === productId);
  Toast.show(`${product.name} adicionado ao carrinho.`, 'success', 'cart');
}

function removeFromCart(productId){
  State.cart = State.cart.filter(i => i.productId !== productId);
  persistCart();
  renderCartDrawer();
}

function setCartQty(productId, qty){
  const item = State.cart.find(i => i.productId === productId);
  if (!item) return;
  item.qty = Utils.clamp(qty, 1, 20);
  persistCart();
  renderCartDrawer();
}

function cartTotals(){
  const items = State.cart.map(i => ({ ...i, product: PRODUCTS.find(p => p.id === i.productId) })).filter(i => i.product);
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const shipping = subtotal === 0 ? 0 : (subtotal >= 300 ? 0 : 24.9);
  return { items, subtotal, shipping, total: subtotal + shipping };
}

function renderCartDrawer(){
  const { items, subtotal, shipping, total } = cartTotals();
  const count = items.reduce((s, i) => s + i.qty, 0);
  $('#cartCount').textContent = count;
  $('#cartCount').classList.toggle('hidden', count === 0);

  if (!items.length){
    $('#cartBody').innerHTML = `
      <div class="cart-empty">
        ${Icons.svg('cart', 40)}
        <p>Seu carrinho está vazio.</p>
      </div>`;
    $('#cartFoot').innerHTML = `<button class="btn btn-secondary btn-block" id="cartGoShop">Explorar a loja</button>`;
    const btn = $('#cartGoShop');
    if (btn) btn.addEventListener('click', () => { closeCart(); navigateTo('shop'); });
    return;
  }

  $('#cartBody').innerHTML = items.map(i => {
    const c = PRODUCT_CATS.find(pc => pc.key === i.product.category);
    return `
    <div class="cart-item">
      <div class="cart-item__media">${Icons.svg(c.icon, 26)}</div>
      <div class="cart-item__info">
        <div class="cart-item__name">${Utils.escapeHtml(i.product.name)}</div>
        <div class="cart-item__cat">${c.label}</div>
        <div class="cart-item__row">
          <div class="qty-stepper">
            <button type="button" data-cart-minus="${i.productId}">${Icons.svg('minus', 12)}</button>
            <span>${i.qty}</span>
            <button type="button" data-cart-plus="${i.productId}">${Icons.svg('plus', 12)}</button>
          </div>
          <span class="price" style="font-size:14px;">${Utils.brl(i.product.price * i.qty)}</span>
        </div>
      </div>
      <button class="cart-item__remove" data-cart-remove="${i.productId}">${Icons.svg('trash', 15)}</button>
    </div>`;
  }).join('');

  $('#cartFoot').innerHTML = `
    <div class="summary-row"><span>Subtotal</span><span class="mono">${Utils.brl(subtotal)}</span></div>
    <div class="summary-row"><span>Frete</span><span class="mono">${shipping === 0 ? 'Grátis' : Utils.brl(shipping)}</span></div>
    <div class="summary-row total"><span>Total</span><span class="price">${Utils.brl(total)}</span></div>
    <button class="btn btn-primary btn-block" id="goCheckoutBtn" style="margin-top:14px;">Finalizar compra ${Icons.svg('arrowRight', 15)}</button>
  `;

  $all('[data-cart-minus]').forEach(b => b.addEventListener('click', () => {
    const item = State.cart.find(i => i.productId === b.dataset.cartMinus);
    if (item.qty <= 1) removeFromCart(item.productId); else setCartQty(item.productId, item.qty - 1);
  }));
  $all('[data-cart-plus]').forEach(b => b.addEventListener('click', () => {
    const item = State.cart.find(i => i.productId === b.dataset.cartPlus);
    setCartQty(item.productId, item.qty + 1);
  }));
  $all('[data-cart-remove]').forEach(b => b.addEventListener('click', () => removeFromCart(b.dataset.cartRemove)));

  const goCheckout = $('#goCheckoutBtn');
  if (goCheckout) goCheckout.addEventListener('click', () => {
    closeCart();
    State.checkoutStep = 1;
    navigateTo('checkout');
  });
}

function openCart(){
  renderCartDrawer();
  $('#cartOverlay').classList.add('show');
  $('#cartDrawer').classList.add('show');
}
function closeCart(){
  $('#cartOverlay').classList.remove('show');
  $('#cartDrawer').classList.remove('show');
}

/* ============================================================================
   CHECKOUT
   ========================================================================== */
function renderCheckoutView(){
  const { items, subtotal, shipping, total } = cartTotals();
  const main = $('#mainContent');
  main.innerHTML = `
    <div class="page container">
      <div class="checkout-steps">
        <div class="co-step ${State.checkoutStep >= 1 ? (State.checkoutStep > 1 ? 'done' : 'active') : ''}"><span class="co-step__num">${State.checkoutStep > 1 ? Icons.svg('check', 13) : '1'}</span>Entrega</div>
        <div class="co-line"></div>
        <div class="co-step ${State.checkoutStep === 2 ? 'active' : ''}"><span class="co-step__num">2</span>Pagamento</div>
      </div>
      <div class="checkout-layout">
        <div id="checkoutMain"></div>
        <aside class="order-summary-card">
          <h3 style="font-size:14px;margin-bottom:14px;">${Icons.svg('tag', 15)} Resumo do pedido</h3>
          ${items.map(i => `<div class="mini-item"><span>${i.qty}x ${Utils.escapeHtml(i.product.name)}</span><span class="mono">${Utils.brl(i.product.price * i.qty)}</span></div>`).join('')}
          <div class="panel-divider"></div>
          <div class="summary-row"><span>Subtotal</span><span class="mono">${Utils.brl(subtotal)}</span></div>
          <div class="summary-row"><span>Frete</span><span class="mono">${shipping === 0 ? 'Grátis' : Utils.brl(shipping)}</span></div>
          <div class="summary-row total"><span>Total</span><span class="price">${Utils.brl(total)}</span></div>
        </aside>
      </div>
    </div>
  `;
  State.checkoutStep === 1 ? renderShippingStep() : renderPaymentStep();
}

function renderShippingStep(){
  const d = State.shippingData || {};
  $('#checkoutMain').innerHTML = `
    <div class="co-card">
      <h3>${Icons.svg('truck', 16)} Endereço de entrega</h3>
      <form id="shippingForm">
        <div class="form-grid">
          <div class="field full">
            <label>Nome completo</label>
            <div class="field-input" id="shipNameWrap"><input id="shipName" value="${Utils.escapeHtml(d.name || (State.user ? State.user.username : ''))}" placeholder="Seu nome completo"></div>
            <div class="field-hint" id="shipNameHint"></div>
          </div>
          <div class="field">
            <label>CEP</label>
            <div class="field-input" id="shipCepWrap"><input id="shipCep" value="${Utils.escapeHtml(d.cep || '')}" placeholder="00000-000"></div>
            <div class="field-hint" id="shipCepHint"></div>
          </div>
          <div class="field">
            <label>Cidade</label>
            <div class="field-input" id="shipCityWrap"><input id="shipCity" value="${Utils.escapeHtml(d.city || '')}" placeholder="Sua cidade"></div>
            <div class="field-hint" id="shipCityHint"></div>
          </div>
          <div class="field full">
            <label>Endereço</label>
            <div class="field-input" id="shipAddrWrap"><input id="shipAddr" value="${Utils.escapeHtml(d.addr || '')}" placeholder="Rua, número, bairro"></div>
            <div class="field-hint" id="shipAddrHint"></div>
          </div>
          <div class="field">
            <label>Estado</label>
            <div class="field-input" id="shipStateWrap"><input id="shipState" value="${Utils.escapeHtml(d.state || '')}" placeholder="UF" maxlength="2" style="text-transform:uppercase;"></div>
            <div class="field-hint" id="shipStateHint"></div>
          </div>
          <div class="field">
            <label>Telefone</label>
            <div class="field-input" id="shipPhoneWrap"><input id="shipPhone" value="${Utils.escapeHtml(d.phone || '')}" placeholder="(00) 00000-0000"></div>
            <div class="field-hint" id="shipPhoneHint"></div>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:18px;">Continuar para pagamento ${Icons.svg('arrowRight', 15)}</button>
      </form>
    </div>
  `;

  $('#shippingForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = [
      ['shipName', 'shipNameWrap', 'shipNameHint', v => v.trim().length >= 3, 'Informe seu nome completo.'],
      ['shipCep', 'shipCepWrap', 'shipCepHint', v => /^\d{5}-?\d{3}$/.test(v.trim()), 'CEP inválido. Use o formato 00000-000.'],
      ['shipCity', 'shipCityWrap', 'shipCityHint', v => v.trim().length >= 2, 'Informe a cidade.'],
      ['shipAddr', 'shipAddrWrap', 'shipAddrHint', v => v.trim().length >= 5, 'Informe o endereço completo.'],
      ['shipState', 'shipStateWrap', 'shipStateHint', v => /^[A-Za-z]{2}$/.test(v.trim()), 'UF inválida (2 letras).'],
      ['shipPhone', 'shipPhoneWrap', 'shipPhoneHint', v => v.replace(/\D/g, '').length >= 10, 'Telefone inválido.']
    ];
    let valid = true;
    const data = {};
    fields.forEach(([id, wrap, hint, test, msg]) => {
      const v = $('#' + id).value;
      data[id.replace('ship', '').toLowerCase()] = v;
      if (!test(v)){ setFieldState(wrap, hint, 'error', msg); valid = false; }
      else setFieldState(wrap, hint, 'valid', '');
    });
    if (!valid) return;
    State.shippingData = {
      name: $('#shipName').value, cep: $('#shipCep').value, city: $('#shipCity').value,
      addr: $('#shipAddr').value, state: $('#shipState').value.toUpperCase(), phone: $('#shipPhone').value
    };
    State.checkoutStep = 2;
    renderCheckoutView();
  });
}

function renderPaymentStep(){
  $('#checkoutMain').innerHTML = `
    <div class="co-card">
      <h3>${Icons.svg('creditCard', 16)} Forma de pagamento</h3>
      <div class="pay-methods">
        <button type="button" class="pay-method ${State.paymentMethod === 'card' ? 'active' : ''}" data-pay="card">${Icons.svg('creditCard', 20)}Cartão</button>
        <button type="button" class="pay-method ${State.paymentMethod === 'pix' ? 'active' : ''}" data-pay="pix">${Icons.svg('qrcode', 20)}Pix</button>
        <button type="button" class="pay-method ${State.paymentMethod === 'boleto' ? 'active' : ''}" data-pay="boleto">${Icons.svg('newspaper', 20)}Boleto</button>
      </div>
      <div id="payMethodBody"></div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button type="button" class="btn btn-secondary" id="backToShipping">${Icons.svg('chevronLeft', 15)} Voltar</button>
        <button type="button" class="btn btn-primary" id="placeOrderBtn" style="flex:1;">Finalizar pedido</button>
      </div>
    </div>
  `;
  renderPayMethodBody();

  $all('[data-pay]').forEach(b => b.addEventListener('click', () => {
    State.paymentMethod = b.dataset.pay;
    $all('[data-pay]').forEach(x => x.classList.toggle('active', x === b));
    renderPayMethodBody();
  }));

  $('#backToShipping').addEventListener('click', () => { State.checkoutStep = 1; renderCheckoutView(); });
  $('#placeOrderBtn').addEventListener('click', submitOrder);
}

function renderPayMethodBody(){
  const box = $('#payMethodBody');
  if (State.paymentMethod === 'card'){
    box.innerHTML = `
      <div class="form-grid">
        <div class="field full">
          <label>Número do cartão</label>
          <div class="field-input" id="cardNumWrap"><input id="cardNum" placeholder="0000 0000 0000 0000" maxlength="19"></div>
          <div class="field-hint" id="cardNumHint"></div>
        </div>
        <div class="field full">
          <label>Nome impresso no cartão</label>
          <div class="field-input" id="cardNameWrap"><input id="cardName" placeholder="Como está no cartão"></div>
          <div class="field-hint" id="cardNameHint"></div>
        </div>
        <div class="field">
          <label>Validade</label>
          <div class="field-input" id="cardExpWrap"><input id="cardExp" placeholder="MM/AA" maxlength="5"></div>
          <div class="field-hint" id="cardExpHint"></div>
        </div>
        <div class="field">
          <label>CVV</label>
          <div class="field-input" id="cardCvvWrap"><input id="cardCvv" placeholder="000" maxlength="4"></div>
          <div class="field-hint" id="cardCvvHint"></div>
        </div>
      </div>`;
    $('#cardNum').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
    });
    $('#cardExp').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(\d)/, '$1/$2');
    });
  } else if (State.paymentMethod === 'pix'){
    box.innerHTML = `
      <div class="pix-box">
        ${Icons.svg('qrcode', 90)}
        <p style="margin-top:10px;">Um código Pix simulado será gerado ao confirmar o pedido. Pagamentos via Pix são aprovados instantaneamente.</p>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="pix-box">
        ${Icons.svg('newspaper', 60)}
        <p style="margin-top:10px;">O boleto simulado vence em 3 dias úteis e a confirmação de pagamento ocorre em até 2 dias após o pagamento.</p>
      </div>`;
  }
}

async function submitOrder(){
  let paymentValid = true;
  if (State.paymentMethod === 'card'){
    const checks = [
      ['cardNum', 'cardNumWrap', 'cardNumHint', v => v.replace(/\s/g, '').length === 16, 'Número de cartão inválido.'],
      ['cardName', 'cardNameWrap', 'cardNameHint', v => v.trim().length >= 3, 'Informe o nome impresso no cartão.'],
      ['cardExp', 'cardExpWrap', 'cardExpHint', v => /^\d{2}\/\d{2}$/.test(v), 'Validade inválida (MM/AA).'],
      ['cardCvv', 'cardCvvWrap', 'cardCvvHint', v => v.length >= 3, 'CVV inválido.']
    ];
    checks.forEach(([id, wrap, hint, test, msg]) => {
      const v = $('#' + id).value;
      if (!test(v)){ setFieldState(wrap, hint, 'error', msg); paymentValid = false; }
      else setFieldState(wrap, hint, 'valid', '');
    });
  }
  if (!paymentValid) return;

  const btn = $('#placeOrderBtn');
  btn.disabled = true; btn.textContent = 'Processando pagamento...';

  const { items, subtotal, shipping, total } = cartTotals();
  try{
    const order = await Api.placeOrder(cartOwnerKey(), {
      items: items.map(i => ({ name: i.product.name, qty: i.qty, price: i.product.price })),
      subtotal, shipping, total,
      shippingData: State.shippingData,
      paymentMethod: State.paymentMethod
    });
    State.cart = [];
    State.lastOrder = order;
    renderCartDrawer();
    if (State.user && !State.user.badges.includes('buyer')){
      State.user = await Api.updateProfile(State.user.id, { badges: [...State.user.badges, 'buyer'] });
    }
    renderOrderSuccessView(order);
    Toast.show('Pedido realizado com sucesso!', 'success', 'checkCircle');
  }catch(err){
    Toast.show(err.message || 'Não foi possível concluir o pedido.', 'error');
  }finally{
    btn.disabled = false; btn.textContent = 'Finalizar pedido';
  }
}

function renderOrderSuccessView(order){
  State.view = 'success';
  $all('#navLinks .nav-link').forEach(l => l.classList.remove('active'));
  $('#mainContent').innerHTML = `
    <div class="page container">
      <div class="success-screen">
        <div class="success-icon">${Icons.svg('checkCircle', 38)}</div>
        <h2 style="font-size:24px;">Pedido confirmado</h2>
        <p style="margin-top:10px;">Seu pedido foi processado e já está sendo preparado para envio.</p>
        <div class="order-num mono">#${order.id}</div>
        <p class="mono" style="font-size:13px;">Total pago: ${Utils.brl(order.total)}</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:26px;">
          <button class="btn btn-secondary" id="backHomeBtn">Ver notícias</button>
          <button class="btn btn-primary" id="backShopBtn">Continuar comprando</button>
        </div>
      </div>
    </div>
  `;
  $('#backHomeBtn').addEventListener('click', () => navigateTo('home'));
  $('#backShopBtn').addEventListener('click', () => navigateTo('shop'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================================
   PAINEL DE PERFIL (estilo Discord)
   ========================================================================== */
function openProfilePanel(){
  if (!State.user) return;
  const u = State.user;
  openModal('md', `
    <div class="profile-panel">
      <div class="profile-panel__banner" id="panelBanner" style="${u.bannerImage ? `background-image:url('${u.bannerImage}');background-size:cover;background-position:center;` : `background:${u.banner};`}"></div>
      <div class="profile-panel__main">
        <div class="profile-panel__avatar">
          <img class="avatar" src="${u.avatar}" width="84" height="84" alt="">
        </div>
        <div class="profile-panel__names">
          <div class="name">${Utils.escapeHtml(u.username)}</div>
          <div class="tag">#${u.tag}${u.customStatus ? ' · ' + Utils.escapeHtml(u.customStatus) : ''}</div>
        </div>
        <div class="badge-row" id="badgeRow"></div>
      </div>
      <div class="profile-tabs">
        <button class="ptab active" data-ptab="perfil">PERFIL</button>
        <button class="ptab" data-ptab="config">CONFIGURAÇÕES DA CONTA</button>
      </div>
      <div class="profile-tab-content" id="ptabContent"></div>
    </div>
  `, 'Perfil');

  $('#badgeRow').innerHTML = u.badges.map(bk => {
    const b = AVAILABLE_BADGES.find(x => x.key === bk);
    return b ? `<span class="badge ${b.cls}" title="${b.title}">${Icons.svg(b.icon, 15)}</span>` : '';
  }).join('');

  $all('[data-ptab]').forEach(t => t.addEventListener('click', () => {
    $all('[data-ptab]').forEach(x => x.classList.toggle('active', x === t));
    renderProfileTab(t.dataset.ptab);
  }));
  renderProfileTab('perfil');
}

function renderProfileTab(tab){
  const u = State.user;
  const box = $('#ptabContent');
  if (tab === 'perfil'){
    box.innerHTML = `
      <div class="field">
        <label>Status personalizado</label>
        <div class="field-input"><input id="customStatusInput" maxlength="60" placeholder="O que você está jogando?" value="${Utils.escapeHtml(u.customStatus || '')}"></div>
      </div>
      <div class="field">
        <label>Cor do banner</label>
        <div class="color-swatches" id="colorSwatches">
          ${BANNER_COLORS.map(c => `<span class="swatch ${!u.bannerImage && u.banner === c ? 'active' : ''}" data-banner="${c}" style="background:${c};"></span>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Imagem de banner</label>
        <div class="file-upload">
          <label class="file-upload__btn" for="bannerUpload">${Icons.svg('image', 15)}Escolher arquivo</label>
          <input type="file" id="bannerUpload" accept="image/*" class="file-upload__input">
          <span class="file-upload__name" id="bannerFileName">${u.bannerImage ? 'Imagem personalizada' : 'Nenhum arquivo escolhido'}</span>
          ${u.bannerImage ? `<button type="button" class="btn btn-ghost btn-sm" id="removeBannerBtn">${Icons.svg('close', 12)} Remover</button>` : ''}
        </div>
      </div>
      <div class="field">
        <label>Foto de perfil</label>
        <div class="file-upload">
          <label class="file-upload__btn" for="avatarUpload">${Icons.svg('image', 15)}Escolher arquivo</label>
          <input type="file" id="avatarUpload" accept="image/*" class="file-upload__input">
          <span class="file-upload__name" id="avatarFileName">Nenhum arquivo escolhido</span>
        </div>
      </div>
    `;
    $('#customStatusInput').addEventListener('input', Utils.debounce(async (e) => {
      const updated = await Api.updateProfile(u.id, { customStatus: e.target.value });
      State.user = updated;
    }, 400));

    $all('[data-banner]').forEach(sw => sw.addEventListener('click', async () => {
      const updated = await Api.updateProfile(u.id, { banner: sw.dataset.banner, bannerImage: null });
      State.user = updated;
      $all('[data-banner]').forEach(x => x.classList.toggle('active', x === sw));
      $('#panelBanner').style.backgroundImage = 'none';
      $('#panelBanner').style.background = sw.dataset.banner;
      renderProfileTab('perfil');
    }));

    $('#bannerUpload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('#bannerFileName').textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640; canvas.height = 160;
          const ctx = canvas.getContext('2d');
          const targetRatio = 640 / 160;
          const srcRatio = img.width / img.height;
          let sw2 = img.width, sh2 = img.height, sx = 0, sy = 0;
          if (srcRatio > targetRatio){ sw2 = img.height * targetRatio; sx = (img.width - sw2) / 2; }
          else { sh2 = img.width / targetRatio; sy = (img.height - sh2) / 2; }
          ctx.drawImage(img, sx, sy, sw2, sh2, 0, 0, 640, 160);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const updated = await Api.updateProfile(u.id, { bannerImage: dataUrl });
          State.user = updated;
          $('#panelBanner').style.background = 'none';
          $('#panelBanner').style.backgroundImage = `url('${dataUrl}')`;
          $('#panelBanner').style.backgroundSize = 'cover';
          $('#panelBanner').style.backgroundPosition = 'center';
          Toast.show('Banner atualizado.', 'success');
          renderProfileTab('perfil');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    const removeBannerBtn = $('#removeBannerBtn');
    if (removeBannerBtn) removeBannerBtn.addEventListener('click', async () => {
      const updated = await Api.updateProfile(u.id, { bannerImage: null });
      State.user = updated;
      $('#panelBanner').style.backgroundImage = 'none';
      $('#panelBanner').style.background = updated.banner;
      Toast.show('Imagem de banner removida.', 'info', 'trash');
      renderProfileTab('perfil');
    });

    $('#avatarUpload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('#avatarFileName').textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 128; canvas.height = 128;
          const ctx = canvas.getContext('2d');
          const size = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 128, 128);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const updated = await Api.updateProfile(u.id, { avatar: dataUrl });
          State.user = updated;
          updateProfileChip();
          $('.profile-panel__avatar .avatar').src = dataUrl;
          Toast.show('Foto de perfil atualizada.', 'success');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  } else {
    box.innerHTML = `
      <div class="field">
        <label>Nome de usuário</label>
        <div class="field-input"><input value="${Utils.escapeHtml(u.username)}#${u.tag}" disabled></div>
      </div>
      <div class="field">
        <label>E-mail cadastrado</label>
        <div class="field-input"><input value="${Utils.escapeHtml(u.email)}" disabled></div>
      </div>
      <div class="panel-divider"></div>
      <h4 style="font-size:12px;color:var(--text-faint);letter-spacing:.1em;margin-bottom:12px;">ALTERAR SENHA</h4>
      <form id="changePwdForm">
        <div class="field">
          <label>Senha atual</label>
          <div class="field-input" id="curPwdWrap"><input id="curPwd" type="password"></div>
          <div class="field-hint" id="curPwdHint"></div>
        </div>
        <div class="field">
          <label>Nova senha</label>
          <div class="field-input" id="newPwdWrap"><input id="newPwd" type="password"></div>
          <div class="field-hint" id="newPwdHint"></div>
        </div>
        <button type="submit" class="btn btn-secondary btn-block">Atualizar senha</button>
      </form>
      <div class="panel-divider"></div>
      <button class="btn btn-primary btn-block" id="logoutBtn">${Icons.svg('logout', 15)} Encerrar sessão</button>
    `;
    $('#changePwdForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try{
        await Api.changePassword(u.id, $('#curPwd').value, $('#newPwd').value);
        Toast.show('Senha atualizada com sucesso.', 'success');
        $('#changePwdForm').reset();
        setFieldState('curPwdWrap', 'curPwdHint', 'default', '');
        setFieldState('newPwdWrap', 'newPwdHint', 'default', '');
      }catch(err){
        if (err.field === 'current') setFieldState('curPwdWrap', 'curPwdHint', 'error', err.message);
        else if (err.field === 'new') setFieldState('newPwdWrap', 'newPwdHint', 'error', err.message);
        else Toast.show(err.message || 'Não foi possível alterar a senha.', 'error');
      }
    });
    $('#logoutBtn').addEventListener('click', async () => {
      await Api.logout();
      State.user = null;
      State.cart = DB.getCart('guest');
      closeModal();
      Toast.show('Sessão encerrada.', 'info', 'logout');
      showAuthScreen();
    });
  }
}

/* ============================================================================
   MODAL GENÉRICO
   ========================================================================== */
function openModal(size, bodyHtml, title = ''){
  $('#modalRoot').innerHTML = `
    <div class="modal modal--${size}">
      <div class="modal__head">
        <h3>${Utils.escapeHtml(title)}</h3>
        <button class="modal__close" id="genericModalClose">${Icons.svg('close', 15)}</button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
    </div>`;
  $('#modalOverlay').classList.add('show');
  $('#modalRoot').classList.add('show');
  $('#genericModalClose').addEventListener('click', closeModal);
}
function closeModal(){
  $('#modalOverlay').classList.remove('show');
  $('#modalRoot').classList.remove('show');
  setTimeout(() => { $('#modalRoot').innerHTML = ''; }, 200);
}

/* ============================================================================
   EVENTOS DELEGADOS GLOBAIS (conteúdo re-renderizado dinamicamente)
   ========================================================================== */
function bindGlobalDelegatedEvents(){
  document.addEventListener('click', (e) => {
    const openArt = e.target.closest('[data-open-article]');
    if (openArt){ openArticleModal(openArt.dataset.openArticle); return; }

    const catChip = e.target.closest('#categoryChips [data-cat]');
    if (catChip){
      State.newsCategory = catChip.dataset.cat;
      State.visibleArticles = 6;
      renderCategoryChips();
      renderArticleGrid();
      return;
    }

    if (e.target === $('#modalOverlay')) closeModal();
  });
}
