import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemStats, purchaseMath, resourceTax, signals, taxFor } from '../src/lib/market.js';

const H = 3600_000;

test('taxa de recursos: ilha, VIP pela metade e Trading Shrine', () => {
  const now = Date.now();
  assert.equal(resourceTax({ island: { type: 'basic' } }, null, now).rate, 1);
  assert.equal(resourceTax({ island: { type: 'desert' } }, null, now).rate, 0.25);
  const vip = { island: { type: 'volcano' }, vip: { expiresAt: now + 86400_000 } };
  assert.equal(resourceTax(vip, null, now).rate, 0.075);
  const shrine = { ...vip, collectibles: { 'Trading Shrine': [{ createdAt: now - H, coordinates: { x: 0, y: 0 } }] } };
  assert.equal(resourceTax(shrine, null, now).rate, 0.05);
});

test('NFTs pagam 10%, recursos pagam a taxa da ilha', () => {
  const tax = { rate: 0.075 };
  assert.equal(taxFor('Wheat', tax), 0.075);
  assert.equal(taxFor('Mermaid Cow', tax), 0.1);
});

test('variação de 24 h e média de 7 dias a partir do histórico', () => {
  const now = 10 * 86400_000;
  const history = { t: [now - 48 * H, now - 24 * H, now - 12 * H], items: { Wheat: [1, 1, 1.5] } };
  const s = itemStats(history, 'Wheat', 2, now);
  assert.equal(s.change24, 1);
  assert.ok(Math.abs(s.avg7 - (1 + 1 + 1.5 + 2) / 4) < 1e-9);
  const sig = signals(s, 0.075);
  assert.ok(sig.sell > 0);
  assert.equal(sig.flip, null);
});

test('sem histórico suficiente não há sinal', () => {
  const now = Date.now();
  const s = itemStats({ t: [now - H], items: { Corn: [1] } }, 'Corn', 0.5, now);
  assert.deepEqual(signals(s, 0.075), { sell: null, flip: null });
});

test('compra: preço para não perder e para lucrar já com a taxa', () => {
  const m = purchaseMath({ qty: 100, unit: 0.02 }, 0.03, 0.1, 0.1);
  assert.ok(Math.abs(m.breakEven - 0.02 / 0.9) < 1e-12);
  assert.ok(Math.abs(m.target - (0.02 * 1.1) / 0.9) < 1e-12);
  assert.ok(Math.abs(m.netNow - 100 * 0.03 * 0.9) < 1e-12);
  assert.ok(Math.abs(m.change - 0.5) < 1e-12);
});
