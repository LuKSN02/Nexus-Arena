/* Gera o bloco CATALOG do worker a partir de js/data.js (fonte única da verdade).
   Uso (na raiz do projeto):  node server/gen-catalog.js
   Imprime um objeto JS; cole-o no lugar de "const CATALOG = ..." em nexus-worker.js
   sempre que mudar preços/recompensas/temporada em js/data.js. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__o={AVAILABLE_FRAMES,AVAILABLE_BADGES,AVAILABLE_BANNERS,AVAILABLE_TITLES,BATTLE_PASS_SEASON,PRODUCTS: typeof PRODUCTS!=="undefined"?PRODUCTS:null};', ctx);
const o = ctx.__o;
const costs = (list) => Object.fromEntries(list.filter(x => x.cost != null).map(x => [x.key, x.cost]));
const out = {
  rewards: { frame: costs(o.AVAILABLE_FRAMES), badge: costs(o.AVAILABLE_BADGES), banner: costs(o.AVAILABLE_BANNERS), title: costs(o.AVAILABLE_TITLES) },
  season: { id: o.BATTLE_PASS_SEASON.id, maxLevel: o.BATTLE_PASS_SEASON.maxLevel, xpPerLevel: o.BATTLE_PASS_SEASON.xpPerLevel, rewards: o.BATTLE_PASS_SEASON.rewards },
  coinPack: { productId: 'p9', coinsPerUnit: 5000 },
  passProductId: o.BATTLE_PASS_SEASON.premiumProductId
};
console.log('const CATALOG = ' + JSON.stringify(out, null, 2) + ';');
