import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPurchase, farmState } from '../supabase/functions/_shared/purchases.js';

const base = { balance: 10, inventory: { Wheat: 500, Barley: 100 }, wardrobe: {}, farmActivity: { 'Bulk Resources Purchased': 5 }, trades: { listings: {}, offers: {} } };
const later = (patch, at = 2) => farmState({ ...base, ...patch }, at);
const prev = farmState(base, 1);
const prices = { Wheat: 0.0145, Barley: 0.027 };

test('compra de um item só entra direto, com o valor que saiu do saldo', () => {
  const found = detectPurchase(prev, later({ balance: 8, inventory: { ...base.inventory, Barley: 174 }, farmActivity: { 'Bulk Resources Purchased': 6 } }), prices);
  assert.equal(found.item, 'Barley');
  assert.equal(found.qty, 74);
  assert.equal(found.spent, 2);
  assert.equal(found.pending, false);
});

test('colheita no mesmo intervalo: escolhe o item cujo preço explica o gasto', () => {
  const found = detectPurchase(prev, later({
    balance: 10 - 0.891,
    inventory: { Wheat: 648, Barley: 133 },
    farmActivity: { 'Bulk Resources Purchased': 6 },
  }), prices);
  assert.equal(found.item, 'Barley');
  assert.equal(found.qty, 33);
  assert.equal(found.pending, false);
  assert.deepEqual(found.candidates.map(c => c.item), ['Barley', 'Wheat']);
});

test('quando dois itens explicam o gasto, fica pendente para a pessoa escolher', () => {
  const found = detectPurchase(prev, later({
    balance: 9,
    inventory: { Wheat: 569, Barley: 137 },
    farmActivity: { 'Bulk Resources Purchased': 6 },
  }), prices);
  assert.equal(found.pending, true);
  assert.equal(found.candidates.length, 2);
});

test('oferta criada reserva FLOWER mas não é compra', () => {
  const found = detectPurchase(prev, later({
    balance: 9.2,
    inventory: { Wheat: 600, Barley: 100 },
    trades: { listings: {}, offers: { o1: { sfl: 0.8, items: { Gold: 1 } } } },
  }), prices);
  assert.equal(found, null);
});

test('venda coletada aumenta o saldo e não esconde uma compra', () => {
  const withSale = farmState({ ...base, trades: { offers: {}, listings: { l1: { sfl: 1, tax: 0.1, fulfilledAt: 1 } } } }, 1);
  // Coletou a venda (+0,9) e comprou 74 Barley por 2: saldo foi de 10 para 8,9.
  const found = detectPurchase(withSale, later({ balance: 8.9, inventory: { ...base.inventory, Barley: 174 }, farmActivity: { 'Bulk Resources Purchased': 6 } }), prices);
  assert.equal(found.spent, 2);
  assert.equal(found.item, 'Barley');
});

test('saldo subiu ou nada entrou: não é compra', () => {
  assert.equal(detectPurchase(prev, later({ balance: 11 }), prices), null);
  assert.equal(detectPurchase(prev, later({ balance: 9 }), prices), null);
});
