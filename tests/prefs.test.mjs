import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPrefs } from '../supabase/functions/_shared/prefs.js';
import { isWanted } from '../supabase/functions/_shared/farm-timers.js';

test('preferências do Lucro chegam ao servidor (ativação, itens seguidos, posições e %)', () => {
  const sent = {
    enabled: true, lang: 'pt', tz: 'America/Sao_Paulo',
    categories: { crops: true }, items: {},
    optIn: { sellSignal: true, buySignal: true, calendar: false },
    watch: [{ name: 'Corn', key: null, at: 1 }, { name: 'Nancy', key: 'c420', at: 2 }],
    positions: [{ item: 'Egg', qty: 100, avg: 0.02, key: null }],
    sellGoal: 0.2,
  };
  const saved = cleanPrefs(sent);
  assert.deepEqual(saved.optIn, sent.optIn);
  assert.deepEqual(saved.watch, sent.watch);
  assert.deepEqual(saved.positions, sent.positions);
  assert.equal(saved.sellGoal, 0.2);
  assert.equal(isWanted(saved, 'sellSignal', 'Corn'), true);
  assert.equal(isWanted(saved, 'calendar', 'Full Moon'), false);
});

test('filtro descarta lixo nas preferências', () => {
  const saved = cleanPrefs({
    optIn: { sellSignal: 'sim' },
    watch: [{ name: '' }, { name: 'x'.repeat(200) }, { name: 'Corn', key: 'javascript:1' }],
    positions: [{ item: 'Egg', qty: -1, avg: 1 }, { item: 'Egg', qty: 1, avg: 'a' }],
    sellGoal: 99,
    evil: true,
  });
  assert.deepEqual(saved.optIn, {});
  assert.deepEqual(saved.watch, [{ name: 'Corn', key: null, at: 0 }]);
  assert.deepEqual(saved.positions, []);
  assert.equal(saved.sellGoal, undefined);
  assert.equal(saved.evil, undefined);
});
