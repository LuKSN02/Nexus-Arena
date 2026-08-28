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
  articlePage: 1,
  productPage: 1,
  cart: [],
  wishlist: [],
  notifications: [],
  coupon: null,
  maxPrice: 700,
  checkoutStep: 1,
  paymentMethod: 'card',
  shippingData: null,
  lastOrder: null,
  articles: [],
  products: [],
  lastFocused: null,
  activeTrap: null
};

const NAV_ITEMS = [
  { view: 'home', icon: 'newspaper', label: 'Notícias' },
  { view: 'shop', icon: 'box', label: 'Loja' }
];

const PAGE_SIZE_ARTICLES = 6;
const PAGE_SIZE_PRODUCTS = 6;

function cartOwnerKey(){ return State.user ? State.user.id : 'guest'; }

/* ============================================================================
   PAGINAÇÃO — helper genérico reutilizado pela grade de notícias e de produtos
   ========================================================================== */
function paginate(list, page, pageSize){
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Utils.clamp(page, 1, totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageItems: list.slice(start, start + pageSize), page: safePage, totalPages };
}

/* Gera a lista de números a mostrar no paginador, com reticências para
   intervalos longos — ex: 1 … 4 5 [6] 7 8 … 14 */
function pagerNumbers(current, total){
  const delta = 1;
  const range = [];
  for (let i = 1; i <= total; i++){
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i);
  }
  const withDots = [];
  let prev = 0;
  range.forEach(i => {
    if (prev){
      if (i - prev === 2) withDots.push(prev + 1);
      else if (i - prev > 2) withDots.push('…');
    }
    withDots.push(i);
    prev = i;
  });
  return withDots;
}

function renderPager(containerId, current, totalPages, onChange){
  const el = $('#' + containerId);
  if (!el) return;
  if (totalPages <= 1){ el.innerHTML = ''; return; }

  const nums = pagerNumbers(current, totalPages);
  el.innerHTML = `
    <button class="pager__nav" data-pager-prev ${current === 1 ? 'disabled' : ''} aria-label="Página anterior">${Icons.svg('chevronLeft', 15)}</button>
    ${nums.map(n => n === '…'
      ? `<span class="pager__dots">…</span>`
      : `<button class="pager__num ${n === current ? 'active' : ''}" data-pager-num="${n}" aria-label="Ir para página ${n}" ${n === current ? 'aria-current="page"' : ''}>${n}</button>`
    ).join('')}
    <button class="pager__nav" data-pager-next ${current === totalPages ? 'disabled' : ''} aria-label="Próxima página">${Icons.svg('chevronRight', 15)}</button>
  `;
  el.querySelectorAll('[data-pager-num]').forEach(b => b.addEventListener('click', () => onChange(Number(b.dataset.pagerNum))));
  const prevBtn = el.querySelector('[data-pager-prev]');
  const nextBtn = el.querySelector('[data-pager-next]');
  if (prevBtn && !prevBtn.disabled) prevBtn.addEventListener('click', () => onChange(current - 1));
  if (nextBtn && !nextBtn.disabled) nextBtn.addEventListener('click', () => onChange(current + 1));
}

/* ============================================================================
   ACESSIBILIDADE — foco preso em overlays (modal/carrinho) e tecla Esc
   ========================================================================== */
function getFocusable(container){
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}

function trapFocusKeydown(e, container){
  const focusable = getFocusable(container);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

function bindAccessibilityEvents(){
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){
      if (!$('#searchDropdown').classList.contains('hidden')){ closeSearchDropdown(); return; }
      if ($('#modalRoot').classList.contains('show')){ closeModal(); return; }
      if ($('#cartDrawer').classList.contains('show')){ closeCart(); return; }
      if ($('#navLinks').classList.contains('mobile-open')){
        $('#navLinks').classList.remove('mobile-open');
        $('#mobileMenuBtn').setAttribute('aria-expanded', 'false');
        $('#mobileMenuBtn').focus();
        return;
      }
    }
    if (e.key === 'Tab' && State.activeTrap){
      trapFocusKeydown(e, State.activeTrap);
    }
  });
}

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
  bindAccessibilityEvents();

  const current = Api.getCurrentUser();
  if (current){
    State.user = current;
    State.cart = DB.getCart(cartOwnerKey());
    await enterApp();
  } else {
    State.cart = DB.getCart('guest');
    showAuthScreen();
  }
}

function fillStaticIcons(){
  $('#searchIcon').innerHTML = Icons.svg('search', 16);
  $('#cartIcon').innerHTML = Icons.svg('cart', 18);
  $('#wishlistIcon').innerHTML = Icons.svg('heart', 18);
  $('#notifIcon').innerHTML = Icons.svg('bell', 18);
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

async function enterApp(){
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  updateProfileChip();
  buildTicker();
  navigateTo('home');
  renderCartDrawer();
  State.wishlist = await Api.getWishlist(cartOwnerKey());
  renderWishlistBadge();
  State.notifications = await Api.getNotifications(cartOwnerKey());
  renderNotifBadge();
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
      btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
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
      await enterApp();
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
      await enterApp();
      await pushNotification('welcome', 'Bem-vindo à Nexus Arena!', `Sua conta ${user.username}#${user.tag} foi criada com sucesso. Explore as notícias e a loja.`);
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
    const open = $('#navLinks').classList.toggle('mobile-open');
    $('#mobileMenuBtn').setAttribute('aria-expanded', String(open));
  });

  $('#navLinks').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    navigateTo(btn.dataset.view);
    $('#navLinks').classList.remove('mobile-open');
    $('#mobileMenuBtn').setAttribute('aria-expanded', 'false');
  });

  $('#searchInput').addEventListener('input', Utils.debounce((e) => {
    State.searchQuery = e.target.value.trim().toLowerCase();
    State.articlePage = 1;
    State.productPage = 1;
    renderSearchDropdown(State.searchQuery);
    if (State.view === 'home') renderHomeView();
    else if (State.view === 'shop') renderShopView();
  }, 260));

  $('#searchInput').addEventListener('focus', () => {
    if (State.searchQuery) renderSearchDropdown(State.searchQuery);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#searchBoxWrap')) closeSearchDropdown();
  });

  $('#cartBtn').addEventListener('click', openCart);
  $('#wishlistBtn').addEventListener('click', openWishlistModal);
  $('#notifBtn').addEventListener('click', openNotificationsModal);
  $('#closeCartBtn').addEventListener('click', closeCart);
  $('#cartOverlay').addEventListener('click', () => { closeCart(); closeModal(); });

  $('#profileChip').addEventListener('click', openProfilePanel);

  $('#footerProfileLink').addEventListener('click', (e) => { e.preventDefault(); openProfilePanel(); });
  $('#footerWishlistLink').addEventListener('click', (e) => { e.preventDefault(); openWishlistModal(); });
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

/* ============================================================================
   BUSCA — dropdown de resultados ao vivo (notícias + produtos)
   ========================================================================== */
function renderSearchDropdown(query){
  const dropdown = $('#searchDropdown');
  const input = $('#searchInput');
  if (!query || query.length < 2){ closeSearchDropdown(); return; }

  const newsMatches = NEWS.filter(n => n.title.toLowerCase().includes(query)).slice(0, 4);
  const productMatches = PRODUCTS.filter(p => p.name.toLowerCase().includes(query)).slice(0, 4);

  if (!newsMatches.length && !productMatches.length){
    dropdown.innerHTML = `<div class="search-dropdown__empty">Nenhum resultado para "${Utils.escapeHtml(query)}".</div>`;
  } else {
    let html = '';
    if (newsMatches.length){
      html += `<div class="search-dropdown__group-label">NOTÍCIAS</div>`;
      html += newsMatches.map(n => `
        <button type="button" class="search-dropdown__item" data-search-article="${n.id}" role="option">
          <span class="search-dropdown__item-media">${gameArt(n.category, n.id)}</span>
          <span>
            <span class="search-dropdown__item-title">${Utils.escapeHtml(n.title)}</span>
            <span class="search-dropdown__item-sub">${catInfo(n.category).label}</span>
          </span>
        </button>`).join('');
    }
    if (productMatches.length){
      html += `<div class="search-dropdown__group-label">PRODUTOS</div>`;
      html += productMatches.map(p => {
        const c = PRODUCT_CATS.find(pc => pc.key === p.category);
        return `
        <button type="button" class="search-dropdown__item" data-search-product="${p.id}" role="option">
          <span class="search-dropdown__item-media">${Icons.svg(c.icon, 18)}</span>
          <span>
            <span class="search-dropdown__item-title">${Utils.escapeHtml(p.name)}</span>
            <span class="search-dropdown__item-sub">${Utils.brl(p.price)}</span>
          </span>
        </button>`;
      }).join('');
    }
    dropdown.innerHTML = html;
  }

  dropdown.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');

  $all('[data-search-article]', dropdown).forEach(b => b.addEventListener('click', () => {
    closeSearchDropdown();
    navigateTo('home');
    openArticleModal(b.dataset.searchArticle);
  }));
  $all('[data-search-product]', dropdown).forEach(b => b.addEventListener('click', () => {
    closeSearchDropdown();
    navigateTo('shop');
    openProductModal(b.dataset.searchProduct);
  }));
}

function closeSearchDropdown(){
  const dropdown = $('#searchDropdown');
  if (!dropdown) return;
  dropdown.classList.add('hidden');
  dropdown.innerHTML = '';
  $('#searchInput')?.setAttribute('aria-expanded', 'false');
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
  closeSearchDropdown();
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
      <div class="hero-carousel" id="heroCarousel" tabindex="0" role="region" aria-roledescription="carrossel" aria-label="Manchetes em destaque">
        <div class="hero-track" id="heroTrack"></div>
        <button class="hero-nav prev" id="heroPrev" aria-label="Manchete anterior">${Icons.svg('chevronLeft', 18)}</button>
        <button class="hero-nav next" id="heroNext" aria-label="Próxima manchete">${Icons.svg('chevronRight', 18)}</button>
        <div class="hero-dots" id="heroDots"></div>
      </div>

      <div class="section-head" style="margin-top:34px;">
        <div>
          <span class="section-eyebrow">COBERTURA COMPLETA</span>
          <h2>${Icons.svg('newspaper', 20)}Últimas notícias</h2>
        </div>
        <div class="chip-row" id="categoryChips"></div>
      </div>

      <div class="home-layout">
        <div class="home-main">
          <div class="article-grid" id="articleGrid"></div>
          <div class="pager" id="articlePager"></div>
        </div>
        <aside class="home-sidebar">
          <div class="sidebar-card">
            <h3 class="sidebar-card__title">${Icons.svg('trending', 15)}Mais lidas da semana</h3>
            <div id="trendingList"></div>
          </div>
          <div class="sidebar-card newsletter-card">
            <h3 class="sidebar-card__title">${Icons.svg('mail', 15)}Newsletter</h3>
            <p>Um resumo semanal das principais notícias de e-sports, direto no seu e-mail.</p>
            <form id="newsletterForm">
              <div class="field-input" id="newsletterWrap">
                <input id="newsletterEmail" type="email" placeholder="seu@email.com" aria-label="E-mail para newsletter">
              </div>
              <div class="field-hint" id="newsletterHint"></div>
              <button type="submit" class="btn btn-primary btn-block" style="margin-top:10px;">Inscrever-se</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  `;

  const news = await Api.getNews();
  State.articles = news;

  renderHeroCarousel(news.slice(0, 4));
  renderCategoryChips();
  renderArticleGrid();
  renderTrendingList(news);
  bindNewsletterForm();
}

function renderTrendingList(news){
  const top = [...news]
    .sort((a, b) => (b.likeCount + b.comments) - (a.likeCount + a.comments))
    .slice(0, 5);
  $('#trendingList').innerHTML = top.map((a, i) => `
    <button type="button" class="trending-item" data-open-article="${a.id}">
      <span class="trending-item__rank">${i + 1}</span>
      <span class="trending-item__media">${gameArt(a.category, a.id)}</span>
      <span class="trending-item__body">
        <span class="trending-item__title">${Utils.escapeHtml(a.title)}</span>
        <span class="trending-item__stats">${Icons.svg('heart', 11)} ${a.likeCount} · ${Icons.svg('comment', 11)} ${a.comments}</span>
      </span>
    </button>`).join('');
}

function bindNewsletterForm(){
  const form = $('#newsletterForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#newsletterEmail').value.trim();
    if (!Utils.isValidEmail(email)){
      setFieldState('newsletterWrap', 'newsletterHint', 'error', 'Informe um e-mail válido.');
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Inscrevendo...';
    try{
      await Api.subscribeNewsletter(email);
      setFieldState('newsletterWrap', 'newsletterHint', 'valid', 'Inscrito! Fique de olho na sua caixa de entrada.');
      form.reset();
      Toast.show('Inscrição na newsletter confirmada.', 'success', 'mail');
      await pushNotification('newsletter', 'Inscrição na newsletter', `O e-mail ${email} foi inscrito para receber o resumo semanal de notícias.`);
    }catch(err){
      setFieldState('newsletterWrap', 'newsletterHint', 'error', err.message || 'Não foi possível concluir a inscrição.');
    }finally{
      btn.disabled = false; btn.textContent = 'Inscrever-se';
    }
  });
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

  $('#heroDots').innerHTML = slides.map((_, i) => `<button class="${i === 0 ? 'active' : ''}" data-hero-dot="${i}" aria-label="Ir para destaque ${i + 1}"></button>`).join('');
  State.heroIndex = 0;
  positionHero();

  $('#heroPrev').onclick = () => { State.heroIndex = (State.heroIndex - 1 + slides.length) % slides.length; positionHero(); restartHeroTimer(slides.length); };
  $('#heroNext').onclick = () => { State.heroIndex = (State.heroIndex + 1) % slides.length; positionHero(); restartHeroTimer(slides.length); };
  $all('[data-hero-dot]').forEach(d => d.addEventListener('click', () => { State.heroIndex = Number(d.dataset.heroDot); positionHero(); restartHeroTimer(slides.length); }));

  const carousel = $('#heroCarousel');
  carousel.addEventListener('mouseenter', () => clearInterval(State.heroTimer));
  carousel.addEventListener('mouseleave', () => restartHeroTimer(slides.length));
  carousel.addEventListener('focusin', () => clearInterval(State.heroTimer));
  carousel.addEventListener('focusout', () => restartHeroTimer(slides.length));
  carousel.onkeydown = (e) => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); $('#heroPrev').click(); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); $('#heroNext').click(); }
  };
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
  const grid = $('#articleGrid');

  if (!list.length){
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:40px 0;">Nenhuma notícia encontrada para esse filtro.</p>`;
    $('#articlePager').innerHTML = '';
    return;
  }

  const { pageItems, page, totalPages } = paginate(list, State.articlePage, PAGE_SIZE_ARTICLES);
  State.articlePage = page;
  const baseIdx = (page - 1) * PAGE_SIZE_ARTICLES;

  grid.innerHTML = pageItems.map((a, i) => `
    <article class="article-card" data-open-article="${a.id}">
      <div class="article-card__media">
        ${gameArt(a.category, a.id + i)}
        <span class="article-card__idx">${String(baseIdx + i + 1).padStart(2, '0')}</span>
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

  renderPager('articlePager', page, totalPages, (newPage) => {
    State.articlePage = newPage;
    renderArticleGrid();
    $('#articleGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ============================================================================
   ARTIGO — MODAL + COMENTÁRIOS
   ========================================================================== */
async function openArticleModal(id){
  const article = await Api.getArticle(id);
  const comments = await Api.getComments(id);
  const likesMap = DB.getArticleLikes();
  const liked = State.user ? (likesMap[id] || []).includes(State.user.id) : false;
  const related = NEWS.filter(n => n.category === article.category && n.id !== article.id).slice(0, 3);

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
        <button class="reaction-btn ${liked ? 'liked' : ''}" id="articleLikeBtn" aria-pressed="${liked}" aria-label="Curtir notícia">${Icons.svg('heart', 15)}<span id="articleLikeCount">${article.likeCount}</span></button>
        <button class="reaction-btn" id="articleShareBtn">${Icons.svg('share', 15)}Compartilhar</button>
        <button class="reaction-btn" id="articleBookmarkBtn">${Icons.svg('bookmark', 15)}Salvar</button>
      </div>

      ${related.length ? `
      <div class="related-section">
        <h3 style="font-size:14px;margin-bottom:12px;">Notícias relacionadas</h3>
        <div class="related-grid">
          ${related.map(r => `
            <button type="button" class="related-card" data-open-article="${r.id}">
              <span class="related-card__media">${gameArt(r.category, r.id)}</span>
              <span class="related-card__title">${Utils.escapeHtml(r.title)}</span>
            </button>`).join('')}
        </div>
      </div>` : ''}

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

  // Notícias relacionadas reabrem o modal com o novo artigo (delegado abaixo
  // via bindGlobalDelegatedEvents, que já escuta [data-open-article]).

  $('#articleLikeBtn').addEventListener('click', async () => {
    if (!State.user) return Toast.show('Entre na sua conta para curtir.', 'warn');
    const res = await Api.toggleArticleLike(id, State.user.id);
    $('#articleLikeBtn').classList.toggle('liked', res.liked);
    $('#articleLikeBtn').setAttribute('aria-pressed', String(res.liked));
    $('#articleLikeCount').textContent = article.likes + res.count;
    renderArticleGrid();
  });

  $('#articleShareBtn').addEventListener('click', async () => {
    const shareData = {
      title: article.title,
      text: article.excerpt,
      url: location.href
    };
    if (navigator.share){
      try{ await navigator.share(shareData); }
      catch(err){ /* usuário cancelou o compartilhamento — não é um erro */ }
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      try{
        await navigator.clipboard.writeText(shareData.url);
        Toast.show('Link copiado para a área de transferência.', 'success', 'share');
      }catch(err){
        Toast.show('Não foi possível copiar o link.', 'error');
      }
      return;
    }
    Toast.show('Compartilhamento não suportado neste navegador.', 'warn');
  });

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
    const topLevel = list.filter(c => !c.parentId);
    if (!topLevel.length){
      box.innerHTML = `<p style="color:var(--text-faint);">Seja o primeiro a comentar.</p>`;
      return;
    }

    const commentHtml = (c, isReply) => {
      const likedByMe = State.user && c.likes.includes(State.user.id);
      const mine = State.user && c.userId === State.user.id;
      return `
      <div class="comment ${isReply ? 'comment--reply' : ''}" data-comment-id="${c.id}">
        <img class="avatar" src="${c.avatar}" width="${isReply ? 26 : 34}" height="${isReply ? 26 : 34}" alt="" loading="lazy" decoding="async">
        <div class="comment__body">
          <div class="comment__head">
            <span class="comment__name">${Utils.escapeHtml(c.username)}</span>
            <span class="comment__time">${Utils.timeAgo(c.createdAt)}</span>
          </div>
          <p class="comment__text">${Utils.escapeHtml(c.text)}</p>
          <div class="comment__actions">
            <button data-like-comment="${c.id}" class="${likedByMe ? 'liked' : ''}">${Icons.svg('heart', 13)} ${c.likes.length}</button>
            ${!isReply ? `<button data-reply-to="${c.id}">${Icons.svg('comment', 13)} Responder</button>` : ''}
            ${mine ? `<button data-delete-comment="${c.id}">${Icons.svg('trash', 13)} Remover</button>` : ''}
          </div>
        </div>
      </div>`;
    };

    box.innerHTML = topLevel.map(c => {
      const replies = list.filter(r => r.parentId === c.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return `
      <div class="comment-thread">
        ${commentHtml(c, false)}
        ${replies.length ? `<div class="comment-replies">${replies.map(r => commentHtml(r, true)).join('')}</div>` : ''}
        ${State.user ? `
          <div class="reply-form-wrap hidden" id="replyFormWrap-${c.id}">
            <textarea id="replyInput-${c.id}" placeholder="Escreva uma resposta..." maxlength="500"></textarea>
            <button class="btn btn-secondary btn-sm" data-reply-submit="${c.id}">Responder</button>
          </div>` : ''}
      </div>`;
    }).join('');

    $all('[data-reply-to]').forEach(b => b.addEventListener('click', () => {
      if (!State.user) return Toast.show('Entre na sua conta para responder.', 'warn');
      const wrap = $('#replyFormWrap-' + b.dataset.replyTo);
      wrap.classList.toggle('hidden');
      if (!wrap.classList.contains('hidden')) $('#replyInput-' + b.dataset.replyTo).focus();
    }));

    $all('[data-reply-submit]').forEach(b => b.addEventListener('click', async () => {
      const parentId = b.dataset.replySubmit;
      const input = $('#replyInput-' + parentId);
      b.disabled = true;
      try{
        await Api.addComment(id, State.user, input.value, parentId);
        const fresh = await Api.getComments(id);
        renderCommentList(fresh);
        $('#commentCount').textContent = fresh.length;
        Toast.show('Resposta publicada.', 'success');
      }catch(err){
        Toast.show(err.message || 'Não foi possível responder.', 'error');
      }finally{
        b.disabled = false;
      }
    }));

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
          <div class="pager" id="productPager"></div>
        </div>
      </div>
    </div>
  `;

  State.products = await Api.getProducts();
  renderShopFilters();
  renderProductGrid();

  $('#priceSlider').addEventListener('input', (e) => {
    State.maxPrice = Number(e.target.value);
    State.productPage = 1;
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
    State.productPage = 1;
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
    $('#productPager').innerHTML = '';
    return;
  }
  const { pageItems, page, totalPages } = paginate(list, State.productPage, PAGE_SIZE_PRODUCTS);
  State.productPage = page;

  const catMeta = key => PRODUCT_CATS.find(c => c.key === key);
  grid.innerHTML = pageItems.map(p => {
    const c = catMeta(p.category);
    const wished = State.wishlist.includes(p.id);
    return `
    <div class="product-card">
      ${p.tag ? `<span class="product-card__tag">${p.tag}</span>` : ''}
      <button class="wishlist-toggle ${wished ? 'active' : ''}" data-wishlist-toggle="${p.id}" aria-label="${wished ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${wished}">${Icons.svg('heart', 15)}</button>
      <div class="product-card__clickable" data-open-product="${p.id}">
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
      </div>
      <div class="product-card__foot">
        <div class="add-cart-row">
          <div class="qty-stepper">
            <button type="button" data-qty-minus="${p.id}" aria-label="Diminuir quantidade">${Icons.svg('minus', 13)}</button>
            <span id="qty-${p.id}">1</span>
            <button type="button" data-qty-plus="${p.id}" aria-label="Aumentar quantidade">${Icons.svg('plus', 13)}</button>
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
  $all('[data-wishlist-toggle]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWishlist(b.dataset.wishlistToggle);
  }));
  $all('[data-open-product]').forEach(el => el.addEventListener('click', () => openProductModal(el.dataset.openProduct)));

  renderPager('productPager', page, totalPages, (newPage) => {
    State.productPage = newPage;
    renderProductGrid();
    $('#productGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
  let shipping = subtotal === 0 ? 0 : (subtotal >= 300 ? 0 : 24.9);
  let discount = 0;
  if (State.coupon && subtotal > 0){
    if (State.coupon.type === 'percent') discount = subtotal * (State.coupon.value / 100);
    else if (State.coupon.type === 'shipping') shipping = 0;
  }
  const total = Math.max(0, subtotal - discount + shipping);
  return { items, subtotal, shipping, discount, total };
}

function renderCartDrawer(){
  const { items, subtotal, shipping, discount, total } = cartTotals();
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
            <button type="button" data-cart-minus="${i.productId}" aria-label="Diminuir quantidade">${Icons.svg('minus', 12)}</button>
            <span>${i.qty}</span>
            <button type="button" data-cart-plus="${i.productId}" aria-label="Aumentar quantidade">${Icons.svg('plus', 12)}</button>
          </div>
          <span class="price" style="font-size:14px;">${Utils.brl(i.product.price * i.qty)}</span>
        </div>
      </div>
      <button class="cart-item__remove" data-cart-remove="${i.productId}" aria-label="Remover ${Utils.escapeHtml(i.product.name)} do carrinho">${Icons.svg('trash', 15)}</button>
    </div>`;
  }).join('');

  $('#cartFoot').innerHTML = `
    <div class="coupon-row">
      ${State.coupon
        ? `<div class="coupon-applied"><span>${Icons.svg('tag', 13)} ${State.coupon.code} aplicado</span><button type="button" id="removeCouponBtn" aria-label="Remover cupom">${Icons.svg('close', 12)}</button></div>`
        : `<div class="field-input" id="couponWrap"><input id="couponInput" placeholder="Cupom de desconto"><button type="button" class="btn btn-ghost btn-sm" id="applyCouponBtn" style="margin:4px;">Aplicar</button></div>`
      }
    </div>
    <div class="summary-row"><span>Subtotal</span><span class="mono">${Utils.brl(subtotal)}</span></div>
    ${discount > 0 ? `<div class="summary-row" style="color:var(--teal);"><span>Desconto</span><span class="mono">-${Utils.brl(discount)}</span></div>` : ''}
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

  const applyCouponBtn = $('#applyCouponBtn');
  if (applyCouponBtn) applyCouponBtn.addEventListener('click', () => applyCouponFlow($('#couponInput').value, renderCartDrawer));
  const removeCouponBtn = $('#removeCouponBtn');
  if (removeCouponBtn) removeCouponBtn.addEventListener('click', () => { State.coupon = null; renderCartDrawer(); Toast.show('Cupom removido.', 'info'); });

  const goCheckout = $('#goCheckoutBtn');
  if (goCheckout) goCheckout.addEventListener('click', () => {
    closeCart();
    State.checkoutStep = 1;
    navigateTo('checkout');
  });
}

async function applyCouponFlow(code, onDone){
  if (!code || !code.trim()) return Toast.show('Digite um código de cupom.', 'warn');
  try{
    const coupon = await Api.applyCoupon(code);
    State.coupon = coupon;
    Toast.show(`Cupom aplicado: ${coupon.label}.`, 'success', 'tag');
    onDone();
  }catch(err){
    Toast.show(err.message || 'Não foi possível aplicar o cupom.', 'error');
  }
}

function openCart(){
  renderCartDrawer();
  State.lastFocused = document.activeElement;
  $('#cartOverlay').classList.add('show');
  $('#cartDrawer').classList.add('show');
  $('#cartDrawer').setAttribute('aria-hidden', 'false');
  State.activeTrap = $('#cartDrawer');
  requestAnimationFrame(() => {
    const focusable = getFocusable($('#cartDrawer'));
    (focusable[0] || $('#cartDrawer')).focus();
  });
}
function closeCart(){
  $('#cartOverlay').classList.remove('show');
  $('#cartDrawer').classList.remove('show');
  $('#cartDrawer').setAttribute('aria-hidden', 'true');
  if (State.activeTrap === $('#cartDrawer')) State.activeTrap = null;
  if (State.lastFocused){ State.lastFocused.focus(); State.lastFocused = null; }
}

/* ============================================================================
   LISTA DE DESEJOS
   ========================================================================== */
function renderWishlistBadge(){
  $('#wishlistCount').textContent = State.wishlist.length;
  $('#wishlistCount').classList.toggle('hidden', State.wishlist.length === 0);
}

async function toggleWishlist(productId){
  if (!State.user) return Toast.show('Entre na sua conta para usar a lista de desejos.', 'warn');
  const res = await Api.toggleWishlist(cartOwnerKey(), productId);
  State.wishlist = res.list;
  renderWishlistBadge();
  const product = PRODUCTS.find(p => p.id === productId);
  Toast.show(res.inWishlist ? `${product.name} adicionado aos favoritos.` : `${product.name} removido dos favoritos.`, 'info', 'heart');
  $all(`[data-wishlist-toggle="${productId}"]`).forEach(b => {
    b.classList.toggle('active', res.inWishlist);
    b.setAttribute('aria-pressed', String(res.inWishlist));
  });
}

function openWishlistModal(){
  const items = State.wishlist.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  if (!items.length){
    openModal('sm', `
      <div class="cart-empty">
        ${Icons.svg('heart', 40)}
        <p>Sua lista de desejos está vazia.</p>
      </div>`, 'Lista de desejos');
    return;
  }
  openModal('md', `
    <div class="wishlist-list">
      ${items.map(p => {
        const c = PRODUCT_CATS.find(pc => pc.key === p.category);
        return `
        <div class="cart-item" data-wishlist-row="${p.id}">
          <div class="cart-item__media">${Icons.svg(c.icon, 26)}</div>
          <div class="cart-item__info">
            <div class="cart-item__name">${Utils.escapeHtml(p.name)}</div>
            <div class="cart-item__cat">${c.label}</div>
            <div class="cart-item__row">
              <span class="price" style="font-size:14px;">${Utils.brl(p.price)}</span>
              <button class="btn btn-primary btn-sm" data-wishlist-add-cart="${p.id}">${Icons.svg('cart', 13)} Adicionar</button>
            </div>
          </div>
          <button class="cart-item__remove" data-wishlist-remove="${p.id}" aria-label="Remover ${Utils.escapeHtml(p.name)} da lista de desejos">${Icons.svg('trash', 15)}</button>
        </div>`;
      }).join('')}
    </div>
  `, 'Lista de desejos');

  $all('[data-wishlist-add-cart]').forEach(b => b.addEventListener('click', () => {
    addToCart(b.dataset.wishlistAddCart, 1);
  }));
  $all('[data-wishlist-remove]').forEach(b => b.addEventListener('click', async () => {
    await toggleWishlist(b.dataset.wishlistRemove);
    const row = $(`[data-wishlist-row="${b.dataset.wishlistRemove}"]`);
    if (row) row.remove();
    if (!State.wishlist.length){
      $('#modalRoot .modal__body').innerHTML = `
        <div class="cart-empty">
          ${Icons.svg('heart', 40)}
          <p>Sua lista de desejos está vazia.</p>
        </div>`;
    }
  }));
}

/* ============================================================================
   CENTRAL DE NOTIFICAÇÕES
   ========================================================================== */
const NOTIF_ICONS = { welcome: 'user', order: 'package', badge: 'shield', newsletter: 'mail', default: 'bell' };

function renderNotifBadge(){
  const unread = State.notifications.filter(n => !n.read).length;
  $('#notifCount').textContent = unread;
  $('#notifCount').classList.toggle('hidden', unread === 0);
}

async function pushNotification(type, title, message, meta = null){
  if (!State.user) return;
  State.notifications = await Api.addNotification(cartOwnerKey(), { type, title, message, meta });
  renderNotifBadge();
}

function openNotificationsModal(){
  if (!State.user) return Toast.show('Entre na sua conta para ver notificações.', 'warn');
  if (!State.notifications.length){
    openModal('sm', `
      <div class="cart-empty">
        ${Icons.svg('bell', 40)}
        <p>Você ainda não tem notificações.</p>
      </div>`, 'Notificações');
    return;
  }

  openModal('md', `
    <div class="notif-toolbar">
      <button class="btn btn-ghost btn-sm" id="markAllReadBtn">${Icons.svg('checkCircle', 13)} Marcar todas como lidas</button>
    </div>
    <div id="notifList"></div>
  `, 'Notificações');

  renderNotifList();

  $('#markAllReadBtn').addEventListener('click', async () => {
    State.notifications = await Api.markAllNotificationsRead(cartOwnerKey());
    renderNotifBadge();
    renderNotifList();
  });

  function renderNotifList(){
    $('#notifList').innerHTML = State.notifications.map(n => `
      <button type="button" class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}">
        <span class="notif-item__icon">${Icons.svg(NOTIF_ICONS[n.type] || NOTIF_ICONS.default, 16)}</span>
        <span class="notif-item__body">
          <span class="notif-item__title">${Utils.escapeHtml(n.title)}</span>
          <span class="notif-item__msg">${Utils.escapeHtml(n.message)}</span>
          <span class="notif-item__time">${Utils.timeAgo(n.createdAt)}</span>
        </span>
        ${!n.read ? `<span class="notif-item__dot" aria-hidden="true"></span>` : ''}
      </button>`).join('');

    $all('[data-notif-id]').forEach(b => b.addEventListener('click', async () => {
      if (b.classList.contains('unread')){
        State.notifications = await Api.markNotificationRead(cartOwnerKey(), b.dataset.notifId);
        renderNotifBadge();
        renderNotifList();
      }
    }));
  }
}

/* ============================================================================
   MODAL DE DETALHE DO PRODUTO + AVALIAÇÕES
   ========================================================================== */
function starIcon(filled, size = 14){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 3 14.8 9 21.3 9.6 16.4 13.9 17.9 20.3 12 16.9 6.1 20.3 7.6 13.9 2.7 9.6 9.2 9 12 3"/></svg>`;
}
function starsRow(rating, size = 14){
  let out = '';
  for (let i = 1; i <= 5; i++) out += starIcon(i <= Math.round(rating), size);
  return out;
}

async function openProductModal(id){
  const product = await Api.getProduct(id);
  const reviews = await Api.getReviews(id);
  const c = PRODUCT_CATS.find(pc => pc.key === product.category);
  const wished = State.wishlist.includes(id);
  const myReview = State.user ? reviews.find(r => r.userId === State.user.id) : null;

  const avgUserRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : null;

  openModal('lg', `
    <div class="product-detail">
      <div class="product-detail__media">${Icons.svg(c.icon, 90)}</div>
      <div>
        <span class="product-detail__cat">${c.label}</span>
        <h2>${Utils.escapeHtml(product.name)}</h2>
        <div class="product-detail__rating">${starsRow(product.rating, 15)} <span class="mono">${product.rating} · ${product.reviews} avaliações do catálogo</span></div>
        <p style="margin-bottom:16px;">${Utils.escapeHtml(product.desc)}</p>
        <div class="product-detail__price-row">
          <span class="price">${Utils.brl(product.price)}</span>
          ${product.oldPrice ? `<span class="price-old">${Utils.brl(product.oldPrice)}</span>` : ''}
        </div>
        <div class="product-detail__actions">
          <div class="qty-stepper">
            <button type="button" id="pdQtyMinus" aria-label="Diminuir quantidade">${Icons.svg('minus', 13)}</button>
            <span id="pdQty">1</span>
            <button type="button" id="pdQtyPlus" aria-label="Aumentar quantidade">${Icons.svg('plus', 13)}</button>
          </div>
          <button class="btn btn-primary" id="pdAddCart">${Icons.svg('cart', 15)} Adicionar ao carrinho</button>
          <button class="reaction-btn ${wished ? 'liked' : ''}" id="pdWishlistBtn" aria-pressed="${wished}">${Icons.svg('heart', 15)} ${wished ? 'Nos favoritos' : 'Favoritar'}</button>
        </div>
      </div>
    </div>

    <div class="reviews-section">
      <h3 style="font-size:15px;display:flex;align-items:center;gap:8px;margin-bottom:14px;">${Icons.svg('star', 16)}Avaliações de compradores (<span id="reviewCount">${reviews.length}</span>)</h3>
      ${avgUserRating ? `
        <div class="reviews-summary">
          <span class="big-rating">${avgUserRating.toFixed(1)}</span>
          <div>
            <div style="color:var(--gold);">${starsRow(avgUserRating, 15)}</div>
            <span style="font-size:12px;color:var(--text-faint);">baseado em ${reviews.length} avaliação(ões) de usuários</span>
          </div>
        </div>` : ''}

      ${State.user ? `
        <div class="review-form">
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">${myReview ? 'Editar sua avaliação' : 'Deixe sua avaliação'}</label>
          <div class="star-input" id="reviewStarInput" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${(myReview?.rating || 0) >= n ? 'on' : ''}" aria-label="${n} estrela(s)">${starIcon(true, 22)}</button>`).join('')}
          </div>
          <textarea id="reviewText" placeholder="Conte como foi sua experiência com o produto..." maxlength="400" style="width:100%;margin-top:10px;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:10px;font-size:13px;min-height:60px;resize:none;">${myReview ? Utils.escapeHtml(myReview.text) : ''}</textarea>
          <button class="btn btn-primary btn-sm" id="submitReviewBtn" style="margin-top:10px;">${myReview ? 'Atualizar avaliação' : 'Publicar avaliação'}</button>
        </div>` : `<p style="margin-bottom:16px;">Entre na sua conta para avaliar este produto.</p>`}

      <div id="reviewList"></div>
    </div>
  `, 'Detalhes do produto');

  renderReviewList(reviews);

  let qty = 1;
  $('#pdQtyMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#pdQty').textContent = qty; });
  $('#pdQtyPlus').addEventListener('click', () => { qty = Math.min(20, qty + 1); $('#pdQty').textContent = qty; });
  $('#pdAddCart').addEventListener('click', () => addToCart(id, qty));
  $('#pdWishlistBtn').addEventListener('click', async () => {
    await toggleWishlist(id);
    const nowWished = State.wishlist.includes(id);
    $('#pdWishlistBtn').classList.toggle('liked', nowWished);
    $('#pdWishlistBtn').setAttribute('aria-pressed', String(nowWished));
    $('#pdWishlistBtn').innerHTML = `${Icons.svg('heart', 15)} ${nowWished ? 'Nos favoritos' : 'Favoritar'}`;
  });

  let selectedRating = myReview?.rating || 0;
  const starBtns = $all('#reviewStarInput [data-star]');
  starBtns.forEach(b => b.addEventListener('click', () => {
    selectedRating = Number(b.dataset.star);
    starBtns.forEach(x => x.classList.toggle('on', Number(x.dataset.star) <= selectedRating));
  }));

  const submitReviewBtn = $('#submitReviewBtn');
  if (submitReviewBtn){
    submitReviewBtn.addEventListener('click', async () => {
      submitReviewBtn.disabled = true;
      try{
        await Api.addReview(id, State.user, { rating: selectedRating, text: $('#reviewText').value });
        const fresh = await Api.getReviews(id);
        renderReviewList(fresh);
        $('#reviewCount').textContent = fresh.length;
        Toast.show('Avaliação publicada. Obrigado pelo feedback!', 'success');
      }catch(err){
        Toast.show(err.message || 'Não foi possível publicar a avaliação.', 'error');
      }finally{
        submitReviewBtn.disabled = false;
      }
    });
  }

  function renderReviewList(list){
    const box = $('#reviewList');
    if (!list.length){
      box.innerHTML = `<p style="color:var(--text-faint);">Ainda não há avaliações de usuários para este produto — seja o primeiro.</p>`;
      return;
    }
    box.innerHTML = list.map(r => `
      <div class="review-item">
        <img class="avatar" src="${r.avatar}" width="34" height="34" alt="" loading="lazy" decoding="async">
        <div>
          <div class="comment__head">
            <span class="comment__name">${Utils.escapeHtml(r.username)}</span>
            ${r.verified ? `<span class="review-item__verified">${Icons.svg('checkCircle', 12)} Compra verificada</span>` : ''}
            <span class="comment__time">${Utils.timeAgo(r.createdAt)}</span>
          </div>
          <div class="review-item__stars">${starsRow(r.rating, 13)}</div>
          <p class="comment__text">${Utils.escapeHtml(r.text)}</p>
          ${State.user && r.userId === State.user.id ? `<div class="comment__actions"><button data-delete-review="${r.id}">${Icons.svg('trash', 13)} Remover</button></div>` : ''}
        </div>
      </div>
    `).join('');

    $all('[data-delete-review]').forEach(b => b.addEventListener('click', async () => {
      await Api.deleteReview(b.dataset.deleteReview, State.user.id);
      const fresh = await Api.getReviews(id);
      renderReviewList(fresh);
      $('#reviewCount').textContent = fresh.length;
      Toast.show('Avaliação removida.', 'info', 'trash');
    }));
  }
}

/* ============================================================================
   CHECKOUT
   ========================================================================== */
function renderCheckoutView(){
  const { items, subtotal, shipping, discount, total } = cartTotals();
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
          <div class="coupon-row">
            ${State.coupon
              ? `<div class="coupon-applied"><span>${Icons.svg('tag', 13)} ${State.coupon.code} aplicado</span><button type="button" id="removeCouponBtnCo" aria-label="Remover cupom">${Icons.svg('close', 12)}</button></div>`
              : `<div class="field-input" id="couponWrapCo"><input id="couponInputCo" placeholder="Cupom de desconto"><button type="button" class="btn btn-ghost btn-sm" id="applyCouponBtnCo" style="margin:4px;">Aplicar</button></div>`
            }
          </div>
          <div class="summary-row"><span>Subtotal</span><span class="mono">${Utils.brl(subtotal)}</span></div>
          ${discount > 0 ? `<div class="summary-row" style="color:var(--teal);"><span>Desconto</span><span class="mono">-${Utils.brl(discount)}</span></div>` : ''}
          <div class="summary-row"><span>Frete</span><span class="mono">${shipping === 0 ? 'Grátis' : Utils.brl(shipping)}</span></div>
          <div class="summary-row total"><span>Total</span><span class="price">${Utils.brl(total)}</span></div>
        </aside>
      </div>
    </div>
  `;
  State.checkoutStep === 1 ? renderShippingStep() : renderPaymentStep();

  const applyCouponBtnCo = $('#applyCouponBtnCo');
  if (applyCouponBtnCo) applyCouponBtnCo.addEventListener('click', () => applyCouponFlow($('#couponInputCo').value, renderCheckoutView));
  const removeCouponBtnCo = $('#removeCouponBtnCo');
  if (removeCouponBtnCo) removeCouponBtnCo.addEventListener('click', () => { State.coupon = null; renderCheckoutView(); Toast.show('Cupom removido.', 'info'); });
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

  const { items, subtotal, shipping, discount, total } = cartTotals();
  try{
    const order = await Api.placeOrder(cartOwnerKey(), {
      items: items.map(i => ({ productId: i.productId, name: i.product.name, qty: i.qty, price: i.product.price })),
      subtotal, shipping, discount, total,
      coupon: State.coupon ? State.coupon.code : null,
      shippingData: State.shippingData,
      paymentMethod: State.paymentMethod
    });
    State.cart = [];
    State.coupon = null;
    State.lastOrder = order;
    renderCartDrawer();
    await pushNotification('order', 'Pedido confirmado', `Pedido #${order.id} no valor de ${Utils.brl(order.total)} foi confirmado.`, { orderId: order.id });
    if (State.user && !State.user.badges.includes('buyer')){
      State.user = await Api.updateProfile(State.user.id, { badges: [...State.user.badges, 'buyer'] });
      await pushNotification('badge', 'Novo emblema conquistado', 'Você ganhou o emblema "Comprador verificado" pela sua primeira compra.');
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
        <button class="ptab" data-ptab="pedidos">MEUS PEDIDOS</button>
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
          ${BANNER_COLORS.map(c => `<button type="button" class="swatch ${!u.bannerImage && u.banner === c ? 'active' : ''}" data-banner="${c}" style="background:${c};" aria-label="Cor de banner ${c}" aria-pressed="${!u.bannerImage && u.banner === c}"></button>`).join('')}
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
  } else if (tab === 'pedidos'){
    box.innerHTML = `<p style="color:var(--text-faint);">Carregando pedidos...</p>`;
    Api.getOrderHistory(cartOwnerKey()).then(orders => {
      if (!orders.length){
        box.innerHTML = `
          <div class="cart-empty" style="padding:30px 10px;">
            ${Icons.svg('package', 36)}
            <p>Você ainda não fez nenhum pedido.</p>
          </div>`;
        return;
      }
      box.innerHTML = orders.map(o => `
        <div class="order-card">
          <button type="button" class="order-card__head" data-order-toggle="${o.id}">
            <span class="order-card__info">
              <span class="order-card__id mono">#${o.id}</span>
              <span class="order-card__date">${new Date(o.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </span>
            <span class="order-card__status">Confirmado</span>
            <span class="order-card__total price">${Utils.brl(o.total)}</span>
            ${Icons.svg('chevronDown', 15)}
          </button>
          <div class="order-card__body hidden" id="orderBody-${o.id}">
            ${o.items.map(i => `<div class="mini-item"><span>${i.qty}x ${Utils.escapeHtml(i.name)}</span><span class="mono">${Utils.brl(i.price * i.qty)}</span></div>`).join('')}
            <div class="panel-divider"></div>
            <div class="summary-row"><span>Subtotal</span><span class="mono">${Utils.brl(o.subtotal)}</span></div>
            ${o.discount ? `<div class="summary-row" style="color:var(--teal);"><span>Desconto${o.coupon ? ' (' + o.coupon + ')' : ''}</span><span class="mono">-${Utils.brl(o.discount)}</span></div>` : ''}
            <div class="summary-row"><span>Frete</span><span class="mono">${o.shipping === 0 ? 'Grátis' : Utils.brl(o.shipping)}</span></div>
            <div class="summary-row total"><span>Total</span><span class="price">${Utils.brl(o.total)}</span></div>
            <p style="font-size:11.5px;margin-top:8px;">Pagamento: ${{ card: 'Cartão de crédito', pix: 'Pix', boleto: 'Boleto' }[o.paymentMethod] || o.paymentMethod}</p>
          </div>
        </div>
      `).join('');

      $all('[data-order-toggle]').forEach(b => b.addEventListener('click', () => {
        $('#orderBody-' + b.dataset.orderToggle).classList.toggle('hidden');
        b.closest('.order-card').classList.toggle('open');
      }));
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
      <h4 style="font-size:12px;color:var(--text-faint);letter-spacing:.1em;margin-bottom:12px;">DADOS E PRIVACIDADE</h4>
      <button class="btn btn-secondary btn-block" id="exportDataBtn" style="margin-bottom:10px;">${Icons.svg('box', 15)} Exportar meus dados (JSON)</button>
      <button class="btn btn-ghost btn-block" id="showDeleteAccountBtn" style="border-color:var(--signal);color:var(--signal);">${Icons.svg('trash', 15)} Excluir minha conta</button>
      <div class="hidden" id="deleteAccountPanel">
        <div class="form-alert" style="margin-top:12px;">
          ${Icons.svg('alertCircle', 16)}
          <span>Essa ação é permanente. Sua conta, carrinho, lista de desejos e notificações serão apagados e você será desconectado.</span>
        </div>
        <div class="field">
          <label>Digite EXCLUIR para confirmar</label>
          <div class="field-input"><input id="deleteConfirmText" placeholder="EXCLUIR"></div>
        </div>
        <div class="field">
          <label>Confirme sua senha</label>
          <div class="field-input" id="deletePwdWrap"><input id="deletePwd" type="password"></div>
          <div class="field-hint" id="deletePwdHint"></div>
        </div>
        <button class="btn btn-primary btn-block" id="confirmDeleteAccountBtn" style="background:var(--signal);" disabled>Excluir permanentemente</button>
      </div>
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
      State.wishlist = [];
      State.coupon = null;
      renderWishlistBadge();
      closeModal();
      Toast.show('Sessão encerrada.', 'info', 'logout');
      showAuthScreen();
    });

    $('#exportDataBtn').addEventListener('click', async () => {
      const btn = $('#exportDataBtn');
      btn.disabled = true;
      try{
        const data = await Api.exportAccountData(u.id);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus-arena-dados-${u.username}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        Toast.show('Seus dados foram exportados.', 'success', 'box');
      }catch(err){
        Toast.show(err.message || 'Não foi possível exportar seus dados.', 'error');
      }finally{
        btn.disabled = false;
      }
    });

    $('#showDeleteAccountBtn').addEventListener('click', () => {
      $('#deleteAccountPanel').classList.toggle('hidden');
    });

    const checkDeleteReady = () => {
      const ready = $('#deleteConfirmText').value.trim().toUpperCase() === 'EXCLUIR' && $('#deletePwd').value.length > 0;
      $('#confirmDeleteAccountBtn').disabled = !ready;
    };
    $('#deleteConfirmText').addEventListener('input', checkDeleteReady);
    $('#deletePwd').addEventListener('input', checkDeleteReady);

    $('#confirmDeleteAccountBtn').addEventListener('click', async () => {
      const btn = $('#confirmDeleteAccountBtn');
      btn.disabled = true; btn.textContent = 'Excluindo...';
      try{
        await Api.deleteAccount(u.id, $('#deletePwd').value);
        State.user = null;
        State.cart = [];
        State.wishlist = [];
        State.notifications = [];
        State.coupon = null;
        closeModal();
        Toast.show('Sua conta foi excluída.', 'info', 'trash');
        showAuthScreen();
      }catch(err){
        setFieldState('deletePwdWrap', 'deletePwdHint', 'error', err.message || 'Não foi possível excluir a conta.');
        btn.disabled = false; btn.textContent = 'Excluir permanentemente';
      }
    });
  }
}

/* ============================================================================
   MODAL GENÉRICO
   ========================================================================== */
function openModal(size, bodyHtml, title = ''){
  const alreadyOpen = $('#modalRoot').classList.contains('show');
  if (!alreadyOpen) State.lastFocused = document.activeElement;
  $('#modalRoot').innerHTML = `
    <div class="modal modal--${size}" role="dialog" aria-modal="true" aria-labelledby="modalTitleEl">
      <div class="modal__head">
        <h3 id="modalTitleEl">${Utils.escapeHtml(title)}</h3>
        <button class="modal__close" id="genericModalClose" aria-label="Fechar">${Icons.svg('close', 15)}</button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
    </div>`;
  $('#modalOverlay').classList.add('show');
  $('#modalRoot').classList.add('show');
  $('#genericModalClose').addEventListener('click', closeModal);

  const modalEl = $('#modalRoot .modal');
  State.activeTrap = modalEl;
  requestAnimationFrame(() => {
    const focusable = getFocusable(modalEl);
    (focusable[0] || modalEl).focus();
  });
}
function closeModal(){
  $('#modalOverlay').classList.remove('show');
  $('#modalRoot').classList.remove('show');
  if (State.activeTrap === $('#modalRoot .modal')) State.activeTrap = null;
  setTimeout(() => { $('#modalRoot').innerHTML = ''; }, 200);
  if (State.lastFocused){ State.lastFocused.focus(); State.lastFocused = null; }
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
      State.articlePage = 1;
      renderCategoryChips();
      renderArticleGrid();
      return;
    }

    if (e.target === $('#modalOverlay')) closeModal();
  });
}
