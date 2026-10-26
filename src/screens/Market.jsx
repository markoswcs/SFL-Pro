import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { flower, money, num, timeAgo } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { setSettings } from '../lib/store.js';
import { locale, useT } from '../i18n.js';
import { Empty, Icon, ItemImg, Notice } from '../ui.jsx';

const TABS = ['prices', 'inventory', 'sales', 'news'];

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search">
      <span className="sr-only">{placeholder}</span>
      <Icon name="search" />
      <input className="input" type="search" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Prices({ prices, rate, currency, favorites }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('fav');
  const rows = useMemo(() => {
    const list = Object.entries(prices?.p2p ?? {}).map(([name, p]) => ({ name, p: Number(p) }));
    const filtered = list.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
    const fav = new Set(favorites);
    const sorters = {
      fav: (a, b) => (fav.has(b.name) - fav.has(a.name)) || a.name.localeCompare(b.name),
      high: (a, b) => b.p - a.p,
      az: (a, b) => a.name.localeCompare(b.name),
    };
    return filtered.sort(sorters[sort]);
  }, [prices, q, sort, favorites]);

  const toggleFav = name => setSettings(s => ({ favorites: s.favorites.includes(name) ? s.favorites.filter(f => f !== name) : [...s.favorites, name] }));

  if (!prices) return <div className="skeleton" style={{ height: 320 }} />;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder={t('market.search')} />
      <div className="chip-row" style={{ margin: '12px -16px' }}>
        {[['fav', t('market.favFirst')], ['high', t('market.expensive')], ['az', t('market.az')]].map(([id, label]) => (
          <button key={id} className="chip" aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>
        ))}
      </div>
      {rows.length === 0 ? <Empty title={t('market.none')}>{t('market.noneText')}</Empty> : (
        <div className="list">
          {rows.map(r => (
            <div className="list-row" key={r.name}>
              <div className="thumb"><ItemImg name={r.name} size={28} /></div>
              <div className="grow">
                <div className="title ellipsis">{r.name}</div>
                <div className="sub">{t('market.perUnit')}</div>
              </div>
              <div className="val">
                <strong>{flower(r.p)}</strong>
                <small>{rate ? money(r.p * rate, currency) : 'FLOWER'}</small>
              </div>
              <button className="fav" aria-pressed={favorites.includes(r.name)} aria-label={t('market.fav', { name: r.name })} onClick={() => toggleFav(r.name)}>
                <Icon name="star" fill={favorites.includes(r.name) ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Inventory({ farm, prices, rate, currency }) {
  const t = useT();
  const rows = useMemo(() => {
    const p2p = prices?.p2p ?? {};
    return Object.entries(farm?.inventory ?? {})
      .map(([name, qty]) => ({ name, qty: Number(qty), unit: Number(p2p[name] ?? 0) }))
      .filter(r => r.qty > 0 && r.unit > 0)
      .map(r => ({ ...r, total: r.qty * r.unit }))
      .sort((a, b) => b.total - a.total);
  }, [farm, prices]);
  const total = rows.reduce((s, r) => s + r.total, 0);

  if (!farm) return <Notice>{t('market.needFarm')}</Notice>;
  return (
    <>
      <div className="stat-grid">
        <div className="card stat"><small>{t('market.sellable')}</small><strong className="sun">{flower(total)}</strong></div>
        <div className="card stat"><small>{t('market.in', { cur: currency.toUpperCase() })}</small><strong>{rate ? money(total * rate, currency) : '—'}</strong></div>
        <div className="card stat"><small>{t('market.priced')}</small><strong>{rows.length}</strong></div>
      </div>
      <p className="hint" style={{ margin: '10px 2px 14px' }}>{t('market.estimate')}</p>
      <div className="list">
        {rows.map(r => (
          <div className="list-row" key={r.name}>
            <div className="thumb"><ItemImg name={r.name} size={28} /></div>
            <div className="grow">
              <div className="title ellipsis">{r.name}</div>
              <div className="sub">{num(r.qty)} × {flower(r.unit)}</div>
            </div>
            <div className="val">
              <strong>{flower(r.total)}</strong>
              <small>{rate ? money(r.total * rate, currency) : ''}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Sales({ farm, rate, currency, lang }) {
  const t = useT();
  const rows = useMemo(() => Object.entries(farm?.trades?.listings ?? {})
    .map(([id, l]) => {
      const [name, qty] = Object.entries(l.items ?? {})[0] ?? ['?', 0];
      return { id, name, qty: Number(qty), sfl: Number(l.sfl ?? 0), got: Math.max(0, Number(l.sfl ?? 0) - Number(l.tax ?? 0)), soldAt: l.fulfilledAt, createdAt: l.createdAt };
    })
    .sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0) || b.createdAt - a.createdAt), [farm]);
  if (!farm) return <Notice>{t('market.needFarm')}</Notice>;
  const sold = rows.filter(r => r.soldAt);
  const open = rows.filter(r => !r.soldAt);
  const received = sold.reduce((s, r) => s + r.got, 0);
  const when = ts => new Date(ts).toLocaleString(locale(lang), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const Row = ({ r }) => (
    <div className="list-row">
      <div className="thumb"><ItemImg name={r.name} size={28} /></div>
      <div className="grow">
        <div className="title ellipsis">{num(r.qty)} {r.name}</div>
        <div className="sub">{r.soldAt ? t('sales.soldAt', { when: when(r.soldAt) }) : t('sales.listedAt', { when: when(r.createdAt) })}</div>
      </div>
      <div className="val">
        <strong className={r.soldAt ? 'leaf' : ''}>{r.soldAt ? '+' : ''}{flower(r.soldAt ? r.got : r.sfl)}</strong>
        <small>{rate ? money((r.soldAt ? r.got : r.sfl) * rate, currency) : 'FLOWER'}</small>
      </div>
    </div>
  );
  return (
    <>
      <div className="stat-grid">
        <div className="card stat"><small>{t('sales.toClaim')}</small><strong className="sun">{flower(received)}</strong></div>
        <div className="card stat"><small>{t('market.in', { cur: currency.toUpperCase() })}</small><strong>{rate ? money(received * rate, currency) : '—'}</strong></div>
        <div className="card stat"><small>{t('sales.open')}</small><strong>{open.length}</strong></div>
      </div>
      <p className="hint" style={{ margin: '10px 2px 14px' }}>{t('sales.hint')}</p>
      {sold.length > 0 && <><h3 className="sheet-sub">{t('sales.sold')}</h3><div className="list">{sold.map(r => <Row key={r.id} r={r} />)}</div></>}
      {open.length > 0 && <><h3 className="sheet-sub">{t('sales.listed')}</h3><div className="list">{open.map(r => <Row key={r.id} r={r} />)}</div></>}
      {!rows.length && <Empty image="Flower" title={t('sales.none')} />}
    </>
  );
}

function News() {
  const t = useT();
  const { data, error, loading } = useResource('news', () => api.community('discordAnnouncements'), { ttl: 300_000 });
  if (error) return <Notice kind="err">{error.message}</Notice>;
  if (loading && !data) return <div className="skeleton" style={{ height: 240 }} />;
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  if (!list.length) return <Empty title={t('market.noNews')} />;
  return (
    <div className="news">
      {list.slice(0, 30).map((n, i) => {
        // O id do Discord carrega a data da mensagem (snowflake).
        const at = n.timestamp ? new Date(n.timestamp).getTime() : n.id ? Number((BigInt(n.id) >> 22n) + 1420070400000n) : 0;
        const text = String(n.content ?? '').replace(/<a?:(\w+):\d+>/g, '').replace(/<@&?\d+>/g, '@').replace(/\*\*|__|~~/g, '').trim();
        return (
          <article className="card" key={n.id ?? i}>
            <div className="row"><h3 className="grow ellipsis">#{n.channelName ?? 'news'}</h3>{at > 0 && <time>{timeAgo(at)}</time>}</div>
            <p>{text.length > 700 ? `${text.slice(0, 700)}…` : text}</p>
            {n.url && <a href={n.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700 }}>{t('market.openDiscord')}</a>}
          </article>
        );
      })}
    </div>
  );
}

export default function Market({ data, settings }) {
  const t = useT();
  const [tab, setTab] = useState(() => (new URLSearchParams(location.search).get('view') === 'sales' ? 'sales' : 'prices'));
  const rate = data.exchange?.sfl?.[settings.currency] ?? 0;
  return (
    <div className="screen">
      <div className="section-head" style={{ marginTop: 6 }}>
        <h2>{t('market.title')}</h2>
        <span className="count">{data.prices ? t('market.items', { n: Object.keys(data.prices.p2p ?? {}).length }) : ''}</span>
        <span className="spacer" />
        {rate > 0 && <span className="count">1 FLOWER = {money(rate, settings.currency)}</span>}
      </div>
      <div className="chip-row" role="tablist" style={{ marginBottom: 14 }}>
        {TABS.map(id => (
          <button key={id} role="tab" className="chip" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{t(`market.${id}`)}</button>
        ))}
      </div>
      {tab === 'prices' && <Prices prices={data.prices} rate={rate} currency={settings.currency} favorites={settings.favorites} />}
      {tab === 'inventory' && <Inventory farm={data.farm} prices={data.prices} rate={rate} currency={settings.currency} />}
      {tab === 'sales' && <Sales farm={data.farm} rate={rate} currency={settings.currency} lang={settings.lang} />}
      {tab === 'news' && <News />}
    </div>
  );
}
