/* ==========================================================================
   icons.js — Biblioteca de ícones SVG inline (substitui 100% dos emojis)
   Estilo: linha geométrica, viewBox 24x24, stroke=currentColor.
   Uso: Icons.svg('cart', 20, 'classe-extra')
   ========================================================================== */
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.4l2.6 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6.2"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6.4 7-6.4s7 2.8 7 6.4"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.4 5.6 2 6.4H4c.6-.8 2-2.4 2-6.4z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  heart: '<path d="M12 20.5s-7.4-4.7-9.7-9.2C.6 7.7 2.4 4 6.1 4c2 0 3.5 1 5.9 3.4C14.4 5 15.9 4 17.9 4c3.7 0 5.5 3.7 3.8 7.3-2.3 4.5-9.7 9.2-9.7 9.2z"/>',
  comment: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  chevronLeft: '<polyline points="15 4 7 12 15 20"/>',
  chevronRight: '<polyline points="9 4 17 12 9 20"/>',
  chevronDown: '<polyline points="5 8 12 15 19 8"/>',
  close: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<line x1="4" y1="7" x2="20" y2="7"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  check: '<polyline points="4 12 9 18 20 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.2" r="1" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3z"/>',
  star: '<polygon points="12 3 14.8 9 21.3 9.6 16.4 13.9 17.9 20.3 12 16.9 6.1 20.3 7.6 13.9 2.7 9.6 9.2 9 12 3"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><line x1="12" y1="11" x2="12" y2="21"/>',
  newspaper: '<rect x="3" y="5" width="18" height="14" rx="1"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="12.5" x2="13" y2="12.5"/><line x1="7" y1="16" x2="11" y2="16"/><line x1="16" y1="9" x2="18" y2="9"/><line x1="16" y1="12.5" x2="18" y2="12.5"/>',
  trending: '<polyline points="3 17 9.5 10.5 13.5 14.5 21 6"/><polyline points="14.5 6 21 6 21 12.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="1.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><polyline points="3.5 6 12 13 20.5 6"/>',
  edit: '<path d="M4 20l.9-4L16 4.9a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1L8 19l-4 1z"/><line x1="14.5" y1="6.5" x2="17.5" y2="9.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-6-6-4.5 4.5L8 12l-5 6"/>',
  arrowRight: '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
  externalLink: '<path d="M14 4h6v6"/><line x1="20" y1="4" x2="10" y2="14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  creditCard: '<rect x="2.5" y="5.5" width="19" height="13" rx="1.6"/><line x1="2.5" y1="10" x2="21.5" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
  qrcode: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="21" y2="17.5"/>',
  truck: '<rect x="1.5" y="8" width="12" height="8" rx="1"/><path d="M13.5 11h4l3 3v2h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11V3z"/><circle cx="7.3" cy="7.3" r="1.3"/>',
  filter: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
  logout: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><line x1="21" y1="12" x2="10" y2="12"/><polyline points="16 7 21 12 16 17"/>',
  flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1.4-.7-2-1-3 2 1 4 3.5 4 6.5a6 6 0 0 1-12 0C6 9 9 6 12 2z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5.4 5.5-5.4s5.5 2.4 5.5 5.4"/><circle cx="17" cy="9" r="2.4"/><path d="M15 13.6c2.6.4 4.5 2.5 4.5 5.4"/>',
  gamepad: '<rect x="2.5" y="8" width="19" height="9" rx="4"/><line x1="7" y1="10.5" x2="7" y2="14.5"/><line x1="5" y1="12.5" x2="9" y2="12.5"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  share: '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><line x1="8" y1="11" x2="16" y2="7"/><line x1="8" y1="13" x2="16" y2="17"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21V3z"/>',
  mouse: '<rect x="7" y="3" width="10" height="18" rx="5"/><line x1="12" y1="3" x2="12" y2="9"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="1.5"/><line x1="6" y1="10" x2="18" y2="10"/><line x1="6" y1="13.5" x2="18" y2="13.5"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19a4 4 0 0 1-4 3h-2"/>',
  diamond: '<polygon points="12 3 20 9 12 21 4 9 12 3"/>',
  package: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><line x1="12" y1="11" x2="12" y2="21"/>',
  camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>',
  link: '<path d="M9.5 14.5l5-5"/><path d="M8 16.5L5.6 18.9a3.2 3.2 0 0 1-4.5-4.5L3.5 12"/><path d="M16 7.5l2.4-2.4a3.2 3.2 0 0 1 4.5 4.5L20.5 12"/>',
  whatsapp: '<path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.3A9 9 0 1 0 12 3z"/><path d="M8.3 8.6c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .5.4.2.5.7 1.7.7 1.9.1.1.1.3 0 .4-.1.2-.2.3-.3.4l-.4.5c-.1.1-.3.3-.1.6.2.4.9 1.4 1.9 2.3 1.3 1.2 1.9 1.3 2.2 1.4.3.1.5.1.6-.1l.6-.6c.2-.2.4-.2.6-.1l1.7.8c.2.1.3.2.3.3 0 .5-.2 1.3-.5 1.6-.4.4-1.2.7-1.7.7-.5 0-1.9-.2-3.6-1.5-2-1.5-3.2-3.5-3.4-3.9-.1-.3-.9-1.3-.9-2.5 0-1.1.6-1.7.8-1.9z" fill="currentColor" stroke="none"/>',
  x: '<line x1="4.5" y1="4.5" x2="19.5" y2="19.5"/><line x1="19.5" y1="4.5" x2="4.5" y2="19.5"/>',
  facebook: '<path d="M14 21v-8h2.7l.4-3.4H14V7.4c0-1 .3-1.6 1.7-1.6H17V2.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.7H8v3.4h2.5V21"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="21" y1="21" x2="15.8" y2="15.8"/><line x1="10.5" y1="7.5" x2="10.5" y2="13.5"/><line x1="7.5" y1="10.5" x2="13.5" y2="10.5"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="21" y1="21" x2="15.8" y2="15.8"/><line x1="7.5" y1="10.5" x2="13.5" y2="10.5"/>',
  google: '<path d="M21.6 12.23c0-.68-.06-1.36-.18-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 3-4.32 3-7.32z" fill="#4285F4" stroke="none"/><path d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.24-2.5c-.9.6-2.06.96-3.4.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.58A10 10 0 0 0 12 22z" fill="#34A853" stroke="none"/><path d="M6.4 13.9a5.9 5.9 0 0 1 0-3.8V7.52H3.05a10 10 0 0 0 0 8.96l3.35-2.58z" fill="#FBBC05" stroke="none"/><path d="M12 5.98c1.47 0 2.8.5 3.84 1.5l2.88-2.88C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.95 5.52L6.4 10.1C7.2 7.74 9.4 5.98 12 5.98z" fill="#EA4335" stroke="none"/>',
  discord: '<path d="M8.5 5.5c2.3-.6 4.7-.6 7 0" /><path d="M6.5 6.7C3.8 7.9 2.3 11 2.5 15.2c1.4 1.4 3.2 2.2 5 2.5l.9-1.5" /><path d="M17.5 6.7c2.7 1.2 4.2 4.3 4 8.5-1.4 1.4-3.2 2.2-5 2.5l-.9-1.5" /><ellipse cx="9" cy="13.2" rx="1.3" ry="1.5" fill="currentColor" stroke="none"/><ellipse cx="15" cy="13.2" rx="1.3" ry="1.5" fill="currentColor" stroke="none"/>'
};

const Icons = {
  svg(name, size = 18, cls = ''){
    const body = ICON_PATHS[name] || ICON_PATHS.alertCircle;
    return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
};
