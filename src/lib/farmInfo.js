// Dados derivados da fazenda: VIP, expansão da ilha e avatar do bumpkin.
// Preços e regras vêm do código oficial do jogo (features/game/lib/vipAccess.ts,
// components/modal/components/BuyGems.tsx e types/expansions.ts).
import { EXPANSION_REQUIREMENTS, ISLAND_MAX_EXPANSION } from './expansions.js';

export const VIP_PRICES = { '1_MONTH': 1250, '3_MONTHS': 1500, '2_YEARS': 11500 };

// Pacotes de gemas (USD). Quantidades personalizadas usam o maior pacote abaixo como referência.
const GEM_PACKS = [[100, 1.29], [650, 6.49], [1350, 12.99], [2800, 25.99], [7400, 64.99], [15500, 129.99], [200000, 1299.99]];

export function gemsToUsd(gems) {
  const [amount, usd] = [...GEM_PACKS].reverse().find(([a]) => a <= gems) ?? GEM_PACKS[0];
  return (gems * usd) / amount;
}

const num = v => Number(v ?? 0) || 0;

export function vipInfo(farm, land, now = Date.now()) {
  const lifetime = num(farm?.inventory?.['Lifetime Farmer Banner']) > 0;
  const expiresAt = farm?.vip?.expiresAt ?? (land?.land?.vip_info?.left ? now + land.land.vip_info.left * 1000 : null);
  const active = lifetime || (expiresAt ?? 0) > now || !!land?.land?.vip;
  const msLeft = expiresAt ? expiresAt - now : 0;
  return { lifetime, active, expiresAt, daysLeft: Math.max(0, Math.floor(msLeft / 86400_000)), msLeft };
}

export function bumpkinImage(farm, size = 100) {
  const uri = farm?.bumpkin?.tokenUri;
  return uri ? `https://animations.sunflower-land.com/bumpkin_image/${uri}/${size}` : null;
}

const hasCollectible = (farm, name) => !!(farm?.collectibles?.[name]?.length || farm?.home?.collectibles?.[name]?.length);

export function expansionInfo(farm, vipActive) {
  const island = farm?.island?.type ?? 'basic';
  const lands = num(farm?.inventory?.['Basic Land']);
  const max = ISLAND_MAX_EXPANSION[island] ?? null;
  const next = lands + 1;
  const building = farm?.expansionConstruction?.readyAt ? farm.expansionConstruction : null;
  const base = EXPANSION_REQUIREMENTS[island]?.[next];

  if (max && next > max) return { island, lands, max, next, building, status: 'max' };
  if (!base) return { island, lands, max, next, building, status: 'formula' };

  const halve = hasCollectible(farm, "Grinx's Hammer");
  const resources = Object.entries(base.resources).map(([name, need]) => {
    const required = halve && name !== 'Gem' ? need / 2 : need;
    const have = num(name === 'Gem' ? farm?.inventory?.Gem : farm?.inventory?.[name]);
    return { name, need: required, have, ok: have >= required };
  });
  let coins = base.coins;
  if (vipActive && coins > 0) coins -= Math.max(500, Math.floor(coins * 0.2));
  const coinsOk = num(farm?.coins) >= coins;
  const done = resources.filter(r => r.ok).length + (coinsOk ? 1 : 0);
  const total = resources.length + (coins > 0 ? 1 : 0);

  return {
    island, lands, max, next, building, status: 'next',
    resources, coins, coinsFull: base.coins, coinsOk, seconds: base.seconds, level: base.level,
    progress: total ? done / total : 1,
  };
}

export const farmLink = farmId => `https://sunflower-land.com/play/#/visit/${farmId}`;

export const SUPPORT = {
  farmId: '2601876753363557',
  wallet: '0xc50D1bB0EF7F6F4E5BBeB06bde2aA4C5Df0C6219',
};
