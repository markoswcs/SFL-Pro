import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { flower, money, num } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { farmPurchases, nftHistory, priceHistory } from '../lib/push.js';
import { buildPositions, isResource, itemStats, nftStats, positionMath, resourceTax, signals, taxFor, TRADE_MINIMUMS, usdAt } from '../lib/market.js';
import { nftImage, normalizeNfts, ownedNfts } from '../lib/nfts.js';
import { setSettings, useSettings } from '../lib/store.js';
import { locale, useT } from '../i18n.js';
import { Empty, Icon, ItemImg, Notice, Sheet } from '../ui.jsx';

// Variações menores que 0,05% aparecem como 0,0% (sem o sinal de menos).
const pct = v => {
  if (v == null || !Number.isFinite(v)) return '—';
  const x = Math.abs(v) < 0.0005 ? 0 : v;
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;
};
const tone = v => (v == null || Math.abs(v) < 0.005 ? 'dim' : v > 0 ? 'leaf' : 'ember');
const signed = (v, fmt) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
const usd = v => money(v, 'usd');
const n = v => Number(String(v ?? '').replace(',', '.')) || 0;

export const usePriceHistory = () => useResource('price-history', priceHistory, { ttl: 10 * 60_000 });
export function useNfts() {
  const res = useResource('nfts', () => api.nfts().then(normalizeNfts), { ttl: 10 * 60_000 });
  return { ...res, data: res.data ?? [] };
}

/** Preço atual de qualquer item: recurso pelo P2P, NFT pelo floor. */
function usePriceLookup(prices, nfts) {
  return useMemo(() => {
    const byName = new Map(nfts.map(x => [x.name, x]));
    return name => {
      const p2p = Number(prices?.p2p?.[name] ?? 0);
      if (p2p > 0) return { price: p2p, kind: 'resource' };
      const nft = byName.get(name);
      return nft ? { price: nft.floor, kind: nft.kind, nft } : { price: 0, kind: 'unknown' };
    };
  }, [prices, nfts]);
}

function Delta({ v, label }) {
  if (v == null) return null;
  return <span className={`delta ${tone(v)}`}>{v > 0.005 ? '▲' : v < -0.005 ? '▼' : '•'} {pct(v)}{label ? ` ${label}` : ''}</span>;
}

function Thumb({ item, size = 28 }) {
  if (item?.key) {
    return (
      <img className="px" src={nftImage(item)} alt="" width={size} height={size} loading="lazy"
        onError={e => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = 1; e.currentTarget.src = `https://sfl.world/img/source/${encodeURIComponent(item.name)}.png`; } }} />
    );
  }
  return <ItemImg name={item?.name ?? item} size={size} />;
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
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Histórico de preço">
      {avg > 0 && <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="spark-avg" />}
      <path d={d} className={vs[vs.length - 1] >= vs[0] ? 'spark-up' : 'spark-down'} />
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

function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([id, label]) => <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

// ---------------------------------------------------------------- gaveta do item

function ItemSheet({ row, history, farm, owned, rate, currency, onBuy, onClose }) {
  const t = useT();
  const { name, stats, sig, taxRate, nft } = row;
  const nftSeries = useResource(`nft-h:${nft?.key}`, () => nftHistory(nft.key), { ttl: 10 * 60_000, enabled: !!nft });
  const points = nft
    ? [...(nftSeries.data?.t ?? []).map((at, i) => ({ at, v: nftSeries.data.v[i] })), ...(stats.current > 0 ? [{ at: Date.now(), v: stats.current }] : [])]
    : stats.points.filter(p => p.at >= Date.now() - 7 * 86400_000);
  const have = nft ? owned.get(nft.key) ?? 0 : Number(farm?.inventory?.[name] ?? 0);
  const net = stats.current * (1 - taxRate);
  return (
    <Sheet open onClose={onClose} title={name} icon={<Thumb item={nft ?? name} size={32} />}>
      {nft && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="tag">{t(`nft.kind.${nft.kind}`)}</span>
          {nft.boost && <span className="tag boost">⚡ {nft.boost}</span>}
          {nft.supply > 0 && <span className="tag">{t('nft.supply', { n: num(nft.supply, 0) })}</span>}
        </div>
      )}
      <div className="stat-grid">
        <div className="card stat"><small>{nft ? t('nft.floor') : t('price.now')}</small><strong className="sun">{flower(stats.current)}</strong>{rate > 0 && <small>{money(stats.current * rate, currency)}</small>}</div>
        <div className="card stat"><small>{stats.label24 ?? '24h'}</small><strong className={tone(stats.change24)}>{pct(stats.change24)}</strong></div>
        <div className="card stat"><small>{stats.label7 ?? '7d'}</small><strong className={tone(stats.change7)}>{pct(stats.change7)}</strong></div>
      </div>
      {points.length > 1 ? (
        <div className="card spark-card">
          <Sparkline points={points} avg={stats.avg7} />
          <div className="row spark-legend">
            <span>{t('price.min')} {flower(stats.min7)}</span><span className="grow" style={{ textAlign: 'center' }}>{t('price.avg')} {flower(stats.avg7)}</span><span>{t('price.max')} {flower(stats.max7)}</span>
          </div>
        </div>
      ) : <div style={{ marginTop: 12 }}><Notice>{t('price.collecting')}</Notice></div>}

      {sig.sell != null && <div style={{ marginTop: 12 }}><Notice kind="ok">{t('price.sellHint', { n: pct(sig.sell) })}</Notice></div>}
      {sig.flip != null && <div style={{ marginTop: 12 }}><Notice kind="ok">{t('price.flipHint', { n: pct(sig.flip), avg: flower(stats.avg7) })}</Notice></div>}

      <div className="list" style={{ marginTop: 12 }}>
        {nft && nft.last > 0 && (
          <div className="list-row"><div className="grow"><div className="title">{t('nft.last')}</div></div><div className="val"><strong>{flower(nft.last)}</strong></div></div>
        )}
        <div className="list-row">
          <div className="grow"><div className="title">{t('price.netUnit')}</div><div className="sub">{t('price.taxOf', { n: (taxRate * 100).toFixed(1).replace('.', ',') })}</div></div>
          <div className="val"><strong>{flower(net)}</strong><small>{rate ? money(net * rate, currency) : ''}</small></div>
        </div>
        {isResource(name) && (
          <div className="list-row"><div className="grow"><div className="title">{t('price.minListing')}</div></div><div className="val"><strong>{num(TRADE_MINIMUMS[name], 0)}</strong><small>{t('price.units')}</small></div></div>
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

// ---------------------------------------------------------------- preços

const RES_SORTS = ['fav', 'up', 'down', 'sell', 'flip', 'high', 'az'];
const NFT_SORTS = ['boost', 'mine', 'up', 'down', 'high', 'az'];

function Movers({ rows, onOpen }) {
  const t = useT();
  const withChange = rows.filter(r => r.stats.change24 != null);
  if (!withChange.length) return null;
  const by = (list, fn) => list.slice().sort(fn)[0];
  const cards = [
    ['up', by(withChange, (a, b) => b.stats.change24 - a.stats.change24), r => <Delta v={r.stats.change24} label={r.stats.label24} />],
    ['down', by(withChange, (a, b) => a.stats.change24 - b.stats.change24), r => <Delta v={r.stats.change24} label={r.stats.label24} />],
    ['sell', by(rows.filter(r => r.sig.sell != null), (a, b) => b.sig.sell - a.sig.sell), r => <span className="delta leaf">{pct(r.sig.sell)} {t('movers.aboveAvg')}</span>],
    ['flip', by(rows.filter(r => r.sig.flip != null), (a, b) => b.sig.flip - a.sig.flip), r => <span className="delta sky">{pct(r.sig.flip)} {t('movers.margin')}</span>],
  ].filter(([, r]) => r);
  return (
    <div className="movers" role="list">
      {cards.map(([id, r, extra]) => (
        <button key={id} className={`card mover mover-${id}`} role="listitem" onClick={() => onOpen(r.name)}>
          <span className="kicker">{t(`movers.${id}`)}</span>
          <span className="row" style={{ gap: 8 }}><Thumb item={r.nft ?? r.name} size={26} /><b className="ellipsis">{r.name}</b></span>
          {extra(r)}
        </button>
      ))}
    </div>
  );
}

export function Prices({ prices, rate, currency, favorites, farm, land, onBuy }) {
  const t = useT();
  const { lang } = useSettings();
  const [kind, setKind] = useState('res');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('fav');
  const [open, setOpen] = useState(null);
  const { data: history, error: historyError } = usePriceHistory();
  const { data: nfts, loading: nftLoading } = useNfts();
  const tax = useMemo(() => resourceTax(farm, land), [farm, land]);
  const owned = useMemo(() => ownedNfts(farm, nfts), [farm, nfts]);

  const resRows = useMemo(() => {
    const now = Date.now();
    return Object.entries(prices?.p2p ?? {}).map(([name, p]) => {
      const stats = itemStats(history, name, Number(p), now);
      const taxRate = taxFor(name, tax);
      return { name, p: Number(p), stats, taxRate, sig: signals(stats, taxRate) };
    });
  }, [prices, history, tax]);

  const nftRows = useMemo(() => {
    const now = Date.now();
    return nfts.filter(x => x.floor > 0).map(x => {
      const stats = nftStats(history?.nft?.[x.key], x.floor, now);
      return { name: x.name, p: x.floor, nft: x, stats, taxRate: 0.1, sig: signals(stats, 0.1) };
    });
  }, [nfts, history]);

  const switchKind = k => { setKind(k); setSort(k === 'res' ? 'fav' : 'boost'); };
  const base = kind === 'res' ? resRows : nftRows;
  const rows = useMemo(() => {
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
      boost: (a, b) => (!!b.nft.boost - !!a.nft.boost) || b.p - a.p,
      mine: (a, b) => b.p - a.p,
    };
    const ql = q.toLowerCase();
    let out = base.filter(r => r.name.toLowerCase().includes(ql) || r.nft?.boost.toLowerCase().includes(ql));
    if (sort === 'sell') out = out.filter(r => r.sig.sell != null);
    if (sort === 'flip') out = out.filter(r => r.sig.flip != null);
    if (sort === 'boost') out = out.filter(r => r.nft.boost);
    if (sort === 'mine') out = out.filter(r => owned.has(r.nft.key));
    if (sort === 'up') out = out.filter(r => (r.stats.change24 ?? r.stats.change7) > 0.005);
    if (sort === 'down') out = out.filter(r => (r.stats.change24 ?? r.stats.change7) < -0.005);
    return out.sort(sorters[sort]).slice(0, kind === 'nft' && !q ? 150 : 1000);
  }, [base, q, sort, favorites, owned, kind]);

  const toggleFav = name => setSettings(s => ({ favorites: s.favorites.includes(name) ? s.favorites.filter(f => f !== name) : [...s.favorites, name] }));
  const since = history?.t?.[0];
  const current = open && [...resRows, ...nftRows].find(r => r.name === open);

  if (!prices) return <div className="skeleton" style={{ height: 320 }} />;
  return (
    <>
      <Segmented value={kind} onChange={switchKind} options={[['res', t('price.kind.res', { n: resRows.length })], ['nft', t('price.kind.nft', { n: nftRows.length || '…' })]]} />
      <Movers rows={base} onOpen={setOpen} />
      <label className="search" style={{ marginTop: 12 }}>
        <span className="sr-only">{t('market.search')}</span>
        <Icon name="search" />
        <input className="input" type="search" value={q} placeholder={kind === 'nft' ? t('nft.search') : t('market.search')} onChange={e => setQ(e.target.value)} />
      </label>
      <div className="chip-row" style={{ margin: '12px -16px 6px' }}>
        {(kind === 'res' ? RES_SORTS : NFT_SORTS).map(id => <button key={id} className="chip" aria-pressed={sort === id} onClick={() => setSort(id)}>{t(`price.sort.${id}`)}</button>)}
      </div>
      <p className="hint" style={{ margin: '0 2px 12px' }}>
        {historyError ? t('price.noHistory') : since ? t('price.since', { when: new Date(since).toLocaleString(locale(lang), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }) : t('price.collecting')}
        {farm && <> · {t('tax.short', { n: (tax.rate * 100).toFixed(1).replace('.', ',') })}</>}
      </p>
      {kind === 'nft' && nftLoading && !nfts.length && <div className="skeleton" style={{ height: 240 }} />}
      {rows.length === 0 && !(kind === 'nft' && nftLoading) ? (
        <Empty title={t('market.none')}>{['sell', 'flip', 'up', 'down'].includes(sort) ? t('price.noSignal') : sort === 'mine' ? t('nft.noneMine') : t('market.noneText')}</Empty>
      ) : (
        <div className="list">
          {rows.map(r => (
            <div className="list-row price-row" key={r.nft?.key ?? r.name}>
              <button className="grow row" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => setOpen(r.name)}>
                <div className="thumb"><Thumb item={r.nft ?? r.name} /></div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title ellipsis">{r.name}{r.nft && owned.has(r.nft.key) && <span className="own-dot" title={t('nft.owned')}> ●</span>}</div>
                  <div className="sub row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Delta v={r.stats.change24} label={r.stats.label24} /><Delta v={r.stats.change7} label={r.stats.label7} />
                    {r.stats.change24 == null && r.stats.change7 == null && <span className="ellipsis">{r.nft?.boost ? `⚡ ${r.nft.boost}` : r.nft ? t(`nft.kind.${r.nft.kind}`) : t('market.perUnit')}</span>}
                    {r.sig.sell != null && <span className="pill sig-sell">{t('price.sell')}</span>}
                    {r.sig.flip != null && <span className="pill sig-flip">{t('price.flip', { n: pct(r.sig.flip) })}</span>}
                  </div>
                </div>
                <div className="val">
                  <strong>{flower(r.p)}</strong>
                  <small>{rate ? money(r.p * rate, currency) : 'FLOWER'}</small>
                </div>
              </button>
              {kind === 'res' && (
                <button className="fav" aria-pressed={favorites.includes(r.name)} aria-label={t('market.fav', { name: r.name })} onClick={() => toggleFav(r.name)}>
                  <Icon name="star" fill={favorites.includes(r.name) ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {current && <ItemSheet row={current} history={history} farm={farm} owned={owned} rate={rate} currency={currency} onBuy={x => { setOpen(null); onBuy(x); }} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- carteira

/** Compra que o servidor percebeu mas não soube qual item foi: a pessoa escolhe com um toque. */
function DetectedPurchase({ tx, priceOf }) {
  const t = useT();
  const { lang } = useSettings();
  const pick = c => setSettings(s => ({ txEdits: { ...s.txEdits, [tx.id]: { item: c.item, qty: c.qty, pending: false } } }));
  const dismiss = () => setSettings(s => ({ txHidden: { ...s.txHidden, [tx.id]: true } }));
  return (
    <div className="card detected">
      <div className="row">
        <Icon name="info" width="22" height="22" />
        <div className="grow">
          <div className="title">{t('detect.title', { spent: flower(tx.sfl) })}</div>
          <div className="sub">{t('detect.text', { when: new Date(tx.at).toLocaleString(locale(lang), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })}</div>
        </div>
      </div>
      <div className="detected-options">
        {tx.candidates.map(c => {
          const value = priceOf(c.item).price * c.qty;
          return (
            <button key={c.item} className="ready-chip" onClick={() => pick(c)}>
              <Thumb item={c.item} size={22} /><b>+{num(c.qty)}</b><span className="ellipsis">{c.item}</span>
              {value > 0 && <small className="muted">≈ {flower(value)}</small>}
            </button>
          );
        })}
      </div>
      <button className="link-btn" style={{ color: 'var(--muted)', marginTop: 8 }} onClick={dismiss}>{t('detect.notBuy')}</button>
    </div>
  );
}

const toLocalInput = ms => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/** Formulário de compra: nova (sem `tx`) ou edição de uma existente. */
function TxForm({ names, history, initial, tx, curUsd, onSave, onCancel }) {
  const t = useT();
  const [item, setItem] = useState(tx?.item ?? initial ?? '');
  const [qty, setQty] = useState(tx ? String(tx.qty) : '');
  const [total, setTotal] = useState(tx ? String(tx.sfl) : '');
  const [when, setWhen] = useState(toLocalInput(tx?.at ?? Date.now()));
  const [rateTouched, setRateTouched] = useState(!!tx?.usd);
  const [usdRate, setUsdRate] = useState(tx?.usd ? String(tx.usd) : '');
  const [rateSource, setRateSource] = useState(null);
  const at = Date.parse(when) || Date.now();
  // Sem cotação digitada, usa a guardada perto da data da compra (ou a de agora).
  useEffect(() => {
    if (rateTouched) return;
    const past = usdAt(history, at);
    const r = past ?? curUsd;
    setRateSource(past ? 'history' : r ? 'now' : null);
    setUsdRate(r ? String(Number(r.toFixed(6))) : '');
  }, [at, history, curUsd, rateTouched]);
  const ok = item.trim() && n(qty) > 0 && n(total) > 0;
  return (
    <form className="card buy-form" onSubmit={e => { e.preventDefault(); if (ok) onSave({ item: item.trim(), qty: n(qty), sfl: n(total), at, usd: n(usdRate) || null }); }}>
      <h3>{tx ? t('buys.edit') : t('buys.new')}</h3>
      <label><span>{t('buys.item')}</span><input className="input" list="trade-items" value={item} onChange={e => setItem(e.target.value)} placeholder="Wheat" disabled={!!tx} /></label>
      <datalist id="trade-items">{names.map(x => <option key={x} value={x} />)}</datalist>
      <div className="form-grid">
        <label><span>{t('buys.qty')}</span><input className="input" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="100" /></label>
        <label><span>{t('buys.paid')}</span><input className="input" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="1,5" /></label>
        <label><span>{t('buys.when')}</span><input className="input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>
        <label><span>{t('buys.rate')}</span><input className="input" inputMode="decimal" value={usdRate} onChange={e => { setRateTouched(true); setUsdRate(e.target.value.replace(/[^\d.,]/g, '')); }} placeholder="0,0123" /></label>
      </div>
      {ok && (
        <p className="hint">
          {t('buys.unitIs', { unit: flower(n(total) / n(qty)) })}
          {n(usdRate) > 0 && <> · {t('buys.costUsd', { v: usd(n(total) * n(usdRate)) })}</>}
          {!rateTouched && rateSource && <> · {t(rateSource === 'history' ? 'buys.rateAuto' : 'buys.rateNow')}</>}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn btn-ghost grow" onClick={onCancel}>{t('buys.cancel')}</button>
        <button type="submit" className="btn btn-sun grow" disabled={!ok}>{t('form.save')}</button>
      </div>
    </form>
  );
}

/** Linha "rótulo · FLOWER · US$" usada nas contas da posição. */
function MathCell({ label, value, sub, className = '' }) {
  return <div><small>{label}</small><b className={className}>{value}</b>{sub && <small>{sub}</small>}</div>;
}

function PositionSheet({ pos, m, cur, curUsd, history, names, taxRate, goal, onClose }) {
  const t = useT();
  const { lang } = useSettings();
  const [avg, setAvg] = useState(String(Number(pos.avgUnit.toFixed(8))));
  const [avgRate, setAvgRate] = useState(pos.avgUsd ? String(Number(pos.avgUsd.toFixed(6))) : '');
  const [editing, setEditing] = useState(null);
  const saveAvg = () => setSettings(s => ({ positions: { ...s.positions, [pos.item]: { avgUnit: n(avg) || undefined, avgUsd: n(avgRate) || undefined } } }));
  const resetAvg = () => setSettings(s => { const p = { ...s.positions }; delete p[pos.item]; return { positions: p }; });
  const saveTx = (tx, patch) => setSettings(s => (tx.source === 'manual'
    ? { purchases: (s.purchases ?? []).map(p => (p.id === tx.id ? { ...p, ...patch } : p)) }
    : { txEdits: { ...s.txEdits, [tx.id]: patch } }));
  const removeTx = tx => setSettings(s => (tx.source === 'manual'
    ? { purchases: (s.purchases ?? []).filter(p => p.id !== tx.id) }
    : { txHidden: { ...s.txHidden, [tx.id]: true } }));
  return (
    <Sheet open onClose={onClose} title={pos.item} icon={<Thumb item={pos.nft ?? pos.item} size={32} />}>
      <div className="stat-grid">
        <div className="card stat"><small>{t('pos.qty')}</small><strong>{num(pos.qty)}</strong></div>
        <div className="card stat"><small>{t('pos.result')}</small><strong className={tone(m.profit)}>{pct(m.pct)}</strong><small>FLOWER</small></div>
        <div className="card stat"><small>{t('pos.resultUsd')}</small><strong className={tone(m.profitUsd)}>{pct(m.pctUsd)}</strong><small>US$</small></div>
      </div>
      {m.flowerMove != null && Math.abs(m.flowerMove) >= 0.01 && (
        <div style={{ marginTop: 12 }}>
          <Notice kind={m.flowerMove < 0 ? 'warn' : 'ok'}>{t(m.flowerMove < 0 ? 'pos.flowerDown' : 'pos.flowerUp', { n: pct(m.flowerMove), then: usd(pos.avgUsd), now: usd(curUsd) })}</Notice>
        </div>
      )}

      <h3 className="sheet-sub">{t('pos.avgTitle')}</h3>
      <div className="card buy-form">
        <div className="form-grid">
          <label><span>{t('pos.avgUnit')}</span><input className="input" inputMode="decimal" value={avg} onChange={e => setAvg(e.target.value.replace(/[^\d.,]/g, ''))} /></label>
          <label><span>{t('pos.avgRate')}</span><input className="input" inputMode="decimal" value={avgRate} onChange={e => setAvgRate(e.target.value.replace(/[^\d.,]/g, ''))} placeholder={curUsd ? String(curUsd) : ''} /></label>
        </div>
        <p className="hint">{t('pos.avgHint', { usd: n(avg) && n(avgRate) ? usd(n(avg) * n(avgRate)) : '—' })}</p>
        <div className="row">
          {pos.edited && <button type="button" className="btn btn-ghost grow" onClick={resetAvg}>{t('pos.reset')}</button>}
          <button type="button" className="btn btn-sun grow" onClick={saveAvg}>{t('pos.saveAvg')}</button>
        </div>
      </div>

      <h3 className="sheet-sub">{t('pos.sellTitle')}</h3>
      <div className="buy-math">
        <MathCell label={t('buys.sellNow')} value={`${flower(m.net)} FLOWER`} sub={m.netUsd != null ? usd(m.netUsd) : null} />
        <MathCell label={t('buys.breakEven')} value={`${flower(m.breakEven)}${t('buys.perUnit')}`} sub={t('pos.inFlower')} />
        {m.breakEvenUsd != null && <MathCell label={t('pos.breakEvenUsd')} value={`${flower(m.breakEvenUsd)}${t('buys.perUnit')}`} sub={t('pos.inUsd')} className={m.breakEvenUsd > m.breakEven ? 'ember' : ''} />}
        <MathCell label={t('buys.target', { n: goal * 100 })} value={`${flower(m.targetUsd ?? m.target)}${t('buys.perUnit')}`} sub={m.targetUsd != null ? t('pos.inUsd') : t('pos.inFlower')} className="sun" />
      </div>
      <p className="hint" style={{ marginTop: 8 }}>{t('pos.taxNote', { n: (taxRate * 100).toFixed(1).replace('.', ','), cur: flower(cur) })}</p>

      <h3 className="sheet-sub">{t('pos.txs')}</h3>
      {editing ? (
        <TxForm names={names} history={history} tx={editing} curUsd={curUsd} onCancel={() => setEditing(null)} onSave={patch => { saveTx(editing, patch); setEditing(null); }} />
      ) : (
        <div className="list">
          {pos.txs.map(tx => (
            <div className="list-row" key={tx.id}>
              <div className="grow">
                <div className="title">{num(tx.qty)} × {flower(tx.sfl / tx.qty)}</div>
                <div className="sub">{new Date(tx.at).toLocaleString(locale(lang), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {t(`buys.src.${tx.source}`)}{tx.usd ? ` · US$ ${tx.usd}` : ''}</div>
              </div>
              <button className="mini-btn" onClick={() => setEditing(tx)}>{t('pos.editTx')}</button>
              <button className="mini-btn" onClick={() => removeTx(tx)} aria-label={t('buys.remove')}><Icon name="x" /></button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

const GOALS = [0.05, 0.1, 0.2, 0.3];

export function Buys({ farm, land, prices, settings, rate, currency, exchange, adding, onAdding }) {
  const t = useT();
  const { data: server, error } = useResource(`purchases:${settings.farmId}`, () => farmPurchases(settings.farmId), { ttl: 120_000, enabled: !!settings.farmId });
  const { data: history } = usePriceHistory();
  const { data: nfts } = useNfts();
  const priceOf = usePriceLookup(prices, nfts);
  const [open, setOpen] = useState(null);
  const tax = useMemo(() => resourceTax(farm, land), [farm, land]);
  const goal = settings.sellGoal ?? 0.1;
  const curUsd = Number(exchange?.sfl?.usd ?? 0);

  // Todas as compras: ofertas aceitas (servidor + fazenda) e as registradas à mão, com as edições por cima.
  const txs = useMemo(() => {
    const byId = new Map();
    const add = (id, tx) => { if (!settings.txHidden?.[id]) byId.set(id, { ...tx, ...(settings.txEdits?.[id] ?? {}), id }); };
    for (const p of server ?? []) {
      // "auto-…": compra instantânea deduzida pelo servidor (saldo que saiu × itens que entraram).
      const auto = String(p.offer_id).startsWith('auto-');
      add(p.offer_id, { item: p.item, qty: Number(p.qty), sfl: Number(p.sfl), at: Date.parse(p.bought_at), source: auto ? 'auto' : 'offer', pending: !!p.pending, candidates: p.candidates ?? [] });
    }
    for (const [id, o] of Object.entries(farm?.trades?.offers ?? {})) {
      if (!o?.fulfilledAt || byId.has(id)) continue;
      const [item, qty] = Object.entries(o.items ?? {})[0] ?? ['?', 0];
      add(id, { item, qty: Number(qty), sfl: Number(o.sfl ?? 0), at: o.fulfilledAt, source: 'offer' });
    }
    for (const p of settings.purchases ?? []) byId.set(p.id, { ...p, source: 'manual' });
    // Compra sem cotação anotada: usa a guardada pelo servidor perto da data.
    return [...byId.values()].filter(x => x.qty > 0 && x.sfl > 0).map(x => ({ ...x, usd: x.usd ?? usdAt(history, x.at) }));
  }, [server, farm, settings.purchases, settings.txEdits, settings.txHidden, history]);

  // Compra detectada sem certeza do item fica fora da carteira até a pessoa escolher.
  const pending = txs.filter(x => x.pending);
  const confirmed = useMemo(() => txs.filter(x => !x.pending), [txs]);
  const positions = useMemo(() => buildPositions(confirmed, settings.positions).map(p => {
    const { price, nft } = priceOf(p.item);
    const taxRate = taxFor(p.item, tax);
    return { ...p, nft, price, taxRate, m: positionMath(p, price, curUsd, taxRate, goal) };
  }), [confirmed, settings.positions, priceOf, tax, curUsd, goal]);

  const priced = positions.filter(p => p.price > 0);
  const total = priced.reduce((a, p) => ({
    cost: a.cost + p.m.cost, net: a.net + p.m.net,
    costUsd: a.costUsd + (p.m.costUsd ?? p.m.cost * curUsd), netUsd: a.netUsd + (p.m.netUsd ?? p.m.net * curUsd),
  }), { cost: 0, net: 0, costUsd: 0, netUsd: 0 });
  const names = useMemo(() => [...Object.keys(prices?.p2p ?? {}), ...nfts.map(x => x.name)].sort(), [prices, nfts]);
  const save = p => { setSettings(s => ({ purchases: [...(s.purchases ?? []), { id: `m${Date.now()}`, ...p }] })); onAdding(null); };
  const openPos = open && positions.find(p => p.item === open);

  if (!farm) return <Notice>{t('market.needFarm')}</Notice>;
  return (
    <>
      {priced.length > 0 && (
        <div className="card portfolio-head">
          <div className="ph-row">
            <div><small>{t('pf.invested')}</small><b>{flower(total.cost)} <i>FLOWER</i></b><span>{usd(total.costUsd)}</span></div>
            <div><small>{t('pf.netNow')}</small><b className="sun">{flower(total.net)} <i>FLOWER</i></b><span>{usd(total.netUsd)}</span></div>
          </div>
          <div className="ph-result">
            <div><small>{t('pf.inFlower')}</small><b className={tone(total.net - total.cost)}>{signed(total.net - total.cost, flower)} <i>({pct(total.cost ? (total.net - total.cost) / total.cost : null)})</i></b></div>
            <div><small>{t('pf.inUsd')}</small><b className={tone(total.netUsd - total.costUsd)}>{signed(total.netUsd - total.costUsd, usd)} <i>({pct(total.costUsd ? (total.netUsd - total.costUsd) / total.costUsd : null)})</i></b></div>
          </div>
          {Math.sign(total.net - total.cost) !== Math.sign(total.netUsd - total.costUsd) && Math.abs(total.netUsd - total.costUsd) > 0.005 && (
            <p className="hint" style={{ marginTop: 8 }}>{t(total.netUsd < total.costUsd ? 'pf.fakeProfit' : 'pf.realProfit')}</p>
          )}
          {curUsd > 0 && <p className="hint" style={{ marginTop: 6 }}>{t('pf.rateNow', { v: usd(curUsd), cur: currency !== 'usd' && rate ? money(rate, currency) : '' })}</p>}
        </div>
      )}
      <div className="row" style={{ margin: '14px 0 10px', flexWrap: 'wrap', gap: 8 }}>
        <span className="dim" style={{ fontSize: 13, fontWeight: 700 }}>{t('buys.goal')}</span>
        {GOALS.map(g => <button key={g} className="chip" aria-pressed={goal === g} onClick={() => setSettings({ sellGoal: g })}>+{g * 100}%</button>)}
        <span className="spacer grow" />
        {adding === null && <button className="btn btn-sun btn-sm" onClick={() => onAdding('')}><Icon name="download" width="16" height="16" /> {t('buys.add')}</button>}
      </div>
      {adding !== null && <TxForm names={names} history={history} initial={adding} curUsd={curUsd} onSave={save} onCancel={() => onAdding(null)} />}
      {error && <Notice>{t('buys.serverOff')}</Notice>}
      {pending.map(tx => <DetectedPurchase key={tx.id} tx={tx} priceOf={priceOf} />)}
      {positions.length === 0 && adding === null && <Empty image="Flower" title={t('buys.none')}>{t('buys.noneText')}</Empty>}
      <div className="buy-list">
        {positions.map(p => (
          <button className="card buy-card" key={p.item} onClick={() => setOpen(p.item)}>
            <div className="row">
              <div className="thumb"><Thumb item={p.nft ?? p.item} size={30} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title ellipsis">{num(p.qty)} {p.item}{p.edited && <span className="tag" style={{ marginLeft: 6 }}>{t('pos.edited')}</span>}</div>
                <div className="sub">{t('pos.avgLine', { unit: flower(p.avgUnit), rate: p.avgUsd ? usd(p.avgUsd) : '—' })}</div>
              </div>
              <div className="val">
                <strong className={tone(p.m.change)}>{p.price ? pct(p.m.change) : '—'}</strong>
                <small>{p.price ? `${t('price.now')} ${flower(p.price)}` : t('buys.noPrice')}</small>
              </div>
            </div>
            {p.price > 0 && (
              <div className="buy-math">
                <MathCell label={t('pos.result')} value={signed(p.m.profit, flower)} className={tone(p.m.profit)} sub="FLOWER" />
                <MathCell label={t('pos.resultUsd')} value={p.m.profitUsd != null ? signed(p.m.profitUsd, usd) : '—'} className={tone(p.m.profitUsd)} sub={p.m.flowerMove != null ? t('pos.flowerMove', { n: pct(p.m.flowerMove) }) : t('pos.noRate')} />
                <MathCell label={t('buys.target', { n: goal * 100 })} value={`${flower(p.m.targetUsd ?? p.m.target)}${t('buys.perUnit')}`} className="sun" sub={p.m.targetUsd != null ? t('pos.inUsd') : t('pos.inFlower')} />
              </div>
            )}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>{t('buys.hint', { n: (tax.rate * 100).toFixed(1).replace('.', ',') })}</p>
      {openPos && <PositionSheet pos={openPos} m={openPos.m} cur={openPos.price} curUsd={curUsd} history={history} names={names} taxRate={openPos.taxRate} goal={goal} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- NFTs no inventário

function NftHoldings({ farm, rate, currency, history }) {
  const t = useT();
  const { data: nfts, loading } = useNfts();
  const rows = useMemo(() => {
    const owned = ownedNfts(farm, nfts);
    return nfts.filter(x => owned.has(x.key))
      .map(x => ({ ...x, qty: owned.get(x.key), total: owned.get(x.key) * x.floor, stats: nftStats(history?.nft?.[x.key], x.floor) }))
      .sort((a, b) => b.total - a.total);
  }, [farm, nfts, history]);
  const total = rows.reduce((s, r) => s + r.total, 0);
  if (loading && !nfts.length) return <div className="skeleton" style={{ height: 120, marginTop: 16 }} />;
  if (!rows.length) return null;
  return (
    <>
      <div className="section-head" style={{ marginTop: 22 }}><h2>{t('nft.mine')}</h2><span className="count">{t('nft.count', { n: rows.length })}</span></div>
      <div className="stat-grid">
        <div className="card stat"><small>{t('nft.floorValue')}</small><strong className="sun">{flower(total)}</strong></div>
        <div className="card stat"><small>{t('market.in', { cur: currency.toUpperCase() })}</small><strong>{rate ? money(total * rate, currency) : '—'}</strong></div>
        <div className="card stat"><small>{t('nft.withBoost')}</small><strong>{rows.filter(r => r.boost).length}</strong></div>
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {rows.map(r => (
          <div className="list-row" key={r.key}>
            <div className="thumb"><Thumb item={r} /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="title ellipsis">{r.qty > 1 ? `${num(r.qty)} × ` : ''}{r.name}</div>
              <div className="sub row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Delta v={r.stats.change24} label={r.stats.label24} /><Delta v={r.stats.change7} label={r.stats.label7} />
                <span className="ellipsis">{r.boost ? `⚡ ${r.boost}` : t(`nft.kind.${r.kind}`)}</span>
              </div>
            </div>
            <div className="val"><strong>{r.floor > 0 ? flower(r.total) : '—'}</strong><small>{r.floor > 0 && rate ? money(r.total * rate, currency) : t('nft.noFloor')}</small></div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- inventário

const INV_SORTS = ['value', 'up', 'down'];

/** Quanto o conjunto valia no ponto de referência, a partir da variação de cada item. */
function valueThen(rows, key) {
  let then = 0;
  let now = 0;
  for (const r of rows) {
    const c = r.stats[key];
    if (c == null || c <= -1) continue;
    now += r.total;
    then += r.total / (1 + c);
  }
  return now > 0 ? { change: now / then - 1, delta: now - then } : null;
}

export function Inventory({ farm, prices, rate, currency }) {
  const t = useT();
  const [sort, setSort] = useState('value');
  const { data: history } = usePriceHistory();
  const all = useMemo(() => {
    const p2p = prices?.p2p ?? {};
    const now = Date.now();
    return Object.entries(farm?.inventory ?? {})
      .map(([name, qty]) => ({ name, qty: Number(qty), unit: Number(p2p[name] ?? 0) }))
      .filter(r => r.qty > 0 && r.unit > 0)
      .map(r => ({ ...r, total: r.qty * r.unit, stats: itemStats(history, r.name, r.unit, now) }));
  }, [farm, prices, history]);
  const rows = useMemo(() => {
    const by = key => (a, b) => (b.stats[key] ?? -Infinity) - (a.stats[key] ?? -Infinity);
    if (sort === 'up') return all.filter(r => (r.stats.change24 ?? 0) > 0.0005).sort(by('change24'));
    if (sort === 'down') return all.filter(r => (r.stats.change24 ?? 0) < -0.0005).sort((a, b) => -by('change24')(a, b));
    return [...all].sort((a, b) => b.total - a.total);
  }, [all, sort]);
  const total = all.reduce((s, r) => s + r.total, 0);
  const d24 = valueThen(all, 'change24');
  const d7 = valueThen(all, 'change7');
  const label24 = all.find(r => r.stats.label24)?.stats.label24 ?? '24h';
  const label7 = all.find(r => r.stats.change7 != null)?.stats.label7 ?? '7d';

  if (!farm) return <Notice>{t('market.needFarm')}</Notice>;
  return (
    <>
      <div className="stat-grid">
        <div className="card stat"><small>{t('market.sellable')}</small><strong className="sun">{flower(total)}</strong><small>{rate ? money(total * rate, currency) : ''}</small></div>
        <div className="card stat"><small>{t('inv.change', { p: label24 })}</small><strong className={tone(d24?.change)}>{pct(d24?.change)}</strong><small>{d24 ? `${signed(d24.delta, flower)} FLOWER` : t('inv.noHistory')}</small></div>
        <div className="card stat"><small>{t('inv.change', { p: label7 })}</small><strong className={tone(d7?.change)}>{pct(d7?.change)}</strong><small>{d7 ? `${signed(d7.delta, flower)} FLOWER` : t('inv.noHistory')}</small></div>
      </div>
      <div className="chip-row" style={{ margin: '12px -16px 6px' }}>
        {INV_SORTS.map(id => <button key={id} className="chip" aria-pressed={sort === id} onClick={() => setSort(id)}>{t(`inv.sort.${id}`)}</button>)}
      </div>
      <p className="hint" style={{ margin: '0 2px 12px' }}>{t('market.estimate')}</p>
      {rows.length === 0 ? <Empty title={t('market.none')}>{t('price.noSignal')}</Empty> : (
        <div className="list">
          {rows.map(r => (
            <div className="list-row" key={r.name}>
              <div className="thumb"><ItemImg name={r.name} size={28} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title ellipsis">{r.name}</div>
                <div className="sub row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span>{num(r.qty)} × {flower(r.unit)}</span>
                  <Delta v={r.stats.change24} label={r.stats.label24} /><Delta v={r.stats.change7} label={r.stats.label7} />
                </div>
              </div>
              <div className="val">
                <strong>{flower(r.total)}</strong>
                <small>{rate ? money(r.total * rate, currency) : ''}</small>
              </div>
            </div>
          ))}
        </div>
      )}
      <NftHoldings farm={farm} rate={rate} currency={currency} history={history} />
    </>
  );
}
