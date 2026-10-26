import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPositions, itemStats, positionMath, resourceTax, signals, taxFor, usdAt } from '../src/lib/market.js';

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

test('posição: preço médio e cotação média ponderados pelo custo', () => {
  const [p] = buildPositions([
    { id: 'a', item: 'Wheat', qty: 100, sfl: 1, at: 1, usd: 0.02 },
    { id: 'b', item: 'Wheat', qty: 100, sfl: 3, at: 2, usd: 0.01 },
  ]);
  assert.equal(p.qty, 200);
  assert.equal(p.avgUnit, 0.02);
  assert.ok(Math.abs(p.avgUsd - (1 * 0.02 + 3 * 0.01) / 4) < 1e-12);
  const [o] = buildPositions([{ id: 'a', item: 'Wheat', qty: 100, sfl: 1, at: 1 }], { Wheat: { avgUnit: 0.05, avgUsd: 0.03 } });
  assert.equal(o.avgUnit, 0.05);
  assert.equal(o.avgUsd, 0.03);
  assert.equal(o.edited, true);
});

test('lucro em FLOWER pode ser prejuízo em dólar quando o FLOWER cai', () => {
  // Comprou a 0,02 FLOWER com FLOWER a US$ 0,02; hoje vale 0,025 mas o FLOWER caiu para US$ 0,01.
  const m = positionMath({ qty: 100, avgUnit: 0.02, avgUsd: 0.02 }, 0.025, 0.01, 0, 0.1);
  assert.ok(m.profit > 0);
  assert.ok(m.profitUsd < 0);
  assert.ok(Math.abs(m.flowerMove + 0.5) < 1e-12);
  // Para recuperar os dólares precisa do dobro em FLOWER.
  assert.ok(Math.abs(m.breakEvenUsd - 0.04) < 1e-12);
});

test('cotação da compra vem do histórico mais próximo antes da data', () => {
  const h = { t: [100, 200, 300], usd: [0.01, null, 0.03] };
  assert.equal(usdAt(h, 250), 0.01);
  assert.equal(usdAt(h, 300), 0.03);
  assert.equal(usdAt(h, 50), 0.01);
});
