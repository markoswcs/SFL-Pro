// NFTs do jogo (colecionáveis e roupas) com floor, última venda, supply e boost, da sfl.world/api/v1/nfts.
// Alguns itens vêm sem nome: as roupas saem da tabela de ids do bumpkin e os colecionáveis do KNOWN_IDS do jogo.
import { BUMPKIN_ITEM_IDS } from './bumpkin-ids.js';

const WEARABLE_BY_ID = Object.fromEntries(Object.entries(BUMPKIN_ITEM_IDS).map(([name, id]) => [id, name]));
const COLLECTIBLE_BY_ID = {"801":"Australian Flag","802":"Belgian Flag","803":"Brazilian Flag","804":"Chinese Flag","805":"Finnish Flag","806":"French Flag","807":"German Flag","808":"Indonesian Flag","809":"Indian Flag","810":"Iranian Flag","811":"Italian Flag","812":"Japanese Flag","813":"Moroccan Flag","814":"Dutch Flag","815":"Philippine Flag","816":"Polish Flag","817":"Portuguese Flag","818":"Russian Flag","819":"Saudi Arabian Flag","820":"South Korean Flag","821":"Spanish Flag","822":"Sunflower Flag","823":"Thai Flag","824":"Turkish Flag","825":"Ukrainian Flag","826":"American Flag","827":"Vietnamese Flag","828":"Canadian Flag","829":"Singaporean Flag","830":"British Flag","831":"Sierra Leone Flag","832":"Romanian Flag","833":"Rainbow Flag","834":"Goblin Flag","835":"Pirate Flag","836":"Algerian Flag","837":"Mexican Flag","838":"Dominican Republic Flag","839":"Argentinian Flag","840":"Lithuanian Flag","841":"Malaysian Flag","842":"Colombian Flag","1249":"Luminous Lantern","1250":"Radiance Lantern","1251":"Aurora Lantern","1265":"Ocean Lantern","1272":"Solar Lantern","1273":"Betty Lantern","1274":"Bumpkin Lantern","1276":"Goblin Lantern","1533":"Kraken Tentacle","2359":"Blue Paint Bucket","2360":"Green Paint Bucket","2361":"Purple Paint Bucket","2362":"Yellow Paint Bucket","2363":"Color Wheel","2364":"Dhol Drum","2365":"Mimic Slime Ball","2366":"Mimic Winged Slime Ball","2367":"Pork Jelly","2368":"Rainbow Pork Jelly","2369":"Slime Totem","2370":"Giant Donut","2371":"Fool's Gold","2372":"Golden Slime Trophy","2373":"Silver Slime Trophy","2374":"Bronze Slime Trophy"};

/** Arte oficial do NFT pelo id (a mesma do marketplace do jogo). */
export const nftImage = n => (n.kind === 'wearable'
  ? `https://sunflower-land.com/play/wearables/images/${n.id}.png`
  : `https://sunflower-land.com/play/erc1155/images/${n.id}.webp`);

/** Lista única de NFTs: { key: "c1210" | "w523", id, kind, name, floor, last, supply, boost }. */
export function normalizeNfts(data) {
  const out = [];
  for (const [kind, prefix, list, names] of [['collectible', 'c', data?.collectibles, COLLECTIBLE_BY_ID], ['wearable', 'w', data?.wearables, WEARABLE_BY_ID]]) {
    for (const n of list ?? []) {
      const name = n.name ?? names[n.id];
      if (!name) continue;
      out.push({
        key: `${prefix}${n.id}`, id: n.id, kind, name,
        floor: Number(n.floor) || 0, last: Number(n.lastSalePrice) || 0, supply: Number(n.supply) || 0,
        boost: n.have_boost ? String(n.boost_text ?? '') : '',
      });
    }
  }
  return out;
}

/** Quantos de cada NFT a fazenda tem: colecionáveis no inventário, roupas no guarda-roupa. */
export function ownedNfts(farm, nfts) {
  const out = new Map();
  for (const n of nfts) {
    const qty = n.kind === 'wearable' ? Number(farm?.wardrobe?.[n.name] ?? 0) : Number(farm?.inventory?.[n.name] ?? 0);
    if (qty > 0) out.set(n.key, qty);
  }
  return out;
}
