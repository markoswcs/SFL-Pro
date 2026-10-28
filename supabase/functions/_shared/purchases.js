// Detecção de compras no mercado. O jogo não guarda o preço de uma compra instantânea
// (marketplace.listingPurchased / buyBulkResources), então comparamos duas leituras seguidas
// da fazenda: quanto FLOWER saiu do saldo e quais itens negociáveis entraram.

/** Quantidade mínima por anúncio de cada recurso (actions/tradeLimits.ts). Também é a lista do que conta como recurso. */
export const TRADE_MINIMUMS = {"Sunflower":200,"Potato":200,"Rhubarb":200,"Pumpkin":100,"Zucchini":100,"Carrot":100,"Yam":100,"Cabbage":100,"Broccoli":100,"Soybean":50,"Beetroot":50,"Pepper":50,"Cauliflower":50,"Parsnip":20,"Eggplant":20,"Corn":20,"Onion":20,"Radish":10,"Wheat":10,"Turnip":10,"Kale":10,"Artichoke":10,"Barley":10,"Saltwort":10,"Crystal Leaf":10,"Tomato":20,"Lemon":10,"Blueberry":10,"Orange":10,"Apple":5,"Banana":5,"Celestine":3,"Lunara":2,"Duskberry":1,"Grape":5,"Rice":5,"Olive":5,"Wood":50,"Stone":10,"Iron":5,"Gold":3,"Crimstone":1,"Salt":10,"Honey":5,"Feather":20,"Egg":10,"Milk":5,"Leather":5,"Wool":10,"Merino Wool":5,"Ruffroot":1,"Chewed Bone":1,"Heart leaf":1,"Frost Pebble":1,"Wild Grass":1,"Ribbon":1,"Dewberry":1,"Moonfur":1,"Capsule Bait":1,"Umbrella Bait":1,"Crimson Baitfish":1,"Green Beetle":5,"Blue Beetle":5,"Pink Beetle":5,"Amber Beetle":5,"Pig Bristles":5,"Truffle":5};

const num = v => Number(v ?? 0) || 0;
// Contadores do jogo que sobem a cada compra no mercado.
const BUY_COUNTERS = /^(Bulk Resources Purchased|Marketplace Listing Purchased|Marketplace .*Purchased)$/;

/** O que precisamos guardar de uma leitura para comparar com a próxima. */
export function farmState(farm, at = Date.now()) {
  const counts = obj => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k, num(v)]).filter(([, v]) => v > 0));
  return {
    at,
    balance: num(farm?.balance),
    inv: counts(farm?.inventory),
    wardrobe: counts(farm?.wardrobe),
    buys: Object.entries(farm?.farmActivity ?? {}).filter(([k]) => BUY_COUNTERS.test(k)).reduce((s, [, v]) => s + num(v), 0),
    offers: Object.fromEntries(Object.entries(farm?.trades?.offers ?? {}).map(([id, o]) => [id, { sfl: num(o?.sfl), done: !!o?.fulfilledAt }])),
    listings: Object.fromEntries(Object.entries(farm?.trades?.listings ?? {}).map(([id, l]) => [id, { net: num(l?.sfl) - num(l?.tax), done: !!l?.fulfilledAt }])),
  };
}

/**
 * Compara duas leituras. Devolve null se não houve compra, ou
 * { spent, at, item, qty, pending, candidates } — `pending` quando não dá para saber qual item foi.
 * `prices` é o preço P2P por unidade, usado para escolher o item que explica o valor gasto.
 */
export function detectPurchase(prev, cur, prices = {}) {
  if (!prev || !cur || cur.at <= prev.at) return null;
  // Saldo que saiu, tirando o que entrou ou saiu por outros motivos do mercado.
  let spent = prev.balance - cur.balance;
  for (const [id, l] of Object.entries(prev.listings ?? {})) if (l.done && !cur.listings?.[id]) spent += l.net; // venda coletada (+)
  for (const [id, o] of Object.entries(cur.offers ?? {})) if (!prev.offers?.[id]) spent -= o.sfl; // oferta nova reserva FLOWER (−)
  for (const [id, o] of Object.entries(prev.offers ?? {})) if (!cur.offers?.[id] && !o.done) spent += o.sfl; // oferta cancelada devolve (+)
  spent = Math.round(spent * 1e6) / 1e6;
  if (spent < 0.0005) return null;

  const grew = (a = {}, b = {}) => Object.entries(b).map(([item, q]) => ({ item, qty: q - num(a[item]) })).filter(x => x.qty > 0);
  const candidates = [...grew(prev.inv, cur.inv), ...grew(prev.wardrobe, cur.wardrobe)]
    .filter(x => x.item in TRADE_MINIMUMS || num(prices[x.item]) > 0 || cur.wardrobe?.[x.item])
    .map(x => {
      const expected = num(prices[x.item]) * x.qty;
      return { ...x, qty: Math.round(x.qty * 1e4) / 1e4, score: expected > 0 ? Math.abs(expected - spent) / spent : null };
    })
    .sort((a, b) => (a.score ?? 9) - (b.score ?? 9));
  if (!candidates.length) return null;

  // Certeza: um item só, ou um item cujo valor de mercado explica o gasto bem melhor que os outros.
  const counted = cur.buys > prev.buys;
  const [best, second] = candidates;
  const clear = candidates.length === 1
    ? best.score == null || best.score < 0.6
    : best.score != null && best.score < 0.35 && (second.score == null || second.score > 0.6);
  return {
    spent, at: cur.at, item: best.item, qty: best.qty,
    pending: !(clear && (counted || candidates.length === 1)),
    candidates: candidates.slice(0, 6).map(({ item, qty }) => ({ item, qty })),
  };
}
