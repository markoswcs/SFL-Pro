import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { num, timeAgo } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { setSettings } from '../lib/store.js';
import { GENESIS, YAKKA_DATES, YAKKA_LINKS } from '../lib/yakkamon.js';

const full = (n, lang) => Number(n ?? 0).toLocaleString(locale(lang));
import { locale, useT } from '../i18n.js';
import { Empty, Icon, Notice } from '../ui.jsx';

const useLeaderboard = () => useResource('yakka-lb', () => api.yakkaLeaderboard(), { ttl: 120_000 });

function Creature({ c, lang, size = 56 }) {
  return <img className="px yk-mon" src={c.img} alt={c.name} width={size} height={size} loading="lazy" />;
}

/** Posição do treinador salvo no top 100 (a API pública não busca além disso). */
function TrainerCard({ settings, board }) {
  const t = useT();
  const [name, setName] = useState(settings.yakkaName ?? '');
  const saved = settings.yakkaName?.trim().toLowerCase();
  const entry = saved ? board?.entries?.find(e => e.name?.toLowerCase() === saved) : null;
  return (
    <div className="card yk-trainer">
      <div className="kicker">{t('yk.trainer')}</div>
      {saved ? (
        <div className="row" style={{ marginTop: 6 }}>
          <div className="grow">
            <h3 className="ellipsis">{settings.yakkaName}</h3>
            <div className="sub dim">{entry ? t('yk.rankOf', { rank: entry.rank, total: num(board.playerCount, 0) }) : board ? t('yk.notTop') : '…'}</div>
          </div>
          {entry && <strong className="yk-points">{full(entry.points, settings.lang)}<small>{t('yk.points')}</small></strong>}
          <button className="link-btn" onClick={() => setSettings({ yakkaName: '' })}>{t('yk.change')}</button>
        </div>
      ) : (
        <form className="row" style={{ marginTop: 8 }} onSubmit={e => { e.preventDefault(); if (name.trim()) setSettings({ yakkaName: name.trim() }); }}>
          <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder={t('yk.namePlaceholder')} maxLength={40} />
          <button className="btn btn-sun btn-sm" type="submit">{t('form.save')}</button>
        </form>
      )}
      <p className="hint" style={{ marginTop: 8 }}>{t('yk.trainerHint')}</p>
    </div>
  );
}

export function YakkaHome({ settings }) {
  const t = useT();
  const lang = settings.lang ?? 'pt';
  const { data: board } = useLeaderboard();
  // As datas oficiais são dias em UTC; sem o fuso fixo, no Brasil cairiam no dia anterior.
  const date = ts => new Date(ts).toLocaleDateString(locale(lang), { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const now = Date.now();
  return (
    <div className="screen">
      <div className="card yk-hero">
        <div className="yk-hero-mons">{GENESIS.slice(0, 4).map(c => <Creature key={c.name} c={c} size={48} />)}</div>
        <h1>Yakkamon</h1>
        <p className="dim">{t('yk.tagline')}</p>
        <div className="yk-status"><i /> {t('yk.status')}</div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 14 }}>
          <a className="btn btn-sun grow" href={YAKKA_LINKS.play} target="_blank" rel="noreferrer"><Icon name="external" width="18" height="18" /> {t('yk.play')}</a>
          <a className="btn btn-ghost" href={YAKKA_LINKS.docs} target="_blank" rel="noreferrer">{t('yk.docs')}</a>
        </div>
      </div>

      <div className="section">
        <div className="stat-grid">
          <div className="card stat"><small>{t('yk.players')}</small><strong className="sun">{board ? num(board.playerCount, 0) : '…'}</strong></div>
          <div className="card stat"><small>{t('yk.top1')}</small><strong className="ellipsis">{board?.entries?.[0]?.name ?? '…'}</strong></div>
          <div className="card stat"><small>{t('yk.updated')}</small><strong>{board?.generatedAt ? timeAgo(board.generatedAt) : '…'}</strong></div>
        </div>
      </div>

      <div className="section"><TrainerCard settings={settings} board={board} /></div>

      <div className="section">
        <div className="section-head"><h2>{t('yk.dates')}</h2></div>
        <div className="list">
          {YAKKA_DATES.map(d => {
            const done = d.at && d.at <= now;
            return (
              <div className="list-row" key={d.key}>
                <span className={`yk-dot ${done ? 'done' : ''}`} aria-hidden="true" />
                <div className="grow"><div className="title">{t(`yk.date.${d.key}`)}</div><div className="sub">{t(`yk.dateSub.${d.key}`)}</div></div>
                <div className="val"><strong className={done ? 'leaf' : ''}>{d.at ? date(d.at) : t('yk.tba')}</strong></div>
              </div>
            );
          })}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{t('yk.datesHint')}</p>
      </div>

      <div className="section">
        <div className="section-head"><h2>{t('yk.links')}</h2></div>
        <div className="list">
          {[['deposits', YAKKA_LINKS.deposits], ['discord', YAKKA_LINKS.discord], ['x', YAKKA_LINKS.x], ['collection', YAKKA_LINKS.collection]].map(([k, href]) => (
            <a className="list-row" key={k} href={href} target="_blank" rel="noreferrer">
              <div className="grow"><div className="title">{t(`yk.link.${k}`)}</div></div>
              <Icon name="external" width="18" height="18" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function YakkaRank({ settings }) {
  const t = useT();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useLeaderboard();
  const mine = settings.yakkaName?.trim().toLowerCase();
  const rows = useMemo(() => (data?.entries ?? []).filter(e => e.name?.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <div className="screen">
      <div className="section-head" style={{ marginTop: 6 }}>
        <h2>{t('yk.ranking')}</h2>
        <span className="count">{data ? t('yk.of', { n: num(data.playerCount, 0) }) : ''}</span>
        <span className="spacer" />
        <button className="link-btn" onClick={reload}>{t('update.action')}</button>
      </div>
      <p className="hint" style={{ margin: '0 2px 12px' }}>{t('yk.rankHint')}{data?.generatedAt ? ` · ${t('yk.updatedAgo', { ago: timeAgo(data.generatedAt) })}` : ''}</p>
      <label className="search">
        <span className="sr-only">{t('yk.search')}</span>
        <Icon name="search" />
        <input className="input" type="search" value={q} placeholder={t('yk.search')} onChange={e => setQ(e.target.value)} />
      </label>
      <div style={{ marginTop: 12 }}>
        {error && <Notice kind="err">{error.message}</Notice>}
        {loading && !data && <div className="skeleton" style={{ height: 320 }} />}
        {data && !rows.length && <Empty title={t('market.none')}>{t('yk.notFound')}</Empty>}
        {rows.length > 0 && (
          <div className="list">
            {rows.map(e => (
              <div className={`list-row ${mine && e.name?.toLowerCase() === mine ? 'yk-me' : ''}`} key={e.rank}>
                <span className={`yk-rank r${Math.min(e.rank, 4)}`}>{e.rank}</span>
                <div className="grow"><div className="title ellipsis">{e.name}</div></div>
                <div className="val"><strong>{full(e.points, settings.lang)}</strong><small>{t('yk.points')}</small></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function YakkaDex({ settings }) {
  const t = useT();
  const lang = settings.lang === 'en' ? 'en' : 'pt';
  return (
    <div className="screen">
      <div className="section-head" style={{ marginTop: 6 }}><h2>Yakkapedia</h2><span className="count">Genesis</span></div>
      <p className="hint" style={{ margin: '0 2px 12px' }}>{t('yk.dexHint')}</p>
      <div className="yk-dex">
        {GENESIS.map(c => (
          <article className="card yk-card" key={c.name}>
            <Creature c={c} lang={lang} size={72} />
            <div className="grow">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <h3>{c.name}</h3>
                <span className={`tag yk-${c.rarity}`}>{t(`yk.rarity.${c.rarity}`)}</span>
                <span className="tag">{c.type}</span>
              </div>
              <p className="dim" style={{ fontSize: 14, marginTop: 6 }}>{c.ability[lang]}</p>
              <div className="sub muted" style={{ marginTop: 6, fontSize: 13 }}>{t('yk.supply', { n: num(c.supply, 0) })} · {c.ids}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
