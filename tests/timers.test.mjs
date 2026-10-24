import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractTimers, groupTimers, isWanted, defaultPrefs, CROP_MS } from '../supabase/functions/_shared/farm-timers.js';
import { itemImage } from '../supabase/functions/_shared/item-image.js';

const farm = JSON.parse(readFileSync(new URL('../fixtures/farm.json', import.meta.url))).farm;

test('extrai timers de várias categorias da fazenda de exemplo', () => {
  const timers = extractTimers(farm);
  const cats = new Set(timers.map(t => t.category));
  for (const c of ['crops', 'trees', 'stones', 'fruits', 'animals', 'composters', 'daily']) assert.ok(cats.has(c), c);
  assert.ok(timers.every(t => Number.isFinite(t.readyAt) && t.key.startsWith(t.category + ':')));
});

test('ignora nós removidos do mapa', () => {
  const timers = extractTimers({ iron: { a: { stone: { minedAt: 1 }, removedAt: 2 } } });
  assert.equal(timers.length, 0);
});

test('modelo antigo: pronto = plantio + tempo base', () => {
  const [t] = extractTimers({ crops: { p: { createdAt: 1, x: 0, crop: { name: 'Carrot', plantedAt: 1000 } } } });
  assert.equal(t.readyAt, 1000 + CROP_MS.Carrot);
});

test('modelo novo: usa baseDurationMs do nó', () => {
  const [t] = extractTimers({ crops: { p: { createdAt: 1, x: 0, crop: { name: 'Carrot', plantedAt: 1000, baseDurationMs: 500 } } } });
  assert.equal(t.readyAt, 1500);
});

test('agrupa itens iguais prontos no mesmo minuto', () => {
  const g = groupTimers([
    { key: 'crops:a', category: 'crops', name: 'Wheat', readyAt: 1000, count: 1 },
    { key: 'crops:b', category: 'crops', name: 'Wheat', readyAt: 30_000, count: 1 },
    { key: 'crops:c', category: 'crops', name: 'Wheat', readyAt: 500_000, count: 1 },
  ]);
  assert.deepEqual(g.map(x => x.count), [2, 1]);
});

test('preferências: item desligado vence categoria ligada', () => {
  const prefs = defaultPrefs();
  prefs.items['crops:Wheat'] = false;
  assert.equal(isWanted(prefs, 'crops', 'Wheat'), false);
  assert.equal(isWanted(prefs, 'crops', 'Carrot'), true);
  prefs.categories.trees = false;
  assert.equal(isWanted(prefs, 'trees', 'Wood'), false);
  assert.equal(isWanted({ ...prefs, enabled: false }, 'crops', 'Carrot'), false);
});

test('imagens: arte oficial quando existe, sfl.world como reserva', () => {
  assert.match(itemImage('Lemon Cheesecake'), /raw\.githubusercontent\.com\/sunflower-land/);
  assert.match(itemImage('Wheat'), /sfl\.world\/img\/source\/Wheat\.png/);
  assert.match(itemImage('Cow'), /Milk/);
});
