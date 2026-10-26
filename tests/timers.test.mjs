import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractTimers, groupTimers, isWanted, defaultPrefs, notificationText, CROP_MS } from '../supabase/functions/_shared/farm-timers.js';
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

test('porcos entram nos animais e o carinho libera em 1/3 do sono', () => {
  const now = 1_000_000;
  const timers = extractTimers({
    pigpen: { animals: { p: { id: 'p', type: 'Pig', asleepAt: now - 1000, awakeAt: now + 2000, lovedAt: 0, item: 'Brush' } } },
  }, now);
  const awake = timers.find(t => t.category === 'animals');
  const love = timers.find(t => t.category === 'animalLove');
  assert.equal(awake.name, 'Pig');
  assert.equal(love.readyAt, now - 1000 + 1000);
  assert.equal(love.meta.item, 'Brush');
});

test('rendimento estimado soma boosts fixos e aparece no grupo', () => {
  const farm = {
    bumpkin: { equipped: { hair: 'Corn Silk Hair' }, skills: {} },
    crops: {
      a: { x: 0, createdAt: 1, crop: { name: 'Corn', plantedAt: 1000 } },
      b: { x: 1, createdAt: 1, crop: { name: 'Corn', plantedAt: 1000 }, beeSwarm: { count: 1 } },
    },
  };
  const [g] = groupTimers(extractTimers(farm));
  assert.equal(g.count, 2);
  assert.equal(g.amount, 3 + 3.2);
});

test('venda no mercado vira aviso com o FLOWER recebido', () => {
  const timers = extractTimers({ trades: { listings: { l: { items: { Barley: 33 }, sfl: 0.82, tax: 0.0615, createdAt: 1, fulfilledAt: 5000 } } } });
  const [sale] = timers;
  assert.equal(sale.category, 'sales');
  assert.equal(sale.amount, 33);
  assert.equal(sale.meta.flower, 0.7585);
  const text = notificationText(groupTimers(timers)[0], 'pt');
  assert.match(text.title, /Vendeu 33 Barley/);
  assert.match(text.body, /0,7585 FLOWER/);
});

test('Floating Island avisa na abertura com a hora de fechar', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const startAt = Date.parse('2026-10-26T15:40:00Z');
  const timers = extractTimers({ floatingIsland: { schedule: [{ startAt, endAt: startAt + 30 * 60_000 }, { startAt: 1, endAt: 2 }] } }, now);
  assert.equal(timers.length, 1);
  const text = notificationText(groupTimers(timers)[0], 'en', 'UTC');
  assert.equal(text.title, 'Floating Island is live!');
  assert.match(text.body, /04:10 PM/);
});
