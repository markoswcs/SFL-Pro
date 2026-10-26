import { useMemo, useState } from 'react';
import { flower, money, num } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { farmPurchases, priceHistory } from '../lib/push.js';
import { itemStats, isResource, purchaseMath, resourceTax, signals, taxFor, TRADE_MINIMUMS } from '../lib/market.js';
import { setSettings, useSettings } from '../lib/store.js';
import { locale, useT } from '../i18n.js';
import { Empty, Icon, ItemImg, Notice, Sheet } from '../ui.jsx';

const pct = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`);
const tone = v => (v == null || Math.abs(v) < 0.005 ? 'dim' : v > 0 ? 'leaf' : 'ember');

export const usePriceHistory = () => useResource('price-history', priceHistory, { ttl: 10 * 60_000 });

function Delta({ v, label }) {
  return <span className={`delta ${tone(v)}`}>{v != null && v > 0.005 ? '▲' : v != null && v < -0.005 ? '▼' : '•'} {pct(v)}{label ? ` ${label}` : ''}</span>;
}

/** Gráfico simples do preço no período, com a média de 7 dias tracejada. */
function Sparkline({ points, avg }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 90;
  const vs = points.map(p => p.v);
  const min = Math.min(...vs, avg ?? Infinity);
  const max = Math.max(...vs, avg ?? -Infinity);
  const t0 = points[0].at;
  const t1 = points[points.length - 1].at;
  const x = at => ((at - t0) / (t1 - t0 || 1)) * (W - 8) + 4;
  const y = v => H - 6 - ((v - min) / (max - min || 1)) * (H - 12);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Histórico de preço">
      {avg > 0 && <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="spark-avg" />}
      <path d={d} className={up ? 'spark-up' : 'spark-down'} />
    </svg>
  );
}

/** Cartão com a taxa de venda desta fazenda e de onde ela vem. */
export function TaxCard({ tax }) {
  const t = useT();
  const parts = [t('tax.island', { island: tax.island, n: Math.round(tax.base * 100) })];
  if (tax.vip) parts.push(t('tax.vip'));
  if (tax.shrine) parts.push(t('tax.shrine'));
  return (
    <div className="card tax-card">
      <Icon name="info" width="22" height="22" />
      <div className="grow">
        <div className="title">{t('tax.title', { n: (tax.rate * 100).toFixed(1).replace('.', ',') })}</div>
        <div className="sub">{parts.join(' · ')} · {t('tax.others')}</div>
      </div>
    </div>
  );
}

function PriceSheet({ name, stats, sig, taxRate, farm, rate, currency, onBuy, onClose }) {
  const t = useT();
  const have = Number(farm?.inventory?.[name] ?? 0);
  const net = stats.current * (1 - taxRate);
  return (
    <Sheet open onClose={onClose} title={name} icon={<ItemImg name={name} size={32} />}>
      <div className="stat-grid">
        <div className="card stat"><small>{t('price.now')}</small><strong className="sun">{flower(stats.current)}</strong></div>
        <div className="card stat"><small>24 h</small><strong className={tone(stats.change24)}>{pct(stats.change24)}</strong></div>
        <div className="card stat"><small>7 {t('price.days')}</small><strong className={tone(stats.change7)}>{pct(stats.change7)}</strong></div>
      </div>
      {stats.points.length > 1 ? (
        <div className="card spark-card">
          <Sparkline points={stats.points.filter(p => p.at >= Date.now() - 7 * 86400_000)} avg={stats.avg7} />
          <div className="row spark-legend">
            <span>{t('price.min')} {flower(stats.min7)}</span><span className="grow" style={{ textAlign: 'center' }}>{t('price.avg')} {flower(stats.avg7)}</span><span>{t('price.max')} {flower(stats.max7)}</span>
          </div>
        </div>
      ) : <div style={{ marginTop: 12 }}><Notice>{t('price.collecting')}</Notice></div>}

      {sig.sell != null && <div style={{ marginTop: 12 }}><Notice kind="ok">{t('price.sellHint', { n: pct(sig.sell) })}</Notice></div>}
      {sig.flip != null && <div style={{ marginTop: 12 }}><Notice kind="ok">{t('price.flipHint', { n: pct(sig.flip), avg: flower(stats.avg7) })}</Notice></div>}

      <div className="list" style={{ marginTop: 12 }}>
        <div className="list-row">
          <div className="grow"><div className="title">{t('price.netUnit')}</div><div className="sub">{t('price.taxOf', { n: (taxRate * 100).toFixed(1).replace('.', ',') })}</div></div>
          <div className="val"><strong>{flower(net)}</strong><small>{rate ? money(net * rate, currency) : ''}</small></div>
        </div>
        {isResource(name) && (
          <div className="list-row">
            <div className="grow"><div className="title">{t('price.minListing')}</div></div>
            <div className="val"><strong>{num(TRADE_MINIMUMS[name], 0)}</strong><small>{t('price.units')}</small></div>
          </div>
        )}
        {have > 0 && (
          <div className="list-row">
            <div className="grow"><div className="title">{t('price.youHave', { n: num(have) })}</div><div className="sub">{t('price.ifSold')}</div></div>
            <div className="val"><strong>{flower(have * net)}</strong><small>{rate ? money(have * net * rate, currency) : ''}</small></div>
          </div>
        )}
      </div>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => onBuy(name)}><Icon name="download" width="18" height="18" /> {t('buys.add')}</button>
      <p className="hint" style={{ marginTop: 10 }}>{t('price.disclaimer')}</p>
    </Sheet>
  );
}

const SORTS = ['fav', 'up', 'down', 'sell', 'flip', 'high', 'az'];

export function Prices({ prices, rate, currency, favorites, farm, land, onBuy }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('fav');
  const [open, setOpen] = useState(null);
  const { lang } = useSettings();
  const { data: history, error: historyError } = usePriceHistory();
  const tax = useMemo(() => resourceTax(farm, land), [farm, land]);

  const rows = useMemo(() => {
    const now = Date.now();
    const list = Object.entries(prices?.p2p ?? {}).map(([name, p]) => {
      const stats = itemStats(history, name, Number(p), now);
      const taxRate = taxFor(name, tax);
      return { name, p: Number(p), stats, taxRate, sig: signals(stats, taxRate) };
    });
    const fav = new Set(favorites);
    const by = key => (a, b) => (b.stats[key] ?? -Infinity) - (a.stats[key] ?? -Infinity);
    const sorters = {
      fav: (a, b) => (fav.has(b.name) - fav.has(a.name)) || a.name.localeCompare(b.name),
      up: (a, b) => by('change24')(a, b) || by('change7')(a, b),
      down: (a, b) => -by('change24')(a, b) || -by('change7')(a, b),
      sell: (a, b) => (b.sig.sell ?? -Infinity) - (a.sig.sell ?? -Infinity),
      flip: (a, b) => (b.sig.flip ?? -Infinity) - (a.sig.flip ?? -Infinity),
      high: (a, b) => b.p - a.p,
      az: (a, b) => a.name.localeCompare(b.name),
    };
    let out = list.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === 'sell') out = out.filter(r => r.sig.sell != null);
    if (sort === 'flip') out = out.filter(r => r.sig.flip != null);
    return out.sort(sorters[sort]);
  }, [prices, history, q, sort, favorites, tax]);

  const toggleFav = name => setSettings(s => ({ favorites: s.favorites.includes(name) ? s.favorites.filter(f => f !== name) : [...s.favorites, name] }));
  const since = history?.t?.[0];
  const current = open && rows.find(r => r.name === open);

  if (!prices) return <div className="skeleton" style={{ height: 320 }} />;
  return (
    <>
      {farm && <TaxCard tax={tax} />}
      <label className="search" style={{ marginTop: 12 }}>
        <span className="sr-only">{t('market.search')}</span>
        <Icon name="search" />
        <input className="input" type="search" value={q} placeholder={t('market.search')} onChange={e => setQ(e.target.value)} />
      </label>
      <div className="chip-row" style={{ margin: '12px -16px' }}>
        {SORTS.map(id => <button key={id} className="chip" aria-pressed={sort === id} onClick={() => setSort(id)}>{t(`price.sort.${id}`)}</button>)}
      </div>
      <p className="hint" style={{ margin: '-2px 2px 12px' }}>
        {historyError ? t('price.noHistory') : since ? t('price.since', { when: new Date(since).toLocaleString(locale(lang), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }) : t('price.collecting')}
      </p>
      {rows.length === 0 ? <Empty title={t('market.none')}>{sort === 'sell' || sort === 'flip' ? t('price.noSignal') : t('market.noneText')}</Empty> : (
        <div className="list">
          {rows.map(r => (
            <div className="list-row price-row" key={r.name}>
              <button className="grow row" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => setOpen(r.name)}>
                <div className="thumb"><ItemImg name={r.name} size={28} /></div>
                <div className="grow">
                  <div className="title ellipsis">{r.name}</div>
                  <div className="sub row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {r.stats.change24 != null || r.stats.change7 != null
                      ? <><Delta v={r.stats.change24} label="24h" /><Delta v={r.stats.change7} label="7d" /></>
                      : t('market.perUnit')}
                    {r.sig.sell != null && <span className="pill sig-sell">{t('price.sell')}</span>}
                    {r.sig.flip != null && <span className="pill sig-flip">{t('price.flip', { n: pct(r.sig.flip) })}</span>}
                  </div>
                </div>
                <div className="val">
                  <strong>{flower(r.p)}</strong>
                  <small>{rate ? money(r.p * rate, currency) : 'FLOWER'}</small>
                </div>
              </button>
              <button className="fav" aria-pressed={favorites.includes(r.name)} aria-label={t('market.fav', { name: r.name })} onClick={() => toggleFav(r.name)}>
                <Icon name="star" fill={favorites.includes(r.name) ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))}
        </div>
      )}
      {current && <PriceSheet name={current.name} stats={current.stats} sig={current.sig} taxRate={current.taxRate} farm={farm} rate={rate} currency={currency} onBuy={n => { setOpen(null); onBuy(n); }} onClose={() => setOpen(null)} />}
    </>
  );
}

function BuyForm({ names, initial, onSave, onCancel }) {
  const t = useT();
  const [item, setItem] = useState(initial ?? '');
  const [qty, setQty] = useState('');
  const [total, setTotal] = useState('');
  const n = v => Number(String(v).replace(',', '.')) || 0;
  const ok = item.trim() && n(qty) > 0 && n(total) > 0;
  return (
    <form className="card buy-form" onSubmit={e => { e.preventDefault(); if (ok) onSave({ item: item.trim(), qty: n(qty), sfl: n(total) }); }}>
      <h3>{t('buys.new')}</h3>
      <label><span>{t('buys.item')}</span><input className="input" list="p2p-items" value={item} onChange={e => setItem(e.target.value)} placeholder="Wheat" /></label>
      <datalist id="p2p-items">{names.map(x => <option key={x} value={x} />)}</datalist>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="grow"><span>{t('buys.qty')}</span><input className="input" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="100" /></label>
        <label className="grow"><span>{t('buys.paid')}</span><input className="input" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="1,5" /></label>
      </div>
      {ok && <p className="hint">{t('buys.unitIs', { unit: flower(n(total) / n(qty)) })}</p>}
      <div className="row">
        <button type="button" className="btn btn-ghost grow" onClick={onCancel}>{t('buys.cancel')}</button>
        <button type="submit" className="btn btn-sun grow" disabled={!ok}>{t('form.save')}</button>
      </div>
    </form>
  );
}

const GOALS = [0.05, 0.1, 0.2, 0.3];

export function Buys({ farm, land, prices, settings, rate, currency, adding, onAdding }) {
  const t = useT();
  const { data: server, error } = useResource(`purchases:${settings.farmId}`, () => farmPurchases(settings.farmId), { ttl: 120_000, enabled: !!settings.farmId });
  const tax = useMemo(() => resourceTax(farm, land), [farm, land]);
  const goal = settings.sellGoal ?? 0.1;
  const lang = settings.lang;
  const p2p = prices?.p2p ?? {};

  const rows = useMemo(() => {
    const byId = new Map();
    for (const p of server ?? []) byId.set(p.offer_id, { id: p.offer_id, item: p.item, qty: Number(p.qty), sfl: Number(p.sfl), at: Date.parse(p.bought_at), source: 'offer' });
    // Ofertas aceitas que ainda estão na fazenda (antes de o servidor ter copiado).
    for (const [id, o] of Object.entries(farm?.trades?.offers ?? {})) {
      if (!o?.fulfilledAt || byId.has(id)) continue;
      const [item, qty] = Object.entries(o.items ?? {})[0] ?? ['?', 0];
      byId.set(id, { id, item, qty: Number(qty), sfl: Number(o.sfl ?? 0), at: o.fulfilledAt, source: 'offer' });
    }
    for (const p of settings.purchases ?? []) byId.set(p.id, { ...p, source: 'manual' });
    return [...byId.values()].filter(r => r.qty > 0).sort((a, b) => b.at - a.at);
  }, [server, farm, settings.purchases]);

  const save = p => {
    setSettings(s => ({ purchases: [...(s.purchases ?? []), { id: `m${Date.now()}`, at: Date.now(), ...p }] }));
    onAdding(null);
  };
  const remove = id => setSettings(s => ({ purchases: (s.purchases ?? []).filter(p => p.id !== id) }));

  const totals = rows.reduce((acc, r) => {
    const cur = Number(p2p[r.item] ?? 0);
    if (!cur) return acc;
    const m = purchaseMath({ qty: r.qty, unit: r.sfl / r.qty }, cur, taxFor(r.item, tax), goal);
    return { cost: acc.cost + m.cost, net: acc.net + m.netNow };
  }, { cost: 0, net: 0 });

  if (!farm) return <Notice>{t('market.needFarm')}</Notice>;
  return (
    <>
      <TaxCard tax={tax} />
      {rows.length > 0 && (
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="card stat"><small>{t('buys.spent')}</small><strong>{flower(totals.cost)}</strong></div>
          <div className="card stat"><small>{t('buys.netNow')}</small><strong className="sun">{flower(totals.net)}</strong></div>
          <div className="card stat"><small>{t('buys.result')}</small><strong className={tone(totals.net - totals.cost)}>{totals.net - totals.cost >= 0 ? '+' : ''}{flower(totals.net - totals.cost)}</strong></div>
        </div>
      )}
      <div className="row" style={{ margin: '14px 0 10px', flexWrap: 'wrap', gap: 8 }}>
        <span className="dim" style={{ fontSize: 13, fontWeight: 700 }}>{t('buys.goal')}</span>
        {GOALS.map(g => <button key={g} className="chip" aria-pressed={goal === g} onClick={() => setSettings({ sellGoal: g })}>+{g * 100}%</button>)}
        <span className="spacer grow" />
        {adding === null && <button className="btn btn-sun btn-sm" onClick={() => onAdding('')}>{t('buys.add')}</button>}
      </div>
      {adding !== null && <BuyForm names={Object.keys(p2p).sort()} initial={adding} onSave={save} onCancel={() => onAdding(null)} />}
      {error && <Notice>{t('buys.serverOff')}</Notice>}
      {rows.length === 0 && adding === null && <Empty image="Flower" title={t('buys.none')}>{t('buys.noneText')}</Empty>}
      <div className="buy-list">
        {rows.map(r => {
          const unit = r.sfl / r.qty;
          const cur = Number(p2p[r.item] ?? 0);
          const taxRate = taxFor(r.item, tax);
          const m = purchaseMath({ qty: r.qty, unit }, cur, taxRate, goal);
          return (
            <article className="card buy-card" key={r.id}>
              <div className="row">
                <div className="thumb"><ItemImg name={r.item} size={30} /></div>
                <div className="grow">
                  <div className="title ellipsis">{num(r.qty)} {r.item}</div>
                  <div className="sub">{t('buys.paidAt', { total: flower(r.sfl), unit: flower(unit), when: new Date(r.at).toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit' }) })} · {t(`buys.src.${r.source}`)}</div>
                </div>
                <div className="val">
                  <strong className={tone(m.change)}>{cur ? pct(m.change) : '—'}</strong>
                  <small>{cur ? `${t('price.now')} ${flower(cur)}` : t('buys.noPrice')}</small>
                </div>
              </div>
              {cur > 0 && (
                <div className="buy-math">
                  <div><small>{t('buys.sellNow')}</small><b className={tone(m.profitNow)}>{flower(m.netNow)} ({m.profitNow >= 0 ? '+' : ''}{flower(m.profitNow)})</b></div>
                  <div><small>{t('buys.breakEven')}</small><b>{flower(m.breakEven)}{t('buys.perUnit')}</b></div>
                  <div><small>{t('buys.target', { n: goal * 100 })}</small><b className="sun">{flower(m.target)}{t('buys.perUnit')}</b><small>{t('buys.totalListing', { total: flower(m.target * r.qty), cur: rate ? money(m.target * r.qty * rate, currency) : '' })}</small></div>
                </div>
              )}
              {r.source === 'manual' && <button className="link-btn" style={{ color: 'var(--muted)', marginTop: 8 }} onClick={() => remove(r.id)}>{t('buys.remove')}</button>}
            </article>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>{t('buys.hint', { n: (taxRate => (taxRate * 100).toFixed(1).replace('.', ','))(tax.rate) })}</p>
    </>
  );
}
