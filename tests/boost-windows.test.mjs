import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReadyAt, farmWindows } from '../supabase/functions/_shared/boost-windows.js';
import { extractTimers } from '../supabase/functions/_shared/farm-timers.js';

const H = 3600_000;
const T0 = Date.UTC(2026, 10, 10, 12);

test('sem boost: pronto = início + trabalho', () => {
  assert.equal(computeReadyAt(T0, 4 * H, []), T0 + 4 * H);
});

test('Power Hour (2×) por 1 h adianta 1 h', () => {
  const farm = { buffs: { 'Power hour': { startedAt: T0, durationMS: H } } };
  assert.equal(computeReadyAt(T0, 4 * H, farmWindows(farm).crops), T0 + 3 * H);
});

test('boosts ao mesmo tempo multiplicam; o mesmo boost duas vezes não', () => {
  // Totem (2×) e Sparrow Shrine (1,35×) juntos: 2,7×.
  const farm = { collectibles: {
    'Super Totem': [{ createdAt: T0, coordinates: { x: 0, y: 0 } }],
    'Sparrow Shrine': [{ createdAt: T0, coordinates: { x: 1, y: 0 } }],
  } };
  assert.equal(Math.round(computeReadyAt(T0, 27 * H, farmWindows(farm).crops)), T0 + 10 * H);
  // Super Totem e Time Warp Totem são o mesmo boost: continuam 2×.
  const totems = { collectibles: {
    'Super Totem': [{ createdAt: T0, coordinates: { x: 0, y: 0 } }],
    'Time Warp Totem': [{ createdAt: T0, coordinates: { x: 1, y: 0 } }],
  } };
  assert.equal(computeReadyAt(T0, 2 * H, farmWindows(totems).crops), T0 + H);
});

test('Sunshower vale até a meia-noite UTC e o fertilizante vale até a colheita', () => {
  const start = Date.UTC(2026, 10, 10, 20);
  const farm = {
    calendar: { sunshower: { startedAt: start } },
    crops: { a: { x: 0, crop: { name: 'Corn', plantedAt: start, baseDurationMs: 8 * H } } },
  };
  // 4 h a 2× (até a meia-noite) = 8 h de trabalho: pronto à meia-noite.
  assert.equal(extractTimers(farm, start)[0].readyAt, Date.UTC(2026, 10, 11));
  farm.crops.a.fertiliser = { name: 'Rapid Root', fertilisedAt: start };
  // Fertilizante 2× × Sunshower 2× = 4× até a meia-noite: 8 h de trabalho em 2 h.
  assert.equal(extractTimers(farm, start)[0].readyAt, start + 2 * H);
});

test('boost guardado no histórico do jogo continua valendo depois de retirado', () => {
  const farm = { boostHistory: { 'Blossom Hourglass': [{ from: T0, to: T0 + 2 * H }] } };
  assert.equal(Math.round(computeReadyAt(T0, 10 * H, farmWindows(farm).flowers)), T0 + 9.3 * H);
});

test('animal no modelo novo acorda antes com a shrine da espécie', () => {
  const farm = {
    collectibles: { 'Bantam Shrine': [{ createdAt: T0, coordinates: { x: 0, y: 0 } }] },
    henHouse: { animals: { c: { id: 'c', type: 'Chicken', asleepAt: T0, awakeAt: T0 + 27 * H, baseDurationMs: 27 * H } } },
  };
  const awake = extractTimers(farm, T0).find(t => t.category === 'animals');
  assert.equal(Math.round(awake.readyAt), T0 + 20 * H);
});
