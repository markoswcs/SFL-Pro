// Contas do mercado P2P: taxa de venda, variação de preço e sinais de compra/venda.
// Regras da taxa vêm do código do jogo (types/marketplace.ts e actions/tradeLimits.ts).
import { TRADE_MINIMUMS } from '../../supabase/functions/_shared/purchases.js';
import { vipInfo } from './farmInfo.js';

export { TRADE_MINIMUMS };

// Venda de NFTs (colecionáveis, roupas…) paga 10%.
export const MARKETPLACE_TAX = 0.1;

// Recursos pagam conforme a ilha; VIP corta pela metade e o Trading Shrine tira mais 2,5 pontos.
const ISLAND_RESOURCE_TAX = { basic: 1, spring: 0.55, desert: 0.25, volcano: 0.15, swamp: 0.15, spooky: 0.15, crystal: 0.15, galaxy: 0.15, marble: 0.15 };
const SHRINE_MS = 30 * 86400_000;


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

/** Rótulo da comparação "semanal" enquanto o histórico ainda não tem 7 dias ("2d", "5d"…). */
const periodLabel = ms => (ms >= 6.5 * 86400_000 ? '7d' : `${Math.max(1, Math.round(ms / 86400_000))}d`);

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
  // Com histórico curto, a comparação é com o ponto mais antigo: o rótulo mostra o período real.
  const hours = ref24 ? Math.max(1, Math.round((now - ref24.at) / 3600_000)) : 24;
  return {
    current: cur, points, span,
    change24: change(ref24), change7: ref7 && ref24 && ref7.at === ref24.at ? null : change(ref7),
    label24: hours >= 20 ? '24h' : `${hours}h`,
    label7: ref7 ? periodLabel(now - ref7.at) : '7d',
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

/** Cotação FLOWER→US$ guardada mais perto de `at` sem passar dele (ou a mais antiga). */
export function usdAt(history, at) {
  const t = history?.t ?? [];
  const usd = history?.usd ?? [];
  let pick = null;
  for (let i = 0; i < t.length; i++) {
    if (usd[i] == null) continue;
    if (t[i] <= at || pick == null) pick = usd[i];
    if (t[i] > at) break;
  }
  return pick;
}

/** Estatísticas de um NFT a partir do resumo do servidor [24h, 7d, média, mín., máx., início]. */
export function nftStats(summary, current, now = Date.now()) {
  if (!summary) return { current, points: [], span: 0 };
  const [p24, p7, avg7, min7, max7, first] = summary;
  const change = ref => (ref > 0 && current > 0 ? (current - ref) / ref : null);
  return {
    current, points: [], span: now - first,
    change24: change(p24),
    label24: now - first >= 20 * 3600_000 ? '24h' : `${Math.max(1, Math.round((now - first) / 3600_000))}h`,
    change7: now - first >= 36 * 3600_000 ? change(p7) : null,
    label7: periodLabel(now - first),
    avg7, min7: Math.min(min7, current || min7), max7: Math.max(max7, current || 0),
  };
}

/**
 * Agrupa as compras por item numa posição com preço médio e cotação média do FLOWER.
 * `overrides[item] = { avgUnit, avgUsd }` vem da edição manual do preço médio.
 */
export function buildPositions(txs, overrides = {}) {
  const map = new Map();
  for (const tx of txs) {
    const p = map.get(tx.item) ?? { item: tx.item, qty: 0, cost: 0, usdCost: 0, usdBase: 0, txs: [] };
    p.qty += tx.qty;
    p.cost += tx.sfl;
    if (tx.usd > 0) { p.usdCost += tx.sfl * tx.usd; p.usdBase += tx.sfl; }
    p.txs.push(tx);
    map.set(tx.item, p);
  }
  return [...map.values()].map(p => {
    const o = overrides[p.item] ?? {};
    const avgUnit = o.avgUnit > 0 ? o.avgUnit : p.cost / p.qty;
    const avgUsd = o.avgUsd > 0 ? o.avgUsd : p.usdBase > 0 ? p.usdCost / p.usdBase : null;
    const lastAt = Math.max(...p.txs.map(x => x.at));
    return { item: p.item, qty: p.qty, avgUnit, avgUsd, txs: p.txs.sort((a, b) => b.at - a.at), edited: !!(o.avgUnit || o.avgUsd), lastAt };
  }).sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * Contas de uma posição em FLOWER e em dólar. Lucro em FLOWER pode virar prejuízo em US$
 * se o FLOWER caiu desde a compra; `breakEvenUsd` é o preço por unidade (em FLOWER)
 * para recuperar os dólares investidos na cotação de hoje.
 */
export function positionMath({ qty, avgUnit, avgUsd }, current, curUsd, taxRate, goal = 0.1) {
  const cost = qty * avgUnit;
  const net = qty * current * (1 - taxRate);
  const out = {
    cost, net, profit: net - cost, pct: cost > 0 ? (net - cost) / cost : null,
    change: avgUnit > 0 && current > 0 ? (current - avgUnit) / avgUnit : null,
    breakEven: avgUnit / (1 - taxRate),
    target: (avgUnit * (1 + goal)) / (1 - taxRate),
  };
  if (avgUsd > 0 && curUsd > 0) {
    out.costUsd = cost * avgUsd;
    out.netUsd = net * curUsd;
    out.profitUsd = out.netUsd - out.costUsd;
    out.pctUsd = out.costUsd > 0 ? out.profitUsd / out.costUsd : null;
    out.flowerMove = curUsd / avgUsd - 1;
    out.breakEvenUsd = (avgUnit * avgUsd) / curUsd / (1 - taxRate);
    out.targetUsd = out.breakEvenUsd * (1 + goal);
  }
  return out;
}
