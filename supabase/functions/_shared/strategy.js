// Estratégia de lucro em FLOWER: o que vender do estoque (quanto e a que preço), quando o preço
// está bom, e o que comprar nos eventos do calendário (Lua Cheia, Entrega Dupla).
// Regras do jogo: actions/tradeLimits.ts (lote máximo por anúncio), events/landExpansion/seedBought.ts
// (sementes da lua só na Lua Cheia, até 10 de cada no inventário), landExpansion/utils.ts (4 colheitas).
import { fruitYield, yieldContext } from './yields.js';

const H = 3600_000;
const D = 24 * H;

/** Maior quantidade de um recurso num único anúncio do mercado. */
export const TRADE_LIMITS = {
  Sunflower: 4000, Potato: 3000, Rhubarb: 2000, Pumpkin: 2000, Zucchini: 2000, Carrot: 2000, Yam: 2000, Cabbage: 2000,
  Broccoli: 2000, Soybean: 2000, Beetroot: 1000, Pepper: 1000, Cauliflower: 1000, Parsnip: 1000, Eggplant: 1000, Corn: 1000,
  Onion: 1000, Radish: 500, Wheat: 500, Turnip: 500, Kale: 500, Artichoke: 500, Barley: 500, Saltwort: 500, 'Crystal Leaf': 500,
  Tomato: 400, Lemon: 300, Blueberry: 300, Orange: 300, Apple: 200, Banana: 200, Celestine: 20, Lunara: 15, Duskberry: 10,
  Grape: 100, Rice: 100, Olive: 100,
  Wood: 500, Stone: 200, Iron: 200, Gold: 100, Crimstone: 20, Salt: 500,
  Egg: 500, Feather: 1000, Honey: 100, Milk: 100, Leather: 100, Wool: 1000, 'Merino Wool': 400,
};

// Taxa de venda de recursos por ilha (VIP corta pela metade, Trading Shrine tira 2,5 pontos).
export const ISLAND_RESOURCE_TAX = { basic: 1, spring: 0.55, desert: 0.25, volcano: 0.15, swamp: 0.15, spooky: 0.15, crystal: 0.15, galaxy: 0.15, marble: 0.15 };

/** Taxa de venda calculada só com a fazenda (o servidor não tem os dados do land). */
export function farmTaxRate(farm, now = Date.now()) {
  const base = ISLAND_RESOURCE_TAX[farm?.island?.type] ?? ISLAND_RESOURCE_TAX.basic;
  const vip = Number(farm?.inventory?.['Lifetime Farmer Banner'] ?? 0) > 0 || (farm?.vip?.expiresAt ?? 0) > now;
  const shrine = [farm?.collectibles, farm?.home?.collectibles].some(c => c?.['Trading Shrine']?.some?.(s => (s.createdAt ?? 0) + 30 * D > now));
  return Math.max(0, (vip ? base / 2 : base) - (shrine ? 0.025 : 0));
}

export const FULL_MOON_SEEDS = [
  { seed: 'Duskberry Seed', fruit: 'Duskberry', coins: 1250, hours: 24 },
  { seed: 'Lunara Seed', fruit: 'Lunara', coins: 750, hours: 12 },
  { seed: 'Celestine Seed', fruit: 'Celestine', coins: 300, hours: 6 },
];
const SEED_LIMIT = 10;
const MIN_LOT_NET = 1; // abaixo de 1 FLOWER líquido por lote não vale o anúncio
const MIN_SPAN = 12 * H; // sinal de preço só com pelo menos 12 h de histórico

/** Média, máximo e mínimo dos últimos 7 dias de cada item, a partir de { t, items }. */
export function weekStats(history, now = Date.now()) {
  const t = history?.t ?? [];
  const out = {};
  for (const [name, values] of Object.entries(history?.items ?? {})) {
    const week = [];
    let first = null;
    t.forEach((at, i) => {
      const v = values[i];
      if (!(v > 0)) return;
      if (first == null) first = at;
      if (at >= now - 7 * D) week.push(v);
    });
    if (!week.length) continue;
    out[name] = { avg7: week.reduce((s, v) => s + v, 0) / week.length, max7: Math.max(...week), min7: Math.min(...week), span: now - first };
  }
  return out;
}

/**
 * Situação de venda de um item: acima da média (hora de vender), na média, ou abaixo (segurar).
 * `sell` segue o mesmo critério dos sinais da aba Preços: 8% acima da média ou perto da máxima.
 */
export function sellSignal(price, stats) {
  if (!(price > 0) || !stats || stats.span < MIN_SPAN || !(stats.avg7 > 0)) return { above: null, sell: false, hold: false };
  const above = price / stats.avg7 - 1;
  const sell = above >= 0.08 || (stats.max7 > stats.avg7 * 1.05 && price >= stats.max7 * 0.97);
  return { above, sell, hold: above <= -0.08 };
}

const inv = (farm, name) => Number(farm?.inventory?.[name] ?? 0) || 0;
const placed = (farm, name) => [farm?.collectibles, farm?.home?.collectibles].some(c => c?.[name]?.some?.(p => p?.coordinates));

/** Quantas colheitas uma fruta da lua dá nesta fazenda (4, +1 ou +2 com Immortal Pear). */
export function fullMoonHarvests(farm) {
  if (!placed(farm, 'Immortal Pear')) return 4;
  return 4 + (farm?.bumpkin?.skills?.['Pear Turbocharge'] ? 2 : 1);
}

/** Datas futuras (e a de hoje) dos eventos do calendário, em ms UTC do início do dia. */
export function calendarEvents(farm, now = Date.now()) {
  const list = (farm?.calendar?.dates ?? [])
    .filter(e => e?.name === 'fullMoon' || e?.name === 'doubleDelivery')
    .map(e => ({ name: e.name, at: Date.parse(`${e.date}T00:00:00Z`) }))
    .filter(e => Number.isFinite(e.at) && e.at + D > now);
  // Lua cheia já ativa (aparece em calendar.fullMoon mesmo se a data não estiver na lista).
  const live = farm?.calendar?.fullMoon?.startedAt;
  if (live && live + D > now && !list.some(e => e.name === 'fullMoon' && Math.abs(e.at - live) < D)) list.push({ name: 'fullMoon', at: live });
  return list.sort((a, b) => a.at - b.at);
}

/**
 * Plano de compra da Lua Cheia: quantas sementes de cada, quanto custa em moedas e quanto deve
 * render em FLOWER líquido. Prioriza a semente que mais rende por semente.
 */
export function fullMoonPlan(farm, p2p, stats, taxRate) {
  const ctx = yieldContext(farm);
  const harvests = fullMoonHarvests(farm);
  let coins = Number(farm?.coins ?? 0) || 0;
  const options = FULL_MOON_SEEDS.map(s => {
    const price = stats?.[s.fruit]?.avg7 ?? Number(p2p?.[s.fruit] ?? 0);
    const perHarvest = fruitYield(ctx, s.fruit, {});
    const perSeed = harvests * perHarvest * price * (1 - taxRate);
    return { ...s, price, perHarvest, perSeed, have: inv(farm, s.seed), stock: inv(farm, s.fruit) };
  }).sort((a, b) => b.perSeed - a.perSeed);
  const buys = [];
  for (const o of options) {
    const room = Math.max(0, SEED_LIMIT - o.have);
    const qty = Math.min(room, Math.floor(coins / o.coins));
    if (qty <= 0 || o.perSeed <= 0) continue;
    coins -= qty * o.coins;
    buys.push({ seed: o.seed, fruit: o.fruit, qty, coins: qty * o.coins, net: qty * o.perSeed, perSeed: o.perSeed, hours: o.hours });
  }
  const unsold = options.filter(o => o.stock >= 1).map(o => ({ fruit: o.fruit, qty: o.stock, net: o.stock * o.price * (1 - taxRate) }));
  return {
    harvests, buys, options, unsold,
    coins: buys.reduce((s, b) => s + b.coins, 0),
    net: buys.reduce((s, b) => s + b.net, 0),
    patches: Object.keys(farm?.fruitPatches ?? {}).length,
  };
}

/**
 * Estoque que pode virar FLOWER: cada recurso negociável no inventário, o lote sugerido
 * (limite do anúncio), o líquido do lote e do total, e o sinal de preço.
 */
export function stockPlan(farm, p2p, stats, taxRate) {
  const rows = [];
  for (const [name, limit] of Object.entries(TRADE_LIMITS)) {
    const qty = inv(farm, name);
    const price = Number(p2p?.[name] ?? 0);
    if (qty < 1 || !(price > 0)) continue;
    const lot = Math.min(Math.floor(qty), limit);
    const total = qty * price * (1 - taxRate);
    if (total < MIN_LOT_NET) continue;
    const signal = sellSignal(price, stats?.[name]);
    rows.push({ name, qty, price, avg7: stats?.[name]?.avg7 ?? null, lot, lots: Math.ceil(qty / limit), lotNet: lot * price * (1 - taxRate), total, ...signal });
  }
  return rows.sort((a, b) => Number(b.sell) - Number(a.sell) || b.total - a.total);
}

/** Tudo junto, para a aba Lucro do app. */
export function strategy(farm, p2p, history, taxRate, now = Date.now()) {
  const stats = weekStats(history, now);
  const stock = stockPlan(farm, p2p, stats, taxRate);
  return {
    stock,
    stockTotal: stock.reduce((s, r) => s + r.total, 0),
    sellNow: stock.filter(r => r.sell),
    events: calendarEvents(farm, now),
    fullMoon: fullMoonPlan(farm, p2p, stats, taxRate),
    taxRate,
  };
}

const day = ms => new Date(ms).toISOString().slice(0, 10);

export const NFT_TAX = 0.1;
const BUY_MARGIN = 0.05; // comprando agora e vendendo na média, sobra pelo menos 5% depois da taxa
const NFT_DIP = 0.08;
const MAX_SELL_ALERTS = 3; // avisos de estoque por dia (o resto aparece na aba Lucro)

/** Anúncio aberto (ainda não vendido) deste item: a pessoa já agiu sobre o aviso de venda. */
export const openListing = (farm, name) => Object.values(farm?.trades?.listings ?? {}).find(l => !l?.fulfilledAt && Number(l?.items?.[name] ?? 0) > 0) ?? null;
/** Oferta de compra aberta deste item: a pessoa já agiu sobre o aviso de compra. */
export const openOffer = (farm, name) => Object.values(farm?.trades?.offers ?? {}).find(o => !o?.fulfilledAt && Number(o?.items?.[name] ?? 0) > 0) ?? null;

/** Quantos a fazenda tem do item (NFT: colecionável no inventário, roupa no guarda-roupa). */
export const holding = (farm, name, wearable = false) => Number((wearable ? farm?.wardrobe : farm?.inventory)?.[name] ?? 0) || 0;

/** Situação de compra de um recurso: o quanto sobra comprando agora e revendendo na média. */
export function buySignal(price, stats, taxRate) {
  if (!(price > 0) || !stats || stats.span < MIN_SPAN || !(stats.avg7 > 0)) return { margin: null, buy: false };
  const margin = (stats.avg7 * (1 - taxRate) - price) / price;
  return { margin, below: price / stats.avg7 - 1, buy: margin >= BUY_MARGIN };
}

/** Situação de compra de um NFT: floor bem abaixo da média de 7 dias. */
export function nftBuySignal(floor, stats) {
  if (!(floor > 0) || !stats || stats.span < MIN_SPAN || !(stats.avg7 > 0)) return { below: null, buy: false };
  const below = floor / stats.avg7 - 1;
  return { below, buy: below <= -NFT_DIP, margin: (stats.avg7 * (1 - NFT_TAX) - floor) / floor };
}

/**
 * Meta de lucro de uma posição comprada: preço mínimo de venda para ganhar `goal` sobre o preço
 * médio já pagando a taxa, e se o preço de agora já passa disso.
 */
export function targetFor(position, price, taxRate, goal = 0.1) {
  const breakEven = position.avg / (1 - taxRate);
  const target = (position.avg * (1 + goal)) / (1 - taxRate);
  const net = position.qty * price * (1 - taxRate);
  const cost = position.qty * position.avg;
  return { breakEven, target, reached: price > 0 && price >= target, net, cost, profit: net - cost, pct: cost > 0 ? (net - cost) / cost : null };
}

/**
 * Avisos de estratégia no formato dos timers (push-tick envia na hora `readyAt`):
 * - Lua Cheia: na véspera (12 h antes) e quando começa, com o plano de compra;
 * - Entrega Dupla: quando começa;
 * - Hora de vender: item do estoque ou NFT seu acima da média, ou posição que bateu a meta de lucro;
 * - Hora de comprar: item que você segue abaixo da média (com lucro na revenda depois da taxa).
 * No máximo um aviso por item por dia. Não avisa de novo se você já anunciou (venda) ou já
 * tem oferta aberta (compra): o app reconhece pela própria fazenda.
 * `prices` = { at, p2p, history, nft? }, `watch` = { items, positions, goal } das preferências.
 */
export function strategyTimers(farm, prices, now = Date.now(), watch = {}) {
  if (!farm) return [];
  const out = [];
  const add = (category, name, readyAt, key, image, meta, amount = 1) =>
    out.push({ key: `${category}:${key}`, category, name, image, readyAt, startedAt: null, count: 1, amount, meta });
  const taxRate = farmTaxRate(farm, now);
  const stats = prices?.history ? weekStats(prices.history, now) : {};
  const p2p = prices?.p2p ?? {};
  const nft = prices?.nft ?? null;
  const goal = watch.goal > 0 ? watch.goal : 0.1;
  const today = prices?.at ? day(prices.at) : null;
  const sold = new Set();

  // Posições compradas que bateram a meta de lucro (preço médio real da Carteira).
  if (today) {
    for (const pos of watch.positions ?? []) {
      const isNft = !!pos.key;
      const price = isNft ? Number(nft?.floors?.[pos.key] ?? 0) : Number(p2p[pos.item] ?? 0);
      const rate = isNft ? NFT_TAX : taxRate;
      const have = isNft ? holding(farm, pos.item, pos.key.startsWith('w')) : inv(farm, pos.item);
      const qty = Math.min(pos.qty, have);
      if (!(qty > 0) || !(pos.avg > 0) || openListing(farm, pos.item)) continue;
      const tg = targetFor({ qty, avg: pos.avg }, price, rate, goal);
      if (!tg.reached || tg.profit < 0.5) continue;
      sold.add(pos.item);
      add('sellSignal', pos.item, prices.at, `target:${pos.item}:${today}`, pos.item, {
        kind: 'target', price, avg: pos.avg, target: tg.target, qty, profit: tg.profit, pct: tg.pct, nft: isNft,
      }, qty);
    }
  }

  for (const e of calendarEvents(farm, now)) {
    if (e.name === 'fullMoon') {
      const plan = fullMoonPlan(farm, p2p, stats, taxRate);
      const meta = {
        kind: 'fullMoon', start: e.at, end: e.at + D, net: Math.round(plan.net * 100) / 100, coins: plan.coins,
        buys: plan.buys.map(b => [b.seed.replace(' Seed', ''), b.qty]),
        unsold: plan.unsold.map(u => [u.fruit, Math.floor(u.qty)]),
      };
      add('calendar', 'Full Moon', e.at - 12 * H, `fullMoonEve:${day(e.at)}`, 'Duskberry', { ...meta, kind: 'fullMoonEve' });
      add('calendar', 'Full Moon', e.at, `fullMoon:${day(e.at)}`, 'Duskberry', meta);
    } else {
      add('calendar', 'Double Delivery', e.at, `doubleDelivery:${day(e.at)}`, 'Flower', { kind: 'doubleDelivery', start: e.at, end: e.at + D });
    }
  }

  if (today && Object.keys(p2p).length) {
    // Estoque parado acima da média: só os 3 que mais rendem, para não lotar o celular.
    const best = stockPlan(farm, p2p, stats, taxRate)
      .filter(r => r.sell && r.total >= 2 && !sold.has(r.name) && !openListing(farm, r.name))
      .sort((a, b) => b.total - a.total).slice(0, MAX_SELL_ALERTS);
    for (const r of best) {
      add('sellSignal', r.name, prices.at, `${r.name}:${today}`, r.name, {
        kind: 'sell', price: r.price, avg7: r.avg7, above: r.above, lot: r.lot, lotNet: r.lotNet, total: r.total, qty: Math.floor(r.qty),
      }, Math.floor(r.qty));
    }
    // Recursos que a pessoa segue, abaixo da média.
    for (const w of watch.items ?? []) {
      if (w.key || !(w.name in TRADE_LIMITS) || openOffer(farm, w.name)) continue;
      const price = Number(p2p[w.name] ?? 0);
      const sig = buySignal(price, stats[w.name], taxRate);
      if (!sig.buy) continue;
      add('buySignal', w.name, prices.at, `${w.name}:${today}`, w.name, {
        kind: 'buy', price, avg7: stats[w.name].avg7, below: sig.below, margin: sig.margin, lot: TRADE_LIMITS[w.name],
      });
    }
  }

  // NFTs: os seus com floor acima da média (vender) e os que você segue abaixo da média (comprar).
  if (nft?.at && nft.floors) {
    const nftDay = day(nft.at);
    for (const [key, name] of Object.entries(nft.names ?? {})) {
      const have = holding(farm, name, key.startsWith('w'));
      if (!(have > 0) || sold.has(name) || openListing(farm, name)) continue;
      const floor = Number(nft.floors[key] ?? 0);
      const st = nft.stats?.[key];
      const sig = sellSignal(floor, st);
      if (!sig.sell || floor * (1 - NFT_TAX) < 1) continue;
      add('sellSignal', name, nft.at, `nft:${key}:${nftDay}`, name, { kind: 'nftSell', price: floor, avg7: st.avg7, above: sig.above, qty: have, net: floor * (1 - NFT_TAX) });
    }
    for (const w of watch.items ?? []) {
      if (!w.key || openOffer(farm, w.name)) continue;
      const floor = Number(nft.floors[w.key] ?? 0);
      const sig = nftBuySignal(floor, nft.stats?.[w.key]);
      if (!sig.buy) continue;
      add('buySignal', w.name, nft.at, `nft:${w.key}:${nftDay}`, w.name, { kind: 'nftBuy', price: floor, avg7: nft.stats[w.key].avg7, below: sig.below, margin: sig.margin });
    }
  }
  return out;
}

const nf = (n, lang, digits = 2) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: digits }).format(n);

/** Texto das notificações de estratégia. */
export function strategyText(group, lang = 'pt', tz = 'America/Sao_Paulo') {
  const en = lang === 'en';
  const m = group.meta ?? {};
  const time = ts => {
    try { return new Date(ts).toLocaleString(en ? 'en-US' : 'pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch { return new Date(ts).toISOString().slice(0, 16); }
  };
  const buys = (m.buys ?? []).map(([name, qty]) => `${qty} ${name}`).join(' + ');
  const pc = v => (v == null ? '' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`);
  switch (m.kind) {
    case 'target':
      return en
        ? { title: `Profit goal hit: ${group.name}!`, body: `Selling ${nf(m.qty, lang, 2)} at ${nf(m.price, lang, 4)} gives ${nf(m.profit, lang)} FLOWER profit (${pc(m.pct)}) over your ${nf(m.avg, lang, 4)} average.` }
        : { title: `Meta de lucro batida: ${group.name}!`, body: `Vendendo ${nf(m.qty, lang, 2)} por ${nf(m.price, lang, 4)} você lucra ${nf(m.profit, lang)} FLOWER (${pc(m.pct)}) sobre seu preço médio de ${nf(m.avg, lang, 4)}.` };
    case 'nftSell':
      return en
        ? { title: `Time to sell ${group.name}! Floor ${pc(m.above)} vs 7d average`, body: `Floor ${nf(m.price, lang)} FLOWER → ${nf(m.net, lang)} net after the 10% fee.` }
        : { title: `Hora de vender ${group.name}! Floor ${pc(m.above)} na média de 7 dias`, body: `Floor ${nf(m.price, lang)} FLOWER → ${nf(m.net, lang)} líquido depois da taxa de 10%.` };
    case 'buy':
      return en
        ? { title: `Time to buy ${group.name}! ${pc(m.below)} vs 7d average`, body: `At ${nf(m.price, lang, 4)}, reselling at the ${nf(m.avg7, lang, 4)} average leaves ${pc(m.margin)} after the fee. Max ${nf(m.lot, lang, 0)} per listing.` }
        : { title: `Hora de comprar ${group.name}! ${pc(m.below)} da média de 7 dias`, body: `A ${nf(m.price, lang, 4)}, revendendo na média (${nf(m.avg7, lang, 4)}) sobra ${pc(m.margin)} depois da taxa. Até ${nf(m.lot, lang, 0)} por anúncio.` };
    case 'nftBuy':
      return en
        ? { title: `${group.name} is cheap! Floor ${pc(m.below)} vs 7d average`, body: `Floor ${nf(m.price, lang)} FLOWER; the 7d average is ${nf(m.avg7, lang)}.` }
        : { title: `${group.name} barato! Floor ${pc(m.below)} da média de 7 dias`, body: `Floor ${nf(m.price, lang)} FLOWER; a média de 7 dias é ${nf(m.avg7, lang)}.` };
    case 'sell': {
      const pct = m.above != null ? `${m.above > 0 ? '+' : ''}${Math.round(m.above * 100)}%` : '';
      return en
        ? { title: `Time to sell ${group.name}! ${pct} vs 7d average`, body: `List ${nf(m.lot, lang, 0)} at ${nf(m.price, lang, 4)} → ${nf(m.lotNet, lang)} FLOWER net · you have ${nf(m.qty, lang, 0)} (${nf(m.total, lang)} FLOWER)` }
        : { title: `Hora de vender ${group.name}! ${pct} na média de 7 dias`, body: `Anuncie ${nf(m.lot, lang, 0)} por ${nf(m.price, lang, 4)} → ${nf(m.lotNet, lang)} FLOWER líquido · você tem ${nf(m.qty, lang, 0)} (${nf(m.total, lang)} FLOWER)` };
    }
    case 'fullMoonEve': {
      const unsold = (m.unsold ?? []).map(([name, qty]) => `${qty} ${name}`).join(', ');
      return en
        ? { title: `Full Moon starts ${time(m.start)}`, body: `${unsold ? `Sell your ${unsold} first. ` : ''}Keep ${nf(m.coins, lang, 0)} coins to buy ${buys || 'moon seeds'}.` }
        : { title: `Lua Cheia começa ${time(m.start)}`, body: `${unsold ? `Venda antes ${unsold}. ` : ''}Guarde ${nf(m.coins, lang, 0)} moedas para comprar ${buys || 'sementes da lua'}.` };
    }
    case 'fullMoon':
      return en
        ? { title: 'Full Moon! Time to buy moon seeds', body: `${buys ? `Buy ${buys} (${nf(m.coins, lang, 0)} coins) → about ${nf(m.net, lang, 1)} FLOWER. ` : ''}In the shop only until ${time(m.end)}; you can plant them later.` }
        : { title: 'Lua Cheia! Hora de comprar sementes', body: `${buys ? `Compre ${buys} (${nf(m.coins, lang, 0)} moedas) → uns ${nf(m.net, lang, 1)} FLOWER. ` : ''}Na loja só até ${time(m.end)}; dá para plantar depois.` };
    case 'doubleDelivery':
      return en
        ? { title: 'Double Delivery started!', body: `Goblin orders pay double FLOWER until ${time(m.end)}. Do every delivery you can.` }
        : { title: 'Entrega Dupla começou!', body: `As entregas dos goblins pagam FLOWER em dobro até ${time(m.end)}. Faça todas que puder.` };
    default:
      return { title: group.name, body: '' };
  }
}
