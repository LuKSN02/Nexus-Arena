/* ==========================================================================
   app.js — Estado da aplicação, roteamento de views e interações
   ========================================================================== */

/* Troque pelo(s) seu(s) e-mail(s) de conta na Nexus Arena — só essas contas
   veem a aba ADMIN (disparo de newsletter) no painel de perfil. */
const ADMIN_EMAILS = ['trajano.neves01@gmail.com'];

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
  bookmarks: [],
  seasonPass: null,
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
  fillStaticIcons();
  bindAuthEvents();
  bindShellEvents();
  bindGlobalDelegatedEvents();
  bindAccessibilityEvents();

  await Api.seedIfNeeded();

  // Se acabamos de voltar do redirect do Discord, isso resolve com o
  // usuário já logado/criado. Senão, cai no fluxo normal de sessão.
  let current = null;
  try{
    current = await Api.handleDiscordRedirect();
  }catch(err){
    console.error('Erro inesperado no login com Discord:', err);
    Toast.show('Não foi possível entrar com o Discord. Tente novamente.', 'error', 'alertCircle');
  }
  if (!current) current = await Api.onAuthReady();
  if (current){
    State.user = current;
    State.cart = await Api.getCart(cartOwnerKey());
    await enterApp();
  } else {
    State.cart = await DB.getCart('guest');
    showAuthScreen();
  }
}

function fillStaticIcons(){
  $('#searchIcon').innerHTML = Icons.svg('search', 16);
  $('#cartIcon').innerHTML = Icons.svg('cart', 18);
  $('#wishlistIcon').innerHTML = Icons.svg('heart', 18);
  $('#notifIcon').innerHTML = Icons.svg('bell', 18);
  $('#coinChipIcon').innerHTML = Icons.svg('diamond', 15);
  $('#coinChipAdd').innerHTML = Icons.svg('plus', 11);
  $('#passChipIcon').innerHTML = Icons.svg('star', 15);
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
  State.bookmarks = await Api.getBookmarks(cartOwnerKey());
  State.seasonPass = await Api.getSeasonPass(cartOwnerKey());
  updateSeasonPassChip();
  State.notifications = await Api.getNotifications(cartOwnerKey());
  renderNotifBadge();

  const sharedArticleId = new URLSearchParams(location.search).get('article');
  if (sharedArticleId) openArticleModal(sharedArticleId);

  await claimDailyBonusIfAvailable();
}

/* Roda uma vez por sessão iniciada (login ou F5 com sessão já ativa).
   Silencioso quando já foi resgatado hoje — DAILY_BONUS_AMOUNT é pequeno
   de propósito para não inflacionar a economia da Loja de Recompensas. */
async function claimDailyBonusIfAvailable(){
  if (!State.user) return;
  try{
    const result = await Api.claimDailyBonus(State.user.id);
    if (!result.claimed) return;

    State.user.coins = result.coins;
    updateProfileChip();

    const streakMsg = result.streak > 1 ? ` (sequência de ${result.streak} dias)` : '';
    Toast.show(`+${result.amount} moedas Nexus — bônus diário${streakMsg}!`, 'success', 'diamond');
    await pushNotification('order', 'Bônus diário resgatado', `Você recebeu ${result.amount} moedas Nexus só por logar hoje${streakMsg}.`);
    await grantSeasonXp(50);
  }catch(err){
    console.error('Erro ao resgatar bônus diário:', err);
  }
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

  // ---- login social (OAuth2) ----
  $all('[data-social-icon]').forEach(el => {
    el.innerHTML = Icons.svg(el.dataset.socialIcon, 18);
  });
  $all('[data-social]').forEach(btn => btn.addEventListener('click', async () => {
    // Discord não usa popup do Firebase — redireciona a página inteira pro
    // Discord e volta com o token na URL (ver handleDiscordRedirect em init()).
    if (btn.dataset.social === 'discord'){
      Api.startDiscordLogin();
      return;
    }
    $('#authAlert').innerHTML = '';
    btn.disabled = true;
    try{
      const user = await Api.loginWithProvider(btn.dataset.social);
      State.user = user;
      State.cart = await Api.getCart(cartOwnerKey());
      Toast.show(`Bem-vindo, ${user.username}!`, 'success', 'checkCircle');
      await enterApp();
    }catch(err){
      showFormAlert('#authAlert', err.message || 'Não foi possível entrar com essa rede.');
    }finally{
      btn.disabled = false;
    }
  }));

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'gotoRegister'){ e.preventDefault(); switchAuthTab('register'); }
    if (e.target && e.target.id === 'gotoLogin'){ e.preventDefault(); switchAuthTab('login'); }
  });

  $('#forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    openForgotPasswordModal();
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
      State.cart = await Api.getCart(cartOwnerKey());
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
  $('#regUsername').addEventListener('input', Utils.debounce(async (e) => {
    const v = e.target.value.trim();
    if (!v) return setFieldState('regUsernameWrap', 'regUsernameHint', 'default', 'Ao menos 3 caracteres.');
    if (v.length < 3) return setFieldState('regUsernameWrap', 'regUsernameHint', 'error', 'Muito curto.');
    setFieldState('regUsernameWrap', 'regUsernameHint', 'default', 'Checando disponibilidade...');
    try{
      const exists = await DB.findUserByField('usernameLower', v.toLowerCase());
      if (exists) return setFieldState('regUsernameWrap', 'regUsernameHint', 'error', 'Este usuário já existe.');
      setFieldState('regUsernameWrap', 'regUsernameHint', 'valid', 'Disponível.');
    }catch(err){
      console.error('Erro ao checar usuário:', err);
      setFieldState('regUsernameWrap', 'regUsernameHint', 'default', 'Não foi possível checar agora — tudo bem, checamos de novo ao enviar.');
    }
  }, 400));

  $('#regEmail').addEventListener('input', Utils.debounce(async (e) => {
    const v = e.target.value.trim();
    if (!v) return setFieldState('regEmailWrap', 'regEmailHint', 'default', '');
    if (!Utils.isValidEmail(v)) return setFieldState('regEmailWrap', 'regEmailHint', 'error', 'E-mail inválido.');
    setFieldState('regEmailWrap', 'regEmailHint', 'default', 'Checando disponibilidade...');
    try{
      const exists = await DB.findUserByField('emailLower', v.toLowerCase());
      if (exists) return setFieldState('regEmailWrap', 'regEmailHint', 'error', 'Já existe conta com este e-mail.');
      setFieldState('regEmailWrap', 'regEmailHint', 'valid', 'E-mail válido.');
    }catch(err){
      console.error('Erro ao checar e-mail:', err);
      setFieldState('regEmailWrap', 'regEmailHint', 'default', 'Não foi possível checar agora — tudo bem, checamos de novo ao enviar.');
    }
  }, 400));

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
      State.cart = await Api.getCart(cartOwnerKey());
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
   ESQUECI A SENHA
   ========================================================================== */
function openForgotPasswordModal(){
  openModal('sm', `
    <p class="modal-lead">Informe o e-mail ou usuário da sua conta. Se ela existir, enviaremos um link para redefinir a senha.</p>
    <p class="modal-lead" style="font-size:12px;color:var(--text-faint);">Não recebeu em alguns minutos? Confira a caixa de spam/lixo eletrônico — e-mails automáticos às vezes caem lá.</p>
    <form id="forgotPasswordForm" novalidate>
      <div class="field">
        <label for="forgotIdentifier">E-mail ou usuário</label>
        <div class="field-input" id="forgotIdentifierWrap">
          <input id="forgotIdentifier" name="identifier" type="text" autocomplete="username" placeholder="voce@email.com">
        </div>
        <div class="field-hint" id="forgotIdentifierHint"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block" id="forgotPasswordSubmit">Enviar link de redefinição</button>
    </form>
  `, 'Recuperar senha');

  $('#forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = $('#forgotIdentifier').value;
    setFieldState('forgotIdentifierWrap', 'forgotIdentifierHint', 'default', '');

    if (!identifier.trim()){
      setFieldState('forgotIdentifierWrap', 'forgotIdentifierHint', 'error', 'Informe seu e-mail ou usuário.');
      return;
    }

    const btn = $('#forgotPasswordSubmit');
    btn.disabled = true; btn.textContent = 'Enviando...';
    try{
      await Api.forgotPassword(identifier);
      closeModal();
      Toast.show('Se essa conta existir, você vai receber um e-mail com o link de redefinição. Não esqueça de checar o spam.', 'success', 'mail');
    }catch(err){
      setFieldState('forgotIdentifierWrap', 'forgotIdentifierHint', 'error', err.message || 'Não foi possível enviar o e-mail.');
      btn.disabled = false; btn.textContent = 'Enviar link de redefinição';
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

  $('#profileChip').addEventListener('click', () => openProfilePanel());
  $('#coinChipBtn').addEventListener('click', () => openProfilePanel('recompensas'));
  $('#passChipBtn').addEventListener('click', () => openSeasonPassModal());

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
  updateCoinChip();
}

/* Saldo de moedas Nexus na navbar, no estilo do contador de V-Bucks do
   Fortnite: ícone + valor sempre visível, com botão "+" para comprar mais. */
function updateCoinChip(){
  if (!State.user) return;
  $('#coinChipAmount').textContent = (State.user.coins || 0).toLocaleString('pt-BR');
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
    // guarda contra um item com título/resumo ausente ou não-string: sem isso,
    // um único artigo malformado lança exceção dentro do .filter() e derruba
    // a lista inteira (todas as notícias "somem" de uma vez).
    const title = typeof a.title === 'string' ? a.title.toLowerCase() : '';
    const excerpt = typeof a.excerpt === 'string' ? a.excerpt.toLowerCase() : '';
    const searchOk = !q || title.includes(q) || excerpt.includes(q);
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

  grid.innerHTML = pageItems.map((a, i) => {
    const bookmarked = State.bookmarks.includes(a.id);
    return `
    <article class="article-card" data-open-article="${a.id}">
      <div class="article-card__media">
        ${gameArt(a.category, a.id + i)}
        <span class="article-card__idx">${String(baseIdx + i + 1).padStart(2, '0')}</span>
        <div class="article-card__quick-actions">
          <button type="button" class="card-icon-btn" data-share-article="${a.id}" aria-label="Compartilhar notícia">${Icons.svg('share', 14)}</button>
          <button type="button" class="card-icon-btn ${bookmarked ? 'active' : ''}" data-bookmark-toggle="${a.id}" aria-pressed="${bookmarked}" aria-label="${bookmarked ? 'Remover dos salvos' : 'Salvar notícia'}">${Icons.svg('bookmark', 14)}</button>
        </div>
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
    </article>`;
  }).join('');

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
  const likeIds = await DB.getArticleLikeIds(id);
  const liked = State.user ? likeIds.includes(State.user.id) : false;
  const bookmarked = State.bookmarks.includes(id);
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
        <button class="reaction-btn ${bookmarked ? 'liked' : ''}" id="articleBookmarkBtn" aria-pressed="${bookmarked}">${Icons.svg('bookmark', 15)}${bookmarked ? 'Salvo' : 'Salvar'}</button>
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
    if (res.liked) await grantSeasonXp(10);
  });

  $('#articleShareBtn').addEventListener('click', () => openShareSheet(id));

  $('#articleBookmarkBtn').addEventListener('click', async () => {
    const res = await toggleBookmark(id);
    if (!res) return;
    const btn = $('#articleBookmarkBtn');
    if (btn){
      btn.classList.toggle('liked', res.bookmarked);
      btn.innerHTML = `${Icons.svg('bookmark', 15)}${res.bookmarked ? 'Salvo' : 'Salvar'}`;
    }
    Toast.show(res.bookmarked ? 'Notícia salva.' : 'Removida dos salvos.', 'info', 'bookmark');
    renderArticleGrid();
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
   COMPARTILHAMENTO SOCIAL (bottom sheet independente do modal genérico, para
   poder abrir tanto a partir do card do grid quanto de dentro do modal de
   artigo já aberto, sem substituir o conteúdo de um pelo outro).
   ========================================================================== */
function articleShareUrl(articleId){
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('article', articleId);
  return url.toString();
}

async function openShareSheet(articleId){
  const article = await Api.getArticle(articleId);
  const shareUrl = articleShareUrl(articleId);
  const shareText = encodeURIComponent(article.title);
  const shareUrlEnc = encodeURIComponent(shareUrl);

  const nativeShareAvailable = !!navigator.share;

  const overlay = document.createElement('div');
  overlay.className = 'share-sheet-overlay';
  overlay.innerHTML = `
    <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="shareSheetTitle">
      <div class="share-sheet__handle"></div>
      <div class="share-sheet__article">
        <div class="share-sheet__thumb">${gameArt(article.category, article.id)}</div>
        <div class="share-sheet__meta">
          <span id="shareSheetTitle">Compartilhar notícia</span>
          <p>${Utils.escapeHtml(article.title)}</p>
        </div>
        <button type="button" class="modal__close" id="shareSheetClose" aria-label="Fechar">${Icons.svg('close', 15)}</button>
      </div>

      ${nativeShareAvailable ? `
        <button type="button" class="share-sheet__native" id="shareNativeBtn">${Icons.svg('share', 16)} Compartilhar via...</button>
      ` : ''}

      <div class="share-sheet__grid">
        <a class="share-sheet__net" href="https://api.whatsapp.com/send?text=${shareText}%20${shareUrlEnc}" target="_blank" rel="noopener">
          <span class="share-sheet__net-ic share-sheet__net-ic--whatsapp">${Icons.svg('whatsapp', 20)}</span>
          <span>WhatsApp</span>
        </a>
        <a class="share-sheet__net" href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrlEnc}" target="_blank" rel="noopener">
          <span class="share-sheet__net-ic share-sheet__net-ic--x">${Icons.svg('x', 18)}</span>
          <span>X</span>
        </a>
        <a class="share-sheet__net" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrlEnc}" target="_blank" rel="noopener">
          <span class="share-sheet__net-ic share-sheet__net-ic--facebook">${Icons.svg('facebook', 20)}</span>
          <span>Facebook</span>
        </a>
        <button type="button" class="share-sheet__net" id="shareInstagramBtn">
          <span class="share-sheet__net-ic share-sheet__net-ic--instagram">${Icons.svg('instagram', 20)}</span>
          <span>Instagram</span>
        </button>
        <button type="button" class="share-sheet__net" id="shareCopyBtn">
          <span class="share-sheet__net-ic">${Icons.svg('link', 18)}</span>
          <span>Copiar link</span>
        </button>
      </div>

      <p class="share-sheet__hint">No Instagram, o link é copiado automaticamente — cole nos Stories ou na legenda do post.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const closeSheet = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKeydown);
  };
  const onKeydown = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKeydown);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  $('#shareSheetClose', overlay).addEventListener('click', closeSheet);

  const nativeBtn = $('#shareNativeBtn', overlay);
  if (nativeBtn){
    nativeBtn.addEventListener('click', async () => {
      try{ await navigator.share({ title: article.title, text: article.excerpt, url: shareUrl }); closeSheet(); await grantSeasonXp(15); }
      catch(err){ /* usuário cancelou o compartilhamento — não é um erro */ }
    });
  }

  const copyLink = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText){
      try{
        await navigator.clipboard.writeText(shareUrl);
        Toast.show('Link copiado para a área de transferência.', 'success', 'link');
        await grantSeasonXp(15);
      }catch(err){
        Toast.show('Não foi possível copiar o link.', 'error');
      }
    } else {
      Toast.show('Copie o link manualmente: ' + shareUrl, 'warn');
    }
  };

  $('#shareCopyBtn', overlay).addEventListener('click', async () => { await copyLink(); setTimeout(closeSheet, 900); });
  $('#shareInstagramBtn', overlay).addEventListener('click', async () => { await copyLink(); setTimeout(closeSheet, 900); });
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
    const val = Number(e.target.value);
    if (!Number.isFinite(val)) return; // nunca deixa um valor inválido (NaN) zerar o filtro e sumir com tudo
    State.maxPrice = val;
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
    const price = Number(p.price);
    if (!Number.isFinite(price)) return false; // item com preço corrompido/ausente nunca quebra o filtro dos demais
    const catOk = State.shopCategory === 'todos' || p.category === State.shopCategory;
    const priceOk = price <= State.maxPrice;
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
        <div class="product-card__media" style="color:var(--teal)">${
          p.image
            ? `<img src="${p.image}" alt="${Utils.escapeHtml(p.name)}" loading="lazy">`
            : Icons.svg(c.icon, 56)
        }</div>
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
function persistCart(){
  Api.saveCart(cartOwnerKey(), State.cart).catch(err => console.error('Falha ao salvar carrinho no Firestore', err));
}

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

/* ============================================================================
   NOTÍCIAS SALVAS (BOOKMARKS)
   ========================================================================== */
async function toggleBookmark(articleId){
  if (!State.user) { Toast.show('Entre na sua conta para salvar notícias.', 'warn'); return null; }
  const res = await Api.toggleBookmark(cartOwnerKey(), articleId);
  State.bookmarks = res.list;
  $all(`[data-bookmark-toggle="${articleId}"]`).forEach(b => {
    b.classList.toggle('active', res.bookmarked);
    b.setAttribute('aria-pressed', String(res.bookmarked));
  });
  if (res.bookmarked) await grantSeasonXp(10);
  return res;
}

/* ============================================================================
   PASSE DE BATALHA (temporada ativa em BATTLE_PASS_SEASON, ver data.js)
   ========================================================================== */
async function grantSeasonXp(amount){
  if (!State.user) return;
  const { pass, leveledUp } = await Api.grantSeasonXp(cartOwnerKey(), amount);
  State.seasonPass = pass;
  updateSeasonPassChip();
  if (leveledUp){
    Toast.show(`Nível ${pass.level} no Passe de Batalha!`, 'success', 'star');
    await pushNotification('badge', 'Você subiu de nível!', `Chegou ao nível ${pass.level} de "${BATTLE_PASS_SEASON.name}". Resgate suas recompensas.`);
  }
}

function updateSeasonPassChip(){
  const chip = $('#passChipBtn');
  if (!chip || !State.seasonPass) return;
  chip.classList.remove('hidden');
  const season = BATTLE_PASS_SEASON;
  const pass = State.seasonPass;
  const xpIntoLevel = pass.xp - (pass.level - 1) * season.xpPerLevel;
  const pct = pass.level >= season.maxLevel ? 100 : Math.min(100, Math.round((xpIntoLevel / season.xpPerLevel) * 100));
  $('#passChipLevel').textContent = `Nível ${pass.level}`;
  $('#passChipBarFill').style.width = pct + '%';
}

function openSeasonPassModal(){
  const season = BATTLE_PASS_SEASON;
  const pass = State.seasonPass;
  if (!pass) return;
  const xpIntoLevel = pass.xp - (pass.level - 1) * season.xpPerLevel;
  const xpPct = pass.level >= season.maxLevel ? 100 : Math.round((xpIntoLevel / season.xpPerLevel) * 100);
  const xpLabel = pass.level >= season.maxLevel ? 'NÍVEL MÁXIMO' : `${xpIntoLevel} / ${season.xpPerLevel} XP`;

  const milestones = Object.keys(season.rewards.free).map(Number).sort((a, b) => a - b);
  // a coluna "atual" é o próximo marco ainda não resgatado por completo — é
  // nela que colocamos o brilho, igual ao "próximo item" em destaque no
  // passe do Fortnite.
  const nextIdx = milestones.findIndex(level =>
    !(pass.claimedFree.includes(level) && (pass.claimedPremium.includes(level) || !pass.hasPremium))
  );

  const tileHtml = (level, reward, track) => {
    const claimed = (track === 'free' ? pass.claimedFree : pass.claimedPremium).includes(level);
    const locked = track === 'premium' && !pass.hasPremium;
    const reached = pass.level >= level;
    const claimable = reached && !claimed && !locked;

    let overlay = '';
    if (locked) overlay = `<span class="bp-tile__overlay bp-tile__overlay--lock">${Icons.svg('lock', 16)}</span>`;
    else if (claimed) overlay = `<span class="bp-tile__overlay bp-tile__overlay--done">${Icons.svg('checkCircle', 18)}</span>`;
    else if (!reached) overlay = `<span class="bp-tile__overlay bp-tile__overlay--pending">${Icons.svg('lock', 16)}</span>`;

    return `
      <button type="button"
        class="bp-tile bp-tile--${track} ${claimed ? 'bp-tile--claimed' : ''} ${claimable ? 'bp-tile--claimable' : ''} ${locked || !reached ? 'bp-tile--locked' : ''}"
        ${claimable ? `data-claim-level="${level}" data-claim-track="${track}"` : 'disabled'}
        aria-label="Nível ${level}, trilha ${track === 'premium' ? 'premium' : 'grátis'}, recompensa ${reward.amount} moedas${claimed ? ', já resgatada' : ''}">
        <span class="bp-tile__icon">${Icons.svg('diamond', 20)}</span>
        <span class="bp-tile__amount">${reward.amount.toLocaleString('pt-BR')}</span>
        ${overlay}
      </button>`;
  };

  const columnsHtml = milestones.map((level, i) => `
    <div class="bp-col ${i === nextIdx ? 'bp-col--current' : ''}">
      ${tileHtml(level, season.rewards.premium[level], 'premium')}
      <div class="bp-col__level">${level}</div>
      ${tileHtml(level, season.rewards.free[level], 'free')}
    </div>
  `).join('');

  openModal('lg', `
    <div class="bp-modal">
      <div class="bp-modal__banner">
        <div class="bp-modal__level-badge">
          <span class="bp-modal__level-num">${pass.level}</span>
          <span class="bp-modal__level-tag">NÍVEL</span>
        </div>
        <div class="bp-modal__info">
          <h3>${Utils.escapeHtml(season.name)}</h3>
          <div class="bp-modal__xp-bar"><div class="bp-modal__xp-fill" style="width:${xpPct}%"></div></div>
          <p class="bp-modal__xp-label">${xpLabel}</p>
        </div>
        ${!pass.hasPremium
          ? `<button type="button" class="btn btn-primary btn-sm" id="passUnlockPremiumBtn">${Icons.svg('star', 14)} Desbloquear Premium</button>`
          : `<span class="bp-modal__premium-badge">${Icons.svg('star', 13)} Premium ativo</span>`}
      </div>

      <div class="bp-track-labels">
        <span class="bp-track-labels__premium">${Icons.svg('star', 12)} Trilha premium</span>
        <span class="bp-track-labels__free">Trilha grátis</span>
      </div>

      <div class="bp-track-scroll">
        <div class="bp-track">${columnsHtml}</div>
      </div>
    </div>
  `, 'PASSE DE BATALHA');

  const premiumBtn = $('#passUnlockPremiumBtn');
  if (premiumBtn) premiumBtn.addEventListener('click', () => { closeModal(); navigateTo('shop'); });

  $all('[data-claim-level]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try{
      const { pass: updated, reward, coins } = await Api.claimSeasonReward(cartOwnerKey(), Number(b.dataset.claimLevel), b.dataset.claimTrack);
      State.seasonPass = updated;
      State.user.coins = coins;
      updateCoinChip();
      Toast.show(`+${reward.amount.toLocaleString('pt-BR')} moedas resgatadas!`, 'success', 'diamond');
      openSeasonPassModal();
    }catch(err){
      Toast.show(err.message || 'Não foi possível resgatar essa recompensa.', 'error');
      b.disabled = false;
    }
  }));
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
      <div class="product-detail__media">${
        product.image
          ? `<img src="${product.image}" alt="${Utils.escapeHtml(product.name)}">`
          : Icons.svg(c.icon, 90)
      }</div>
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
    if (State.user){
      const patch = {};
      const newBadges = new Set(State.user.badges);
      let gainedBuyer = false, gainedPass = false, coinsGained = 0;

      if (!newBadges.has('buyer')){
        newBadges.add('buyer');
        gainedBuyer = true;
      }

      const coinItem = items.find(i => i.productId === 'p9');
      if (coinItem){
        coinsGained = coinItem.qty * 5000;
        patch.coins = (State.user.coins || 0) + coinsGained;
      }

      const passItem = items.find(i => i.productId === 'p8');
      if (passItem && !newBadges.has('season-pass')){
        newBadges.add('season-pass');
        gainedPass = true;
        const unlocked = new Set(State.user.unlockedFrames || []);
        unlocked.add('cyber');
        patch.unlockedFrames = [...unlocked];
        patch.activeFrame = 'cyber';
        State.seasonPass = await Api.activateSeasonPremium(State.user.id);
        updateSeasonPassChip();
      }

      if (gainedBuyer || gainedPass) patch.badges = [...newBadges];

      if (Object.keys(patch).length){
        State.user = await Api.updateProfile(State.user.id, patch);
        updateCoinChip();
        if (gainedBuyer){
          await pushNotification('badge', 'Novo emblema conquistado', 'Você ganhou o emblema "Comprador verificado" pela sua primeira compra.');
        }
        if (coinsGained){
          await pushNotification('order', 'Moedas creditadas', `${coinsGained.toLocaleString('pt-BR')} moedas Nexus foram adicionadas ao seu saldo.`);
        }
        if (gainedPass){
          await pushNotification('badge', 'Passe de Batalha ativado', 'Sua trilha premium no Passe de Batalha já está liberada — resgate as recompensas dos níveis que você já alcançou.');
        }
      }
      await grantSeasonXp(40);
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
function openProfilePanel(initialTab = 'perfil'){
  if (!State.user) return;
  const u = State.user;
  openModal('lg', `
    <div class="profile-panel">
      <div class="profile-panel__banner ${u.activeBanner ? 'banner-' + u.activeBanner : ''}" id="panelBanner" style="${u.activeBanner ? '' : (u.bannerImage ? `background-image:url('${u.bannerImage}');background-size:cover;background-position:center;` : `background:${u.banner};`)}"></div>
      <div class="profile-panel__main">
        <div class="profile-panel__avatar ${u.activeFrame ? 'frame-' + u.activeFrame : ''}">
          <img class="avatar" src="${u.avatar}" width="84" height="84" alt="">
        </div>
        <div class="profile-panel__names">
          <div class="name">${Utils.escapeHtml(u.username)}</div>
          <div class="tag">#${u.tag}${u.customStatus ? ' · ' + Utils.escapeHtml(u.customStatus) : ''}</div>
        </div>
        ${u.activeTitle ? `<div class="profile-title" id="panelTitle">${Utils.escapeHtml((AVAILABLE_TITLES.find(t => t.key === u.activeTitle) || {}).label || '')}</div>` : `<div class="hidden" id="panelTitle"></div>`}
        <div class="profile-panel__coins" title="Moedas Nexus">${Icons.svg('diamond', 14)} ${(u.coins || 0).toLocaleString('pt-BR')}</div>
        <div class="badge-row" id="badgeRow"></div>
      </div>
      <div class="profile-tabs">
        <button class="ptab${initialTab === 'perfil' ? ' active' : ''}" data-ptab="perfil">PERFIL</button>
        <button class="ptab${initialTab === 'recompensas' ? ' active' : ''}" data-ptab="recompensas">RECOMPENSAS</button>
        <button class="ptab${initialTab === 'salvos' ? ' active' : ''}" data-ptab="salvos">NOTÍCIAS SALVAS</button>
        <button class="ptab${initialTab === 'pedidos' ? ' active' : ''}" data-ptab="pedidos">MEUS PEDIDOS</button>
        <button class="ptab${initialTab === 'config' ? ' active' : ''}" data-ptab="config">CONFIGURAÇÕES DA CONTA</button>
        ${ADMIN_EMAILS.includes((u.email || '').toLowerCase()) ? `<button class="ptab${initialTab === 'admin' ? ' active' : ''}" data-ptab="admin">ADMIN</button>` : ''}
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
  renderProfileTab(initialTab);
}

/* Config por tipo de item cosmético da Loja de Recompensas: onde fica a
   lista de itens disponíveis, o campo de "desbloqueados" no usuário e o
   campo de "ativo" (quando o item pode ser equipado/desequipado). */
const REWARD_TYPE_CONFIG = {
  frame:  { list: () => AVAILABLE_FRAMES,  unlockedField: 'unlockedFrames',  activeField: 'activeFrame',  label: 'Moldura' },
  badge:  { list: () => AVAILABLE_BADGES,  unlockedField: 'badges',          activeField: null,           label: 'Emblema' },
  banner: { list: () => AVAILABLE_BANNERS, unlockedField: 'unlockedBanners', activeField: 'activeBanner', label: 'Banner' },
  title:  { list: () => AVAILABLE_TITLES,  unlockedField: 'unlockedTitles',  activeField: 'activeTitle',  label: 'Título' }
};

function refreshProfilePanelChrome(){
  const u = State.user;
  const coinsEl = $('.profile-panel__coins');
  if (coinsEl) coinsEl.innerHTML = `${Icons.svg('diamond', 14)} ${(u.coins || 0).toLocaleString('pt-BR')}`;
  const badgeRow = $('#badgeRow');
  if (badgeRow){
    badgeRow.innerHTML = u.badges.map(bk => {
      const b = AVAILABLE_BADGES.find(x => x.key === bk);
      return b ? `<span class="badge ${b.cls}" title="${b.title}">${Icons.svg(b.icon, 15)}</span>` : '';
    }).join('');
  }
  const avatarWrap = $('.profile-panel__avatar');
  if (avatarWrap) avatarWrap.className = 'profile-panel__avatar' + (u.activeFrame ? ' frame-' + u.activeFrame : '');

  const bannerEl = $('#panelBanner');
  if (bannerEl){
    bannerEl.className = 'profile-panel__banner' + (u.activeBanner ? ' banner-' + u.activeBanner : '');
    if (!u.activeBanner){
      bannerEl.style.backgroundImage = u.bannerImage ? `url('${u.bannerImage}')` : 'none';
      bannerEl.style.backgroundSize = 'cover';
      bannerEl.style.backgroundPosition = 'center';
      bannerEl.style.background = u.bannerImage ? '' : u.banner;
    } else {
      bannerEl.style.backgroundImage = '';
      bannerEl.style.background = '';
    }
  }

  const titleEl = $('#panelTitle');
  if (titleEl){
    if (u.activeTitle){
      const t = AVAILABLE_TITLES.find(x => x.key === u.activeTitle);
      titleEl.textContent = t ? t.label : '';
      titleEl.className = 'profile-title';
    } else {
      titleEl.textContent = '';
      titleEl.className = 'hidden';
    }
  }
}

/* Desbloqueia um item da Loja de Recompensas gastando moedas Nexus.
   type: 'frame' | 'badge' | 'banner' | 'title' */
async function unlockReward(type, key){
  const u = State.user;
  if (!u) return;
  const cfg = REWARD_TYPE_CONFIG[type];
  const item = cfg.list().find(x => x.key === key);
  if (!item || item.cost == null) return;

  const coins = u.coins || 0;
  if (coins < item.cost){
    Toast.show('Você não tem moedas Nexus suficientes.', 'warn', 'alertCircle');
    return;
  }

  const patch = { coins: coins - item.cost };
  const unlocked = new Set(u[cfg.unlockedField] || []);
  unlocked.add(key);
  patch[cfg.unlockedField] = [...unlocked];
  if (cfg.activeField) patch[cfg.activeField] = key; // já equipa o item recém-desbloqueado

  State.user = await Api.updateProfile(u.id, patch);
  updateCoinChip();
  refreshProfilePanelChrome();
  renderProfileTab('recompensas');
  const name = item.title || item.label;
  Toast.show(`"${name.replace(/ — .*/, '')}" desbloqueado!`, 'success', 'checkCircle');
}

/* Equipa (ou remove, se key for null) um item cosmético já desbloqueado */
async function equipReward(type, key){
  const u = State.user;
  if (!u) return;
  const cfg = REWARD_TYPE_CONFIG[type];
  if (!cfg.activeField) return;
  State.user = await Api.updateProfile(u.id, { [cfg.activeField]: key });
  refreshProfilePanelChrome();
  renderProfileTab('recompensas');
  Toast.show(key ? `${cfg.label} ativado.` : `${cfg.label} removido.`, 'success');
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
      const updated = await Api.updateProfile(u.id, { banner: sw.dataset.banner, bannerImage: null, activeBanner: null });
      State.user = updated;
      $all('[data-banner]').forEach(x => x.classList.toggle('active', x === sw));
      $('#panelBanner').className = 'profile-panel__banner';
      $('#panelBanner').style.backgroundImage = 'none';
      $('#panelBanner').style.background = sw.dataset.banner;
      renderProfileTab('perfil');
    }));

    const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

    $('#bannerUpload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > MAX_IMAGE_UPLOAD_BYTES){
        Toast.show('Imagem muito grande. Escolha um arquivo de até 8MB.', 'warn');
        e.target.value = '';
        return;
      }
      $('#bannerFileName').textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        openImageCropper(ev.target.result, {
          shape: 'rect', outW: 640, outH: 160,
          onApply: async (dataUrl) => {
            const updated = await Api.updateProfile(u.id, { bannerImage: dataUrl, activeBanner: null });
            State.user = updated;
            Toast.show('Banner atualizado.', 'success');
            openProfilePanel('perfil');
          },
          onCancel: () => openProfilePanel('perfil')
        });
      };
      reader.onerror = () => Toast.show('Não foi possível carregar essa imagem.', 'error');
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
      if (file.size > MAX_IMAGE_UPLOAD_BYTES){
        Toast.show('Imagem muito grande. Escolha um arquivo de até 8MB.', 'warn');
        e.target.value = '';
        return;
      }
      $('#avatarFileName').textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        openImageCropper(ev.target.result, {
          shape: 'circle', outW: 128, outH: 128,
          onApply: async (dataUrl) => {
            const updated = await Api.updateProfile(u.id, { avatar: dataUrl });
            State.user = updated;
            updateProfileChip();
            Toast.show('Foto de perfil atualizada.', 'success');
            openProfilePanel('perfil');
          },
          onCancel: () => openProfilePanel('perfil')
        });
      };
      reader.onerror = () => Toast.show('Não foi possível carregar essa imagem.', 'error');
      reader.readAsDataURL(file);
    });
  } else if (tab === 'salvos'){
    const items = State.bookmarks.map(id => NEWS.find(n => n.id === id)).filter(Boolean).reverse();
    if (!items.length){
      box.innerHTML = `
        <div class="empty-state">
          ${Icons.svg('bookmark', 30)}
          <p class="empty-state__title">Nenhuma notícia salva</p>
          <p class="empty-state__body">Toque no marcador de qualquer notícia para guardá-la aqui.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="salvosGoHome">Ver notícias</button>
        </div>`;
      $('#salvosGoHome').addEventListener('click', () => { closeModal(); navigateTo('home'); });
      return;
    }
    box.innerHTML = `
      <div class="saved-list">
        ${items.map(a => `
          <div class="saved-item" data-saved-row="${a.id}">
            <button type="button" class="saved-item__open" data-open-article="${a.id}">
              <span class="saved-item__media">${gameArt(a.category, a.id)}</span>
              <span class="saved-item__body">
                <span class="chip saved-item__chip">${catInfo(a.category).label}</span>
                <span class="saved-item__title">${Utils.escapeHtml(a.title)}</span>
                <span class="saved-item__meta">${Icons.svg('clock', 11)} ${a.readTime} min de leitura</span>
              </span>
            </button>
            <button type="button" class="saved-item__remove" data-saved-remove="${a.id}" aria-label="Remover ${Utils.escapeHtml(a.title)} dos salvos">${Icons.svg('trash', 15)}</button>
          </div>`).join('')}
      </div>`;
    $all('[data-saved-remove]', box).forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await toggleBookmark(b.dataset.savedRemove);
      if (!res) return;
      Toast.show('Notícia removida dos salvos.', 'info', 'trash');
      renderProfileTab('salvos');
    }));
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
  } else if (tab === 'recompensas'){
    const coins = u.coins || 0;

    /* Monta o preview visual de cada tipo de item cosmético */
    const previewHtml = (type, item) => {
      if (type === 'frame'){
        return `<div class="reward-item__preview"><div class="profile-panel__avatar ${item.cls}"><img class="avatar" src="${u.avatar}" width="84" height="84" alt=""></div></div>`;
      }
      if (type === 'badge'){
        return `<div class="reward-item__preview"><span class="badge ${item.cls}" style="width:44px;height:44px;">${Icons.svg(item.icon, 19)}</span></div>`;
      }
      if (type === 'banner'){
        return `<div class="reward-item__preview reward-item__preview--banner"><div class="profile-panel__banner ${item.cls}"></div></div>`;
      }
      return `<div class="reward-item__preview reward-item__preview--title">${Utils.escapeHtml(item.label)}</div>`;
    };

    const renderGrid = (type) => {
      const cfg = REWARD_TYPE_CONFIG[type];
      const owned = new Set(u[cfg.unlockedField] || []);
      const active = cfg.activeField ? u[cfg.activeField] : null;

      return cfg.list().filter(item => item.cost != null).map(item => {
        const isOwned = owned.has(item.key);
        const isActive = cfg.activeField && active === item.key;
        const name = item.title || item.label;

        let btn;
        if (!cfg.activeField){ // emblemas: sem equipar, só "conquistado"
          btn = isOwned
            ? `<button type="button" class="btn btn-sm btn-secondary" disabled>${Icons.svg('check', 12)} Conquistado</button>`
            : coins >= item.cost
              ? `<button type="button" class="btn btn-sm btn-primary" data-unlock="${type}:${item.key}">Desbloquear</button>`
              : `<button type="button" class="btn btn-sm btn-ghost" disabled>Faltam moedas</button>`;
        } else if (isActive){
          btn = `<button type="button" class="btn btn-sm btn-secondary" disabled>Em uso</button><button type="button" class="btn btn-sm btn-ghost" data-equip="${type}:__none__" style="margin-left:6px;">Remover</button>`;
        } else if (isOwned){
          btn = `<button type="button" class="btn btn-sm btn-secondary" data-equip="${type}:${item.key}">Usar</button>`;
        } else if (coins >= item.cost){
          btn = `<button type="button" class="btn btn-sm btn-primary" data-unlock="${type}:${item.key}">Desbloquear</button>`;
        } else {
          btn = `<button type="button" class="btn btn-sm btn-ghost" disabled>Faltam moedas</button>`;
        }

        return `
          <div class="reward-item ${isOwned ? 'owned' : ''}">
            ${previewHtml(type, item)}
            <div class="reward-item__info">
              <div class="reward-item__title">${Utils.escapeHtml(name)}</div>
              <div class="reward-item__cost">${Icons.svg('diamond', 11)} ${item.cost.toLocaleString('pt-BR')}</div>
            </div>
            <div class="reward-item__actions">${btn}</div>
          </div>`;
      }).join('');
    };

    box.innerHTML = `
      <p style="font-size:12px;color:var(--text-faint);margin-bottom:2px;">Gaste suas moedas Nexus em itens cosméticos exclusivos. Sem moedas suficientes? <a href="#" id="goShopCoins" class="link-accent">compre um pacote na loja</a>.</p>
      <h4 class="reward-section-title">MOLDURAS DE AVATAR</h4>
      <div class="reward-grid">${renderGrid('frame')}</div>
      <div class="panel-divider"></div>
      <h4 class="reward-section-title">BANNERS DE PERFIL</h4>
      <div class="reward-grid">${renderGrid('banner')}</div>
      <div class="panel-divider"></div>
      <h4 class="reward-section-title">TÍTULOS DE PERFIL</h4>
      <div class="reward-grid">${renderGrid('title')}</div>
      <div class="panel-divider"></div>
      <h4 class="reward-section-title">EMBLEMAS</h4>
      <div class="reward-grid">${renderGrid('badge')}</div>
    `;

    $('#goShopCoins').addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
      navigateTo('shop');
    });
    $all('[data-unlock]').forEach(b => {
      const [type, key] = b.dataset.unlock.split(':');
      b.addEventListener('click', () => unlockReward(type, key));
    });
    $all('[data-equip]').forEach(b => {
      const [type, key] = b.dataset.equip.split(':');
      b.addEventListener('click', () => equipReward(type, key === '__none__' ? null : key));
    });
  } else if (tab === 'config'){
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
      State.cart = await Api.getCart('guest');
      State.wishlist = [];
      State.bookmarks = [];
      State.seasonPass = null;
      $('#passChipBtn').classList.add('hidden');
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
        State.bookmarks = [];
        State.seasonPass = null;
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
  } else if (tab === 'admin'){
    box.innerHTML = `
      <div class="field">
        <label>Assunto</label>
        <div class="field-input"><input id="newsletterAdminSubject" placeholder="Novidades da semana na Nexus Arena"></div>
      </div>
      <div class="field">
        <label>Corpo do e-mail (HTML simples)</label>
        <div class="field-input" style="height:auto;"><textarea id="newsletterAdminBody" rows="8" style="width:100%;background:none;border:none;color:var(--text);font-size:13px;outline:none;resize:vertical;" placeholder="&lt;p&gt;Confira as novidades desta semana...&lt;/p&gt;"></textarea></div>
      </div>
      <div id="newsletterAdminProgress" class="field-hint"></div>
      <button type="button" class="btn btn-primary" id="newsletterAdminSend">Enviar para todos os inscritos</button>
    `;
    $('#newsletterAdminSend').addEventListener('click', async () => {
      const subject = $('#newsletterAdminSubject').value.trim();
      const body = $('#newsletterAdminBody').value.trim();
      if (!subject || !body){
        Toast.show('Preencha assunto e corpo do e-mail.', 'warn');
        return;
      }
      const btn = $('#newsletterAdminSend');
      btn.disabled = true; btn.textContent = 'Enviando...';
      try{
        const result = await NewsletterAdmin.sendBlast(subject, body, (done, total) => {
          $('#newsletterAdminProgress').textContent = `Enviando ${done}/${total}...`;
        });
        Toast.show(`Newsletter enviada: ${result.sent} ok, ${result.failed} falharam (de ${result.total}).`, result.failed ? 'warn' : 'success', 'mail');
      }catch(err){
        console.error('Erro ao enviar newsletter:', err);
        Toast.show(err.message || 'Não foi possível enviar a newsletter.', 'error');
      }finally{
        btn.disabled = false; btn.textContent = 'Enviar para todos os inscritos';
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
   EDITOR DE RECORTE (avatar 1:1 circular / banner na proporção do layout)
   Sem dependências externas: usa <canvas> nativo. Zoom via slider (também
   mapeado a pinça em touch) e arraste via Pointer Events (mouse + touch).
   ========================================================================== */
function openImageCropper(dataUrl, { shape = 'circle', outW, outH, onApply, onCancel }){
  const stageW = 260;
  const stageH = shape === 'circle' ? 260 : Math.round(stageW * (outH / outW));

  openModal('sm', `
    <div class="cropper">
      <div class="cropper__stage" id="cropperStage" style="width:${stageW}px;height:${stageH}px;">
        <img id="cropperImg" src="${dataUrl}" draggable="false" alt="">
        <div class="cropper__mask cropper__mask--${shape}"></div>
      </div>
      <div class="cropper__zoom">
        <span aria-hidden="true">${Icons.svg('zoomOut', 15)}</span>
        <input type="range" id="cropperZoom" min="1" max="3" step="0.01" value="1" aria-label="Zoom da imagem">
        <span aria-hidden="true">${Icons.svg('zoomIn', 15)}</span>
      </div>
      <div class="cropper__actions">
        <button type="button" class="btn btn-ghost" id="cropperCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="cropperApply" disabled>Aplicar</button>
      </div>
    </div>
  `, shape === 'circle' ? 'Ajustar foto de perfil' : 'Ajustar banner');

  const stage = $('#cropperStage');
  const imgEl = $('#cropperImg');
  const zoomInput = $('#cropperZoom');
  const applyBtn = $('#cropperApply');
  const cancelBtn = $('#cropperCancel');

  let naturalW = 0, naturalH = 0;
  let offsetX = 0, offsetY = 0;
  let dragging = false, startX = 0, startY = 0, startOffX = 0, startOffY = 0;
  let pinchStartDist = 0, pinchStartZoom = 1;

  function coverScale(){
    return Math.max(stageW / naturalW, stageH / naturalH);
  }

  function clampOffsets(){
    const z = parseFloat(zoomInput.value);
    const finalScale = coverScale() * z;
    const dispW = naturalW * finalScale;
    const dispH = naturalH * finalScale;
    const maxOffX = Math.max(0, (dispW - stageW) / 2);
    const maxOffY = Math.max(0, (dispH - stageH) / 2);
    offsetX = Math.min(maxOffX, Math.max(-maxOffX, offsetX));
    offsetY = Math.min(maxOffY, Math.max(-maxOffY, offsetY));
  }

  function draw(){
    clampOffsets();
    const z = parseFloat(zoomInput.value);
    const finalScale = coverScale() * z;
    imgEl.style.width = (naturalW * finalScale) + 'px';
    imgEl.style.height = (naturalH * finalScale) + 'px';
    imgEl.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
  }

  imgEl.onload = () => {
    naturalW = imgEl.naturalWidth;
    naturalH = imgEl.naturalHeight;
    offsetX = 0; offsetY = 0;
    draw();
    applyBtn.disabled = false;
  };
  imgEl.onerror = () => {
    Toast.show('Não foi possível carregar essa imagem.', 'error');
    closeModal();
  };
  if (imgEl.complete && imgEl.naturalWidth) imgEl.onload();

  zoomInput.addEventListener('input', draw);

  stage.addEventListener('pointerdown', (e) => {
    if (!naturalW) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startOffX = offsetX; startOffY = offsetY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    offsetX = startOffX + (e.clientX - startX);
    offsetY = startOffY + (e.clientY - startY);
    draw();
  });
  const stopDrag = () => { dragging = false; };
  stage.addEventListener('pointerup', stopDrag);
  stage.addEventListener('pointercancel', stopDrag);

  // pinça (dois dedos) em telas touch — mapeia a distância entre os dedos
  // para o mesmo slider de zoom usado no desktop.
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2){
      dragging = false;
      const [t1, t2] = e.touches;
      pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartZoom = parseFloat(zoomInput.value);
    }
  });
  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2){
      e.preventDefault();
      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / (pinchStartDist || dist);
      const nextZoom = Math.min(3, Math.max(1, pinchStartZoom * ratio));
      zoomInput.value = nextZoom.toFixed(2);
      draw();
    }
  }, { passive: false });

  cancelBtn.addEventListener('click', () => {
    // Não fecha o modal aqui: quando onCancel reabre outro modal (ex.:
    // openProfilePanel), o setTimeout de closeModal() que limpa #modalRoot
    // dispara ~200ms depois e apaga o conteúdo recém-aberto por cima.
    if (onCancel) onCancel(); else closeModal();
  });

  applyBtn.addEventListener('click', () => {
    const z = parseFloat(zoomInput.value);
    const finalScale = coverScale() * z;
    const sW = stageW / finalScale;
    const sH = stageH / finalScale;
    const sX = (naturalW - sW) / 2 - offsetX / finalScale;
    const sY = (naturalH - sH) / 2 - offsetY / finalScale;

    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, sX, sY, sW, sH, 0, 0, outW, outH);
    const outDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    // mesmo motivo do cancelar: deixa o onApply (que reabre o perfil) decidir
    // quando/como trocar o conteúdo do modal, em vez de fechar antes.
    if (onApply) onApply(outDataUrl); else closeModal();
  });
}

/* ============================================================================
   EVENTOS DELEGADOS GLOBAIS (conteúdo re-renderizado dinamicamente)
   ========================================================================== */
function bindGlobalDelegatedEvents(){
  document.addEventListener('click', (e) => {
    const bmToggle = e.target.closest('[data-bookmark-toggle]');
    if (bmToggle){ toggleBookmark(bmToggle.dataset.bookmarkToggle); return; }

    const shareBtn = e.target.closest('[data-share-article]');
    if (shareBtn){ openShareSheet(shareBtn.dataset.shareArticle); return; }

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
