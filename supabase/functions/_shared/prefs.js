// Preferências que o aparelho manda ao servidor, validadas campo a campo.
// Tudo o que o servidor usa para decidir os avisos precisa passar por aqui; campo que não
// estiver listado é descartado.

const bools = o => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => typeof v === 'boolean' && k.length < 80).slice(0, 400));
const text = (v, max = 80) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const nftKey = v => (typeof v === 'string' && /^[cw]\d{1,6}$/.test(v) ? v : null);
const positive = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function cleanPrefs(prefs) {
  const tz = typeof prefs?.tz === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(prefs.tz) ? prefs.tz : undefined;
  // Itens e NFTs seguidos na aba Lucro (aviso de compra).
  const watch = (Array.isArray(prefs?.watch) ? prefs.watch : []).slice(0, 100)
    .map(w => ({ name: text(w?.name), key: nftKey(w?.key), at: positive(w?.at) ?? 0 }))
    .filter(w => w.name);
  // Posições da Carteira (preço médio de verdade, para o aviso de meta de lucro).
  const positions = (Array.isArray(prefs?.positions) ? prefs.positions : []).slice(0, 300)
    .map(p => ({ item: text(p?.item), qty: positive(p?.qty), avg: positive(p?.avg), key: nftKey(p?.key) }))
    .filter(p => p.item && p.qty && p.avg);
  const goal = positive(prefs?.sellGoal);
  return {
    enabled: prefs?.enabled !== false,
    lang: prefs?.lang === 'en' ? 'en' : 'pt',
    tz,
    categories: bools(prefs?.categories),
    items: bools(prefs?.items),
    optIn: bools(prefs?.optIn),
    watch,
    positions,
    ...(goal && goal <= 5 ? { sellGoal: goal } : {}),
  };
}
