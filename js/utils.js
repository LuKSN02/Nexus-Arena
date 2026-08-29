/* ==========================================================================
   utils.js — Formatação, validação, toasts e helpers gerais
   ========================================================================== */

const Utils = {
  uid(prefix = 'id'){
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },

  brl(value){
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  timeAgo(iso){
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d atrás`;
    return new Date(iso).toLocaleDateString('pt-BR');
  },

  escapeHtml(str = ''){
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  clamp(n, min, max){ return Math.min(max, Math.max(min, n)); },

  debounce(fn, wait = 250){
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  },

  /* Simula latência de rede da "API" — deixa a experiência full-stack coerente */
  delay(ms = 380){
    return new Promise(res => setTimeout(res, ms));
  },

  isValidEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
  },

  /* Retorna { score: 0-4, label, checks } */
  passwordStrength(pwd = ''){
    const checks = {
      length: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      symbol: /[^A-Za-z0-9]/.test(pwd)
    };
    const score = Object.values(checks).filter(Boolean).length;
    const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
    return { score, label: labels[score], checks };
  },

  /* Hash simples (NÃO criptográfico) — mantido apenas por compatibilidade
     histórica. Não é mais usado: com o Firebase Auth conectado, a senha
     nunca passa por aqui nem é validada no front-end; o Firebase cuida
     disso no servidor dele. */
  simpleHash(str){
    let h = 0;
    for (let i = 0; i < str.length; i++){
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return `h${Math.abs(h)}_${str.length}`;
  },

  initials(name = ''){
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  },

  avatarDataUri(seed, bg, fg = '#ffffff'){
    const letter = Utils.initials(seed) || '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${bg}"/><text x="50%" y="53%" font-family="Rajdhani, sans-serif" font-weight="700" font-size="32" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
};

/* ==========================================================================
   TOASTS
   ========================================================================== */
const Toast = {
  stack: null,
  init(){ this.stack = document.getElementById('toastStack'); },
  show(message, type = 'info', icon = 'checkCircle'){
    if (!this.stack) this.init();
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
    el.innerHTML = `${Icons.svg(type === 'error' ? 'alertCircle' : icon, 18)}<span class="toast__text">${Utils.escapeHtml(message)}</span>`;
    this.stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 260);
    }, 3400);
  }
};
