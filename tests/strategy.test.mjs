import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buySignal, calendarEvents, fullMoonPlan, openListing, sellSignal, stockPlan, strategyTimers, targetFor, weekStats } from '../supabase/functions/_shared/strategy.js';
import { groupTimers, notificationText } from '../supabase/functions/_shared/farm-timers.js';

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 18, 12);
// Histórico de 7 dias com o preço estável em 1,0 e as fotos de hora em hora.
const history = (items) => {
  const t = Array.from({ length: 7 * 24 }, (_, i) => NOW - (7 * 24 - i) * H);
  return { t, items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, t.map(() => v)])) };
};

test('sinal de venda só acima da média e com histórico suficiente', () => {
  const stats = weekStats(history({ Corn: 1 }), NOW).Corn;
  assert.equal(sellSignal(1.1, stats).sell, true);
  assert.equal(sellSignal(1.02, stats).sell, false);
  assert.equal(sellSignal(0.9, stats).hold, true);
  assert.equal(sellSignal(1.5, { ...stats, span: 2 * H }).sell, false);
});

test('sinal de compra exige lucro na revenda depois da taxa', () => {
  const stats = weekStats(history({ Corn: 1 }), NOW).Corn;
  assert.equal(buySignal(0.85, stats, 0.075).buy, true); // 0,925/0,85 − 1 ≈ 8,8%
  assert.equal(buySignal(0.9, stats, 0.075).buy, false); // ≈ 2,8%
});

test('meta de lucro usa o preço médio e a taxa', () => {
  const tg = targetFor({ qty: 100, avg: 0.02 }, 0.03, 0.1, 0.1);
  assert.ok(Math.abs(tg.target - 0.02 * 1.1 / 0.9) < 1e-9);
  assert.equal(tg.reached, true);
  assert.ok(Math.abs(tg.profit - (100 * 0.03 * 0.9 - 2)) < 1e-9);
});

test('estoque sugere lote no limite do anúncio', () => {
  const farm = { inventory: { Corn: '2500', Wood: '10' } };
  const rows = stockPlan(farm, { Corn: 0.02, Wood: 0.01 }, {}, 0.1);
  const corn = rows.find(r => r.name === 'Corn');
  assert.equal(corn.lot, 1000);
  assert.equal(corn.lots, 3);
  assert.ok(Math.abs(corn.total - 2500 * 0.02 * 0.9) < 1e-9);
  assert.equal(rows.some(r => r.name === 'Wood'), false); // 0,09 FLOWER não vale o anúncio
});

test('Lua Cheia: até 10 sementes de cada, dentro das moedas, a que mais rende primeiro', () => {
  const farm = { coins: 15000, inventory: { 'Lunara Seed': 4 }, bumpkin: { skills: {} } };
  const plan = fullMoonPlan(farm, { Duskberry: 1, Lunara: 0.5, Celestine: 0.2 }, {}, 0.1);
  assert.deepEqual(plan.buys.map(b => [b.seed, b.qty]), [['Duskberry Seed', 10], ['Lunara Seed', 3]]);
  assert.equal(plan.coins, 12500 + 3 * 750);
});

test('eventos do calendário e avisos com texto', () => {
  const farm = { coins: 0, inventory: {}, calendar: { dates: [{ name: 'fullMoon', date: '2026-11-23' }, { name: 'doubleDelivery', date: '2026-11-17' }, { name: 'doubleDelivery', date: '2026-11-19' }] } };
  assert.deepEqual(calendarEvents(farm, NOW).map(e => e.name), ['doubleDelivery', 'fullMoon']);
  const timers = strategyTimers(farm, null, NOW);
  assert.deepEqual(timers.map(t => t.key), ['calendar:doubleDelivery:2026-11-19', 'calendar:fullMoonEve:2026-11-23', 'calendar:fullMoon:2026-11-23']);
  const text = notificationText(groupTimers(timers)[0], 'pt', 'UTC');
  assert.match(text.title, /Entrega Dupla/);
});

test('não avisa venda de item já anunciado e reconhece o anúncio', () => {
  const farm = { island: { type: 'volcano' }, inventory: { Corn: '3000' }, trades: { listings: { a: { items: { Corn: 1000 }, sfl: 30 } } } };
  assert.ok(openListing(farm, 'Corn'));
  const prices = { at: NOW, p2p: { Corn: 1.2 }, history: history({ Corn: 1 }) };
  assert.equal(strategyTimers(farm, prices, NOW).filter(t => t.category === 'sellSignal').length, 0);
  delete farm.trades;
  const sell = strategyTimers(farm, prices, NOW).filter(t => t.category === 'sellSignal');
  assert.equal(sell.length, 1);
  assert.match(notificationText(groupTimers(sell)[0], 'pt').title, /Hora de vender Corn/);
});
