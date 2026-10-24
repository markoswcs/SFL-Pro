// Regras de tempo da fazenda, compartilhadas entre o app (Vite) e as edge functions (Deno).
// Tempos base vêm do código oficial do jogo (sunflower-land/src/features/game).
// Modelo antigo: o jogo grava o início já adiantado pelos boosts, então pronto = início + tempo base.
// Modelo novo: o nó guarda `baseDurationMs`; usamos início + baseDurationMs. Boosts temporários
// podem adiantar alguns minutos, o que a próxima leitura da fazenda corrige.

const H = 3600_000;
const MIN = 60_000;

export const CROP_MS = {
  Sunflower: 1 * MIN, Potato: 5 * MIN, Rhubarb: 10 * MIN, Pumpkin: 30 * MIN, Zucchini: 30 * MIN,
  Carrot: 1 * H, Yam: 1 * H, Cabbage: 2 * H, Broccoli: 2 * H, Soybean: 3 * H, Beetroot: 4 * H,
  Pepper: 4 * H, Cauliflower: 8 * H, Parsnip: 12 * H, Eggplant: 16 * H, Corn: 20 * H, Onion: 20 * H,
  Radish: 24 * H, Wheat: 24 * H, Turnip: 24 * H, Kale: 36 * H, Artichoke: 36 * H, Barley: 48 * H,
  Saltwort: 12 * H,
};

export const GREENHOUSE_MS = { Rice: 32 * H, Olive: 44 * H, Grape: 12 * H };

export const FRUIT_MS = {
  Tomato: 2 * H, Lemon: 4 * H, Blueberry: 6 * H, Orange: 8 * H, Apple: 12 * H, Banana: 12 * H,
  Celestine: 6 * H, Lunara: 12 * H, Duskberry: 24 * H,
};

export const RESOURCE_MS = {
  trees: 2 * H, stones: 4 * H, iron: 8 * H, gold: 24 * H, crimstones: 24 * H, sunstones: 72 * H,
  oilReserves: 20 * H,
};

// Sementes de flor por cor/tipo: a duração depende da semente que gerou a flor.
const FLOWER_SEED_MS = {
  Sunpetal: 24 * H, Bloom: 48 * H, Lily: 120 * H, Edelweiss: 72 * H, Gladiolus: 72 * H,
  Lavender: 72 * H, Clover: 72 * H,
};
const FLOWER_TYPE_TO_SEED = {
  Pansy: 'Sunpetal', Cosmos: 'Sunpetal', Prism: 'Sunpetal',
  Balloon: 'Bloom', Daffodil: 'Bloom', Celestial: 'Bloom',
  Carnation: 'Lily', Lotus: 'Lily', Enigma: 'Lily', Petal: 'Sunpetal',
  Edelweiss: 'Edelweiss', Gladiolus: 'Gladiolus', Lavender: 'Lavender', Clover: 'Clover',
};

export const BEEHIVE_FULL_MS = 24 * H;
export const DAILY_RESET = 'utc-midnight';

export const CATEGORIES = [
  { id: 'crops', label: 'Plantações', en: 'Crops', image: 'Sunflower' },
  { id: 'greenhouse', label: 'Estufa', en: 'Greenhouse', image: 'Rice' },
  { id: 'fruits', label: 'Frutas', en: 'Fruits', image: 'Apple' },
  { id: 'flowers', label: 'Flores', en: 'Flowers', image: 'Red Pansy' },
  { id: 'trees', label: 'Árvores', en: 'Trees', image: 'Wood' },
  { id: 'stones', label: 'Pedra', en: 'Stone', image: 'Stone' },
  { id: 'iron', label: 'Ferro', en: 'Iron', image: 'Iron' },
  { id: 'gold', label: 'Ouro', en: 'Gold', image: 'Gold' },
  { id: 'crimstones', label: 'Crimstone', en: 'Crimstone', image: 'Crimstone' },
  { id: 'sunstones', label: 'Sunstone', en: 'Sunstone', image: 'Sunstone' },
  { id: 'oilReserves', label: 'Petróleo', en: 'Oil', image: 'Oil' },
  { id: 'salt', label: 'Sal', en: 'Salt', image: 'Salt' },
  { id: 'animals', label: 'Animais', en: 'Animals', image: 'Chicken' },
  { id: 'beehives', label: 'Colmeias', en: 'Beehives', image: 'Honey' },
  { id: 'composters', label: 'Composteiras', en: 'Composters', image: 'Sprout Mix' },
  { id: 'cooking', label: 'Cozinha', en: 'Cooking', image: 'Pumpkin Soup' },
  { id: 'cropMachine', label: 'Máquina de Plantio', en: 'Crop Machine', image: 'Rapid Root' },
  { id: 'agingShed', label: 'Galpão de Cura', en: 'Aging Shed', image: 'Refined Salt' },
  { id: 'craftingBox', label: 'Caixa de Criação', en: 'Crafting Box', image: 'Crafting Box' },
  { id: 'daily', label: 'Baú diário', en: 'Daily chest', image: 'Treasure Key' },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const placed = node => node && node.removedAt === undefined && (node.x !== undefined || node.createdAt !== undefined);

function nodeReadyAt(inner, timeKey, baseMs) {
  const start = inner?.[timeKey];
  if (!start) return null;
  if (inner.baseDurationMs !== undefined) return start + inner.baseDurationMs;
  return start + baseMs;
}

/**
 * Converte o estado bruto da fazenda (resposta de /community/farms/:id) em timers.
 * Cada timer: { key, category, name, image, readyAt, count }.
 * `key` é estável entre leituras para o servidor não repetir a mesma notificação.
 */
export function extractTimers(farm, now = Date.now()) {
  if (!farm) return [];
  const out = [];
  const push = (category, name, readyAt, key, image = name, startedAt = null) => {
    if (!readyAt || !Number.isFinite(readyAt)) return;
    out.push({ key: `${category}:${key}`, category, name, image: image ?? name, readyAt, startedAt, count: 1 });
  };

  for (const [id, plot] of Object.entries(farm.crops ?? {})) {
    const c = plot?.crop;
    if (!c?.name || !placed(plot)) continue;
    push('crops', c.name, nodeReadyAt(c, 'plantedAt', CROP_MS[c.name] ?? 0), id, c.name, c.plantedAt);
  }

  for (const [id, pot] of Object.entries(farm.greenhouse?.pots ?? {})) {
    const p = pot?.plant;
    if (!p?.name) continue;
    push('greenhouse', p.name, nodeReadyAt(p, 'plantedAt', GREENHOUSE_MS[p.name] ?? 0), id, p.name, p.plantedAt);
  }

  for (const [id, patch] of Object.entries(farm.fruitPatches ?? {})) {
    const f = patch?.fruit;
    if (!f?.name || !placed(patch)) continue;
    const start = f.harvestedAt || f.plantedAt;
    const ms = FRUIT_MS[f.name] ?? 0;
    const readyAt = f.baseDurationMs !== undefined ? start + f.baseDurationMs : start + ms;
    push('fruits', f.name, readyAt, id, f.name, start);
  }

  for (const [id, bed] of Object.entries(farm.flowers?.flowerBeds ?? {})) {
    const f = bed?.flower;
    if (!f?.name || !placed(bed)) continue;
    const type = Object.keys(FLOWER_TYPE_TO_SEED).find(t => f.name.includes(t));
    const ms = FLOWER_SEED_MS[FLOWER_TYPE_TO_SEED[type]] ?? 24 * H;
    push('flowers', f.name, nodeReadyAt(f, 'plantedAt', ms), id, f.name, f.plantedAt);
  }

  for (const [id, tree] of Object.entries(farm.trees ?? {})) {
    if (!placed(tree)) continue;
    push('trees', 'Wood', nodeReadyAt(tree.wood, 'choppedAt', RESOURCE_MS.trees), id, 'Wood', tree.wood?.choppedAt);
  }

  const rocks = [['stones', 'Stone'], ['iron', 'Iron'], ['gold', 'Gold'], ['crimstones', 'Crimstone'], ['sunstones', 'Sunstone']];
  for (const [field, name] of rocks) {
    for (const [id, rock] of Object.entries(farm[field] ?? {})) {
      if (!placed(rock)) continue;
      push(field, name, nodeReadyAt(rock.stone, 'minedAt', RESOURCE_MS[field]), id, name, rock.stone?.minedAt);
    }
  }

  for (const [id, reserve] of Object.entries(farm.oilReserves ?? {})) {
    if (!placed(reserve)) continue;
    push('oilReserves', 'Oil', nodeReadyAt(reserve.oil, 'drilledAt', RESOURCE_MS.oilReserves), id, 'Oil', reserve.oil?.drilledAt);
  }

  for (const [id, node] of Object.entries(farm.saltFarm?.nodes ?? {})) {
    const s = node?.salt;
    if (!s?.nextChargeAt || s.storedCharges > 0) continue;
    push('salt', 'Salt', s.nextChargeAt, id, 'Salt', s.claimedAt);
  }

  const animals = [...Object.values(farm.henHouse?.animals ?? {}), ...Object.values(farm.barn?.animals ?? {})];
  for (const a of animals) {
    if (!a?.type || !a.awakeAt) continue;
    push('animals', a.type, a.awakeAt, a.id, a.type, a.asleepAt);
  }

  for (const [id, hive] of Object.entries(farm.beehives ?? {})) {
    if (!placed(hive) || !hive.flowers?.length) continue;
    // Mel acumula pela taxa das flores ligadas; avisamos quando a colmeia enche.
    const rate = hive.flowers.reduce((sum, f) => sum + (f.rate ?? 1), 0) || 1;
    const produced = hive.honey?.produced ?? 0;
    const remaining = Math.max(0, BEEHIVE_FULL_MS - produced);
    const readyAt = (hive.honey?.updatedAt ?? now) + remaining / rate;
    push('beehives', 'Honey', readyAt, id, 'Honey', hive.honey?.updatedAt);
  }

  for (const [name, list] of Object.entries(farm.buildings ?? {})) {
    for (const b of list ?? []) {
      if (b?.producing?.readyAt) {
        const item = Object.keys(b.producing.items ?? {})[0] ?? name;
        push('composters', item, b.producing.readyAt, b.id, item, b.producing.startedAt);
      }
      const crafting = Array.isArray(b?.crafting) ? b.crafting : b?.crafting ? [b.crafting] : [];
      crafting.forEach((c, i) => c?.readyAt && push('cooking', c.name, c.readyAt, `${b.id}-${i}-${c.name}`));
    }
  }

  const machine = farm.buildings?.['Crop Machine']?.[0];
  for (const q of machine?.queue ?? []) {
    if (q?.readyAt) push('cropMachine', q.crop, q.readyAt, `${q.crop}-${q.startTime ?? q.readyAt}`);
  }

  for (const [rack, list] of Object.entries(farm.agingShed?.racks ?? {})) {
    for (const r of list ?? []) push('agingShed', r.recipe, r.readyAt, `${rack}-${r.id}`, r.recipe, r.startedAt);
  }

  for (const q of farm.craftingBox?.queue ?? []) {
    if (q?.readyAt) push('craftingBox', q.name ?? q.item, q.readyAt, `${q.name ?? q.item}-${q.readyAt}`);
  }
  if (farm.craftingBox?.status === 'crafting' && farm.craftingBox.readyAt) {
    push('craftingBox', farm.craftingBox.item?.collectible ?? farm.craftingBox.item?.wearable ?? 'Crafting Box', farm.craftingBox.readyAt, 'box');
  }

  const chestAt = farm.dailyRewards?.chest?.collectedAt;
  if (chestAt) {
    const next = new Date(chestAt);
    next.setUTCHours(24, 0, 0, 0);
    push('daily', 'Treasure Key', next.getTime(), 'chest', 'Treasure Key', chestAt);
  }

  return out.sort((a, b) => a.readyAt - b.readyAt);
}

/** Agrupa timers da mesma categoria/item que ficam prontos com até 60s de diferença. */
export function groupTimers(timers, windowMs = 60_000) {
  const groups = [];
  for (const t of timers) {
    const g = groups.find(x => x.category === t.category && x.name === t.name && Math.abs(x.readyAt - t.readyAt) <= windowMs);
    if (g) {
      g.count += 1;
      g.keys.push(t.key);
      g.readyAt = Math.max(g.readyAt, t.readyAt);
    } else {
      groups.push({ ...t, keys: [t.key] });
    }
  }
  return groups.sort((a, b) => a.readyAt - b.readyAt);
}

/** Preferências: { enabled, categories: {id: bool}, items: {"cat:Nome": bool} } */
export function isWanted(prefs, category, name) {
  if (!prefs || prefs.enabled === false) return false;
  const item = prefs.items?.[`${category}:${name}`];
  if (item !== undefined) return item;
  return prefs.categories?.[category] !== false;
}

export function defaultPrefs() {
  return { enabled: true, categories: Object.fromEntries(CATEGORIES.map(c => [c.id, true])), items: {} };
}

export const categoryLabel = (id, lang = 'pt') => (lang === 'en' ? CATEGORY_BY_ID[id]?.en : CATEGORY_BY_ID[id]?.label) ?? id;

export function notificationText(group, lang = 'pt') {
  const label = categoryLabel(group.category, lang);
  const n = group.count;
  if (lang === 'en') {
    if (group.category === 'daily') return { title: 'Daily chest unlocked!', body: 'Open it before the day resets.' };
    if (group.category === 'animals') return { title: `${group.name} is awake!`, body: `${n} ${n > 1 ? 'animals are' : 'animal is'} ready · ${label}` };
    return { title: `${group.name} ready!`, body: `${n} ready to collect · ${label}` };
  }
  if (group.category === 'daily') return { title: 'Baú diário liberado!', body: 'Abra antes de virar o dia.' };
  if (group.category === 'animals') return { title: `${group.name} acordou!`, body: `${n} ${n > 1 ? 'animais prontos' : 'animal pronto'} · ${label}` };
  return { title: `${group.name} pronto!`, body: `${n} ${n > 1 ? 'prontos' : 'pronto'} para coletar · ${label}` };
}

/** Uma notificação por item: um aviso novo de "Wood" substitui o anterior em vez de empilhar. */
export const displayTag = g => `${g.category}:${g.name}`;
