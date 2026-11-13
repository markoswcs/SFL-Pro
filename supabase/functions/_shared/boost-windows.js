// Janelas de boost do jogo (features/game/lib/boostWindows.ts e collectibleBuilt.ts).
// No modelo novo, cada nó guarda `baseDurationMs` (o "trabalho" que falta, já com os boosts
// permanentes) e a hora pronta sai de quanto esse trabalho anda em cada trecho de tempo:
// 1× normalmente, mais rápido enquanto um boost temporário está ativo (Power Hour, Sunshower,
// totens, shrines, ampulhetas, fertilizantes). Boosts ao mesmo tempo multiplicam.

const H = 3600_000;
const D = 24 * H;
const FAR = Number.MAX_SAFE_INTEGER;

const SPEED = {
  crops: { 'Sparrow Shrine': 1.35, 'Harvest Hourglass': 1.35, totem: 2, 'Power hour': 2, 'Rapid Root': 2, 'Sproutroot Surprise': 2, sunshower: 2 },
  trees: { totem: 2, 'Timber Hourglass': 1.35, 'Badger Shrine': 1.35 },
  mines: { totem: 2, 'Ore Hourglass': 2, 'Badger Shrine': 1.35, 'Mole Shrine': 1.35 },
  fruits: { totem: 2, 'Orchard Hourglass': 1.35, 'Toucan Shrine': 1.35, 'Turbofruit Mix': 1.25 },
  flowers: { 'Blossom Hourglass': 1.35, 'Moth Shrine': 1.35 },
  oil: { 'Stag Shrine': 1.35 },
  animals: { 'Collie Shrine': 1.35, 'Bantam Shrine': 1.35 },
  greenhouse: { totem: 2, 'Harvest Hourglass': 1.35, 'Orchard Hourglass': 1.35, 'Tortoise Shrine': 1.5, 'Greenhouse Glow': 1.25 },
};

// Duração de cada boost temporário no modelo novo (SPEED_BOOST_EXPIRY_COOLDOWNS, senão EXPIRY_COOLDOWNS).
const DURATION = {
  'Time Warp Totem': 4 * H, 'Super Totem': 7 * D,
  'Gourmet Hourglass': 6 * H, 'Harvest Hourglass': 9 * H, 'Timber Hourglass': 4 * H, 'Ore Hourglass': 5 * H,
  'Orchard Hourglass': 8 * H, 'Blossom Hourglass': 12 * H, "Fisher's Hourglass": 4 * H,
  'Legendary Shrine': 1 * D, 'Obsidian Shrine': 14 * D, 'Trading Shrine': 30 * D,
};
const PET_SHRINE_MS = 7 * D; // todas as demais shrines de pet duram 7 dias

const ANIMAL_SHRINE = { Chicken: 'Bantam Shrine', Cow: 'Collie Shrine', Sheep: 'Collie Shrine' };

function mergeWindows(windows) {
  if (windows.length <= 1) return windows;
  const sorted = [...windows].sort((a, b) => a.from - b.from);
  const merged = [{ ...sorted[0] }];
  for (const w of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    // Só funde janelas de mesma velocidade; velocidades diferentes multiplicam na sobreposição.
    if (w.speed === last.speed && w.from <= last.to) last.to = Math.max(last.to, w.to);
    else merged.push({ ...w });
  }
  return merged;
}

const placements = (farm, name) => [
  farm?.collectibles?.[name], farm?.home?.collectibles?.[name],
  farm?.interior?.ground?.collectibles?.[name], farm?.interior?.level_one?.collectibles?.[name],
].flatMap(list => list ?? []);

/** Janelas de um boost temporário: cada colocação ativa + o histórico guardado pelo jogo. */
function boostWindows(farm, name, speed) {
  const duration = DURATION[name] ?? PET_SHRINE_MS;
  const live = placements(farm, name)
    .filter(p => p?.createdAt !== undefined)
    .map(p => {
      const expiry = p.createdAt + duration + (p.extendedMs ?? 0);
      return { from: p.createdAt, to: p.removedAt !== undefined ? Math.min(expiry, p.removedAt) : expiry, speed };
    });
  const history = (farm?.boostHistory?.[name] ?? []).map(w => ({ from: w.from, to: w.to, speed }));
  return mergeWindows([...live, ...history].filter(w => w.to > w.from));
}

/** Super Totem e Time Warp Totem são o mesmo boost: as janelas se juntam em vez de multiplicar. */
const totemWindows = (farm, speed) => mergeWindows([...boostWindows(farm, 'Super Totem', speed), ...boostWindows(farm, 'Time Warp Totem', speed)]);

function powerHourWindows(farm) {
  const speed = SPEED.crops['Power hour'];
  const buff = farm?.buffs?.['Power hour'];
  const live = buff?.startedAt === undefined ? [] : [{ from: buff.startedAt, to: buff.startedAt + (buff.durationMS ?? H), speed }];
  const history = (farm?.boostHistory?.['Power hour'] ?? []).filter(w => w.from !== buff?.startedAt).map(w => ({ from: w.from, to: w.to, speed }));
  return mergeWindows([...live, ...history].filter(w => w.to > w.from));
}

/** Sunshower dura do início até a meia-noite UTC do mesmo dia. */
function sunshowerWindows(farm) {
  const speed = SPEED.crops.sunshower;
  const history = (farm?.boostHistory?.Sunshower ?? []).map(w => ({ from: w.from, to: w.to, speed }));
  const startedAt = farm?.calendar?.sunshower?.startedAt;
  if (startedAt === undefined || history.some(w => w.from === startedAt)) return history;
  const day = new Date(startedAt);
  return [{ from: startedAt, to: Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1), speed }, ...history];
}

/** Janela aberta de um fertilizante de velocidade aplicado ao nó (vale até a colheita). */
const fertiliserWindow = (fertiliser, names, table) => (fertiliser?.fertilisedAt !== undefined && names.includes(fertiliser.name)
  ? [{ from: fertiliser.fertilisedAt, to: FAR, speed: table[fertiliser.name] }] : []);

/** Janelas que valem para cada tipo de nó. Calculadas uma vez por leitura da fazenda. */
export function farmWindows(farm) {
  const w = (name, table) => boostWindows(farm, name, table[name]);
  return {
    crops: [...w('Sparrow Shrine', SPEED.crops), ...w('Harvest Hourglass', SPEED.crops), ...totemWindows(farm, SPEED.crops.totem), ...powerHourWindows(farm), ...sunshowerWindows(farm)],
    trees: [...totemWindows(farm, SPEED.trees.totem), ...w('Timber Hourglass', SPEED.trees), ...w('Badger Shrine', SPEED.trees)],
    stones: [...totemWindows(farm, SPEED.mines.totem), ...w('Ore Hourglass', SPEED.mines), ...w('Badger Shrine', SPEED.mines)],
    iron: [...totemWindows(farm, SPEED.mines.totem), ...w('Ore Hourglass', SPEED.mines), ...w('Mole Shrine', SPEED.mines)],
    gold: [...totemWindows(farm, SPEED.mines.totem), ...w('Ore Hourglass', SPEED.mines), ...w('Mole Shrine', SPEED.mines)],
    crimstones: w('Mole Shrine', SPEED.mines),
    sunstones: [],
    fruits: [...totemWindows(farm, SPEED.fruits.totem), ...w('Orchard Hourglass', SPEED.fruits), ...w('Toucan Shrine', SPEED.fruits)],
    flowers: [...w('Blossom Hourglass', SPEED.flowers), ...w('Moth Shrine', SPEED.flowers)],
    oilReserves: w('Stag Shrine', SPEED.oil),
    animals: Object.fromEntries(Object.entries(ANIMAL_SHRINE).map(([type, shrine]) => [type, w(shrine, SPEED.animals)])),
    greenhouse: {
      shared: [...totemWindows(farm, SPEED.greenhouse.totem), ...w('Tortoise Shrine', SPEED.greenhouse)],
      crops: w('Harvest Hourglass', SPEED.greenhouse),
      fruits: w('Orchard Hourglass', SPEED.greenhouse),
    },
  };
}

export const cropFertiliserWindows = fertiliser => fertiliserWindow(fertiliser, ['Rapid Root', 'Sproutroot Surprise'], SPEED.crops);
export const fruitFertiliserWindows = fertiliser => fertiliserWindow(fertiliser, ['Turbofruit Mix'], SPEED.fruits);
export const greenhouseFertiliserWindows = fertiliser => fertiliserWindow(fertiliser, ['Greenhouse Glow'], SPEED.greenhouse);

/** Trechos contínuos desde o início, cada um com a velocidade (produto das janelas que o cobrem). */
function buildSegments(startedAt, windows) {
  const clipped = windows.map(w => ({ from: Math.max(w.from, startedAt), to: w.to, speed: w.speed })).filter(w => w.to > w.from);
  if (!clipped.length) return [];
  const edges = [...new Set([startedAt, ...clipped.flatMap(w => [w.from, w.to])])].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const mid = (edges[i] + edges[i + 1]) / 2;
    const speed = clipped.reduce((acc, w) => (w.from <= mid && mid < w.to ? acc * w.speed : acc), 1);
    segments.push({ from: edges[i], to: edges[i + 1], speed });
  }
  return segments;
}

/** Instante em que o trabalho acumulado chega a `baseDurationMs` (computeReadyAt do jogo). */
export function computeReadyAt(startedAt, baseDurationMs, windows = []) {
  if (!(baseDurationMs > 0)) return startedAt;
  const segments = buildSegments(startedAt, windows);
  let done = 0;
  for (const s of segments) {
    const work = (s.to - s.from) * s.speed;
    if (done + work >= baseDurationMs) return s.from + (baseDurationMs - done) / s.speed;
    done += work;
  }
  const tail = segments.length ? segments[segments.length - 1].to : startedAt;
  return tail + (baseDurationMs - done);
}
