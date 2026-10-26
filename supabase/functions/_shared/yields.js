// Quantidade estimada que cada canteiro/árvore frutífera vai render, para o aviso dizer
// "68 Corn" em vez de "49 canteiros". O jogo só sorteia o valor final na colheita, então
// aqui entram só os boosts fixos de getCropYieldAmount/getFruitYield (código oficial,
// events/landExpansion/harvest.ts e fruitHarvested.ts). Ficam de fora as chances de crítico,
// os boosts por área (Scary Mike, Laurie, Queen Cornelia…) e os buds.

const MIN = 60_000;
const H = 60 * MIN;

const QUIVERS = { bumpkins: 'Bumpkin Quiver', goblins: 'Goblin Quiver', nightshades: 'Nightshade Quiver', sunflorians: 'Sunflorian Quiver' };
const FULL_MOON_FRUITS = new Set(['Celestine', 'Lunara', 'Duskberry']);

const rank = (farm, name, values) => {
  const level = Math.floor(Number(farm?.bumpkin?.skills?.[name] ?? 0));
  return level > 0 ? values[Math.min(level, values.length) - 1] : 0;
};

export function yieldContext(farm, now = Date.now()) {
  const equipped = new Set([
    ...Object.values(farm?.bumpkin?.equipped ?? {}),
    ...Object.values(farm?.farmHands?.bumpkins ?? {}).flatMap(b => Object.values(b?.equipped ?? {})),
  ]);
  const places = [farm?.collectibles, farm?.home?.collectibles, farm?.interior?.ground?.collectibles, farm?.interior?.level_one?.collectibles];
  const isReady = p => (p?.readyAt ?? 0) <= now && !!p?.coordinates && !p?.used;
  const built = name => places.some(c => c?.[name]?.some?.(isReady)) || !!farm?.petHouse?.pets?.[name]?.some?.(isReady);
  return {
    farm,
    wear: name => equipped.has(name),
    built,
    quiver: equipped.has(QUIVERS[farm?.faction?.name]),
    coder: Number(farm?.inventory?.Coder ?? 0) >= 1,
  };
}

/** Rendimento estimado de uma colheita de plantação. `growMs` é o tempo base, para saber o porte. */
export function cropYield(ctx, name, plot, growMs) {
  const { farm, wear, built } = ctx;
  const basic = growMs > 0 && growMs <= 30 * MIN;
  const advanced = growMs >= 16 * H;
  const medium = growMs > 0 && !basic && !advanced;

  let amount = 1;
  if (name === 'Cauliflower' && built('Golden Cauliflower')) amount *= 2;
  if (name === 'Carrot' && built('Easter Bunny')) amount *= 1.2;
  if (name === 'Pumpkin' && built('Victoria Sisters')) amount *= 1.2;
  if (name === 'Parsnip' && wear('Parsnip')) amount *= 1.2;
  if (name === 'Beetroot' && wear('Beetroot Amulet')) amount *= 1.2;
  if (name === 'Sunflower' && wear('Sunflower Amulet')) amount *= 1.1;
  if (built('Scarecrow') || built('Kuebiko')) amount *= 1.2;
  if (ctx.coder) amount *= 1.2;

  if (name === 'Cabbage') {
    if (built('Cabbage Boy')) amount += built('Cabbage Girl') ? 0.5 : 0.25;
    else if (built('Karkinos')) amount += 0.1;
  }
  const flat = {
    Carrot: [['Pablo The Bunny', 0.1], ['Lab Grown Carrot', 0.2]],
    Kale: [['Foliant', 0.2], ['Giant Kale', 2]],
    Eggplant: [['Purple Trail', 0.2], ['Maximus', 1]],
    Artichoke: [['Giant Artichoke', 2]],
    Yam: [['Giant Yam', 0.5]],
    Barley: [['Sheaf of Plenty', 2]],
    Corn: [['Poppy', 0.1]],
    Pumpkin: [['Freya Fox', 0.5], ['Lab Grown Pumpkin', 0.3]],
    Radish: [['Lab Grown Radish', 0.4]],
    Soybean: [['Soybliss', 1]],
    Onion: [['Giant Onion', 3]],
  };
  for (const [item, v] of flat[name] ?? []) if (built(item)) amount += v;
  const worn = { Eggplant: [['Eggplant Onesie', 0.1]], Soybean: [['Tofu Mask', 0.1]], Corn: [['Corn Onesie', 0.1], ['Corn Silk Hair', 2]], Wheat: [['Sickle', 2]] };
  for (const [item, v] of worn[name] ?? []) if (wear(item)) amount += v;

  const fertiliser = plot?.fertiliser?.name;
  if (fertiliser === 'Sprout Mix' || fertiliser === 'Sproutroot Surprise') amount += built('Knowledge Crab') ? 0.4 : 0.2;
  if (wear('Infernal Pitchfork')) amount += 3;
  if (ctx.quiver) amount += 0.25;
  if (growMs >= 24 * H && built('Hoot')) amount += 0.5;
  if (plot?.beeSwarm?.count) amount += plot.beeSwarm.count * (0.2 + rank(farm, 'Pollen Power Up', [0.1, 0.15, 0.2]));

  if (basic) amount += rank(farm, 'Young Farmer', [0.1, 0.125, 0.15]);
  if (medium) amount += rank(farm, 'Experienced Farmer', [0.1, 0.125, 0.15]);
  if (advanced) amount += rank(farm, 'Old Farmer', [0.1, 0.125, 0.15]);
  const acreUp = rank(farm, 'Acre Farm', [1, 1.4, 1.8]);
  const acreDown = rank(farm, 'Acre Farm', [0.5, 0.6, 0.7]);
  if (advanced) amount += acreUp; else if (growMs > 0) amount -= acreDown;
  const hectareUp = rank(farm, 'Hectare Farm', [1, 1.4, 1.8]);
  const hectareDown = rank(farm, 'Hectare Farm', [0.5, 0.6, 0.7]);
  if (advanced) amount -= hectareDown; else if (growMs > 0) amount += hectareUp;

  return Math.max(0, Math.round(amount * 100) / 100);
}

/** Rendimento estimado de uma colheita de árvore frutífera. */
export function fruitYield(ctx, name, patch) {
  const { farm, wear, built } = ctx;
  let amount = 1;
  if (name === 'Apple' && built('Lady Bug')) amount += 0.25;
  if (name === 'Blueberry' && built('Black Bearry')) amount += 1;
  if (FULL_MOON_FRUITS.has(name) && wear('Moon Hair')) amount += 0.5;
  if (built('Macaw')) amount += rank(farm, 'Loyal Macaw', [0.2, 0.25, 0.3]) || 0.1;
  if (wear('Camel Onesie')) amount += 0.1;
  if (['Apple', 'Orange', 'Blueberry', 'Banana'].includes(name) && wear('Fruit Picker Apron')) amount += 0.1;
  amount += rank(farm, 'Fruitful Fumble', [0.1, 0.15, 0.2]);
  if (ctx.quiver) amount += 0.25;
  const fertiliser = patch?.fertiliser?.name;
  if (fertiliser === 'Fruitful Blend' || fertiliser === 'Turbofruit Mix') amount += 0.1;
  if (name === 'Banana' && wear('Banana Amulet')) amount += 0.5;
  if (name === 'Banana' && built('Banana Chicken')) amount += 0.1;
  if (name === 'Lemon' && built('Lemon Shark')) amount += 0.2;
  if (name === 'Lemon' && wear('Lemon Shield')) amount += 1;
  if (name === 'Lemon' && built('Reveling Lemon')) amount += 0.25;
  if (name === 'Tomato' && built('Tomato Bombard')) amount += 1;
  if (name === 'Tomato' || name === 'Lemon') amount += rank(farm, 'Zesty Vibes', [1, 1.5, 2]);
  else amount -= rank(farm, 'Zesty Vibes', [0.25, 0.4, 0.5]);
  return Math.max(0, Math.round(amount * 100) / 100);
}
