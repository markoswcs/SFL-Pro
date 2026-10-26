// Contas do mercado P2P: taxa de venda, variação de preço e sinais de compra/venda.
// Regras da taxa vêm do código do jogo (types/marketplace.ts e actions/tradeLimits.ts).
import { vipInfo } from './farmInfo.js';

// Venda de NFTs (colecionáveis, roupas…) paga 10%.
export const MARKETPLACE_TAX = 0.1;

// Recursos pagam conforme a ilha; VIP corta pela metade e o Trading Shrine tira mais 2,5 pontos.
const ISLAND_RESOURCE_TAX = { basic: 1, spring: 0.55, desert: 0.25, volcano: 0.15, swamp: 0.15, spooky: 0.15, crystal: 0.15, galaxy: 0.15, marble: 0.15 };
const SHRINE_MS = 30 * 86400_000;

/** Quantidade mínima por anúncio de cada recurso (TRADE_MINIMUMS). Também é a lista do que conta como recurso. */
export const TRADE_MINIMUMS = {"Sunflower":200,"Potato":200,"Rhubarb":200,"Pumpkin":100,"Zucchini":100,"Carrot":100,"Yam":100,"Cabbage":100,"Broccoli":100,"Soybean":50,"Beetroot":50,"Pepper":50,"Cauliflower":50,"Parsnip":20,"Eggplant":20,"Corn":20,"Onion":20,"Radish":10,"Wheat":10,"Turnip":10,"Kale":10,"Artichoke":10,"Barley":10,"Saltwort":10,"Crystal Leaf":10,"Tomato":20,"Lemon":10,"Blueberry":10,"Orange":10,"Apple":5,"Banana":5,"Celestine":3,"Lunara":2,"Duskberry":1,"Grape":5,"Rice":5,"Olive":5,"Wood":50,"Stone":10,"Iron":5,"Gold":3,"Crimstone":1,"Salt":10,"Honey":5,"Feather":20,"Egg":10,"Milk":5,"Leather":5,"Wool":10,"Merino Wool":5,"Ruffroot":1,"Chewed Bone":1,"Heart leaf":1,"Frost Pebble":1,"Wild Grass":1,"Ribbon":1,"Dewberry":1,"Moonfur":1,"Capsule Bait":1,"Umbrella Bait":1,"Crimson Baitfish":1,"Green Beetle":5,"Blue Beetle":5,"Pink Beetle":5,"Amber Beetle":5,"Pig Bristles":5,"Truffle":5};

export const isResource = name => name in TRADE_MINIMUMS;

/** Taxa de venda de recursos desta fazenda, com a explicação de cada parte. */
export function resourceTax(farm, land, now = Date.now()) {
  const island = farm?.island?.type ?? land?.land?.type ?? 'basic';
  const base = ISLAND_RESOURCE_TAX[island] ?? ISLAND_RESOURCE_TAX.basic;
  const vip = vipInfo(farm, land, now).active;
  const places = [farm?.collectibles, farm?.home?.collectibles];
  const shrine = places.some(c => c?.['Trading Shrine']?.some?.(s => (s.createdAt ?? 0) + SHRINE_MS > now));
  let rate = base;
  if (vip) rate *= 0.5;
  if (shrine) rate -= 0.025;
  return { rate: Math.max(0, Math.round(rate * 10000) / 10000), island, base, vip, shrine };
}

/** Taxa que incide na venda deste item. */
export const taxFor = (name, tax) => (isResource(name) ? tax.rate : MARKETPLACE_TAX);

/** Valor no ponto mais próximo de `at` sem passar dele (ou o mais antigo, se o histórico for curto). */
function valueAt(t, values, at) {
  let pick = null;
  for (let i = 0; i < t.length; i++) {
    if (values[i] == null) continue;
    if (t[i] <= at) pick = i;
    else break;
  }
  if (pick == null) pick = values.findIndex(v => v != null);
  return pick >= 0 ? { value: values[pick], at: t[pick] } : null;
}

/**
 * Estatísticas de um item a partir do histórico { t, items } e do preço atual.
 * Variação de 24 h e 7 dias, média, mínimo e máximo dos últimos 7 dias.
 */
export function itemStats(history, name, current, now = Date.now()) {
  const t = history?.t ?? [];
  const values = history?.items?.[name] ?? [];
  const points = t.map((at, i) => ({ at, v: values[i] })).filter(p => p.v != null && p.v > 0);
  if (current > 0) points.push({ at: now, v: current });
  if (points.length < 2) return { current, points, span: 0 };
  const span = now - points[0].at;
  const cur = current > 0 ? current : points[points.length - 1].v;
  const ref24 = valueAt(t, values, now - 86400_000);
  const ref7 = valueAt(t, values, now - 7 * 86400_000);
  const week = points.filter(p => p.at >= now - 7 * 86400_000).map(p => p.v);
  const avg7 = week.reduce((s, v) => s + v, 0) / week.length;
  const change = ref => (ref?.value > 0 ? (cur - ref.value) / ref.value : null);
  return {
    current: cur, points, span,
    change24: change(ref24), change7: change(ref7),
    ref24At: ref24?.at, ref7At: ref7?.at,
    avg7, min7: Math.min(...week), max7: Math.max(...week),
  };
}

// Só dá sinal com pelo menos 12 h de histórico, para uma foto ruim não virar recomendação.
const MIN_SPAN = 12 * 3600_000;

/**
 * Sinais simples a partir da média de 7 dias:
 * - sell: o preço está bem acima da média ou perto da máxima.
 * - flip: comprando agora e revendendo na média, sobra lucro mesmo pagando a taxa.
 */
export function signals(stats, taxRate) {
  if (!stats || stats.span < MIN_SPAN || !(stats.avg7 > 0)) return { sell: null, flip: null };
  const { current, avg7, max7 } = stats;
  const above = current / avg7 - 1;
  const sell = above >= 0.08 || (max7 > avg7 * 1.05 && current >= max7 * 0.97) ? above : null;
  const flipMargin = (avg7 * (1 - taxRate) - current) / current;
  const flip = flipMargin >= 0.05 ? flipMargin : null;
  return { sell, flip, flipMargin };
}

/** Contas de uma compra: quanto vale agora, quanto sobra vendendo e por quanto anunciar. */
export function purchaseMath({ qty, unit }, current, taxRate, goal = 0.1) {
  const cost = qty * unit;
  const netNow = qty * current * (1 - taxRate);
  return {
    cost,
    valueNow: qty * current,
    netNow,
    profitNow: netNow - cost,
    change: unit > 0 ? (current - unit) / unit : null,
    breakEven: unit / (1 - taxRate),
    target: (unit * (1 + goal)) / (1 - taxRate),
  };
}
