// Mutantes de cada capítulo do jogo (features/game/types/chapterMutants.ts e chapters.ts).
// Durante o capítulo, coletar dos animais, colher flores e pescar tem chance de dar o mutante dele.
export const CHAPTERS = [
  { name: "Pharaoh's Treasure", start: '2024-08-01', end: '2024-11-01', Chicken: 'Pharaoh Chicken', Flower: 'Desert Rose', Fish: ['Lemon Shark'] },
  { name: 'Bull Run', start: '2024-11-01', end: '2025-02-03', Chicken: 'Alien Chicken', Cow: 'Mootant', Sheep: 'Toxic Tuft', Flower: 'Chicory', Fish: ['Longhorn Cowfish'] },
  { name: 'Winds of Change', start: '2025-02-03', end: '2025-05-01', Chicken: 'Summer Chicken', Cow: 'Frozen Cow', Sheep: 'Frozen Sheep', Flower: 'Chamomile', Fish: ['Jellyfish'] },
  { name: 'Great Bloom', start: '2025-05-01', end: '2025-08-04', Chicken: 'Love Chicken', Cow: 'Dr Cow', Sheep: 'Nurse Sheep', Flower: 'Lunalist', Fish: ['Pink Dolphin'] },
  { name: 'Better Together', start: '2025-08-04', end: '2025-11-03', Chicken: 'Janitor Chicken', Cow: 'Baby Cow', Sheep: 'Baby Sheep', Flower: 'Venus Bumpkin Trap', Fish: ['Poseidon'] },
  { name: 'Paw Prints', start: '2025-11-03', end: '2026-02-02', Chicken: 'Sleepy Chicken', Cow: 'Astronaut Cow', Sheep: 'Astronaut Sheep', Flower: 'Black Hole Flower', Fish: ['Super Star'] },
  { name: 'Crabs and Traps', start: '2026-02-02', end: '2026-05-04', Chicken: 'Squid Chicken', Cow: 'Mermaid Cow', Sheep: 'Mermaid Sheep', Flower: 'Anemone Flower', Fish: ['Giant Isopod', 'Nautilus', 'Dollocaris'] },
  { name: 'Salt Awakening', start: '2026-05-04', end: '2026-08-03', Chicken: 'Flamingo Chicken', Cow: 'Spa Cow', Sheep: 'Spa Sheep', Flower: 'Salt Crystal Flower', Fish: ['Deep Sea Pig', 'Deep Sea Slug', 'Crystal Shrimp'] },
  { name: 'Ascension Age', start: '2026-08-03', end: '2026-11-02', Chicken: 'Ascended Chicken', Cow: 'Ascended Cow', Sheep: 'Ascended Sheep', Flower: 'Ruins Flower', Fish: ['Crocodile', 'Dumbo Octopus', 'Seahorse Dad'] },
  { name: 'Cave Dwellers', start: '2026-11-02', end: '2027-02-01', Chicken: 'Mushroom Chicken', Cow: 'Ladybug Cow', Sheep: 'Beetle Sheep', Flower: 'Cyclops Bloom', Fish: ['Manatee', 'Betta', 'Macropinna'] },
].map(c => ({ ...c, startAt: Date.parse(`${c.start}T00:00:00Z`), endAt: Date.parse(`${c.end}T00:00:00Z`) }));

export const SOURCES = ['Chicken', 'Cow', 'Sheep', 'Flower', 'Fish'];

/** Lista os mutantes de um capítulo: { source, name, owned }. */
export function chapterMutants(chapter, farm) {
  const has = name => Number(farm?.inventory?.[name] ?? 0) > 0;
  return SOURCES.flatMap(source => [].concat(chapter[source] ?? []).map(name => ({ source, name, owned: has(name) })));
}

/** Capítulo atual, o próximo e o total de mutantes já conseguidos. */
export function mutantInfo(farm, now = Date.now()) {
  const i = CHAPTERS.findIndex(c => now >= c.startAt && now < c.endAt);
  const current = i >= 0 ? CHAPTERS[i] : null;
  const next = CHAPTERS.find(c => c.startAt > now) ?? null;
  const all = CHAPTERS.flatMap(c => chapterMutants(c, farm));
  return { current, next, owned: all.filter(m => m.owned).length, total: all.length };
}
