import { useMemo, useState } from 'react';
import { CATEGORIES, categoryLabel, extractTimers, groupTimers, isWanted } from '../../supabase/functions/_shared/farm-timers.js';
import { clockTime, countdown, flower, money, num } from '../lib/format.js';
import { bumpkinImage, expansionInfo, farmLink, gemsToUsd, VIP_PRICES, vipInfo } from '../lib/farmInfo.js';
import { useNow } from '../lib/hooks.js';
import { setSettings } from '../lib/store.js';
import { locale, useT } from '../i18n.js';
import { copyText, Empty, Icon, ItemImg, Notice, Ring, Sheet, Switch, useToast } from '../ui.jsx';

const progressOf = (g, now) => (g.readyAt <= now ? 1 : g.startedAt ? (now - g.startedAt) / (g.readyAt - g.startedAt) : 0.5);

function TimerTile({ group, now, onOpen }) {
  const t = useT();
  const left = group.readyAt - now;
  const ready = left <= 0;
  return (
    <button className={`timer ${ready ? 'is-ready' : left < 10 * 60_000 ? 'is-soon' : ''}`} onClick={() => onOpen(group)} aria-label={`${group.name}: ${t('farm.tap')}`}>
      <Ring name={group.image} progress={progressOf(group, now)} ready={ready} qty={group.count} />
      <div className="grow">
        <div className="name ellipsis">{group.name}</div>
        <div className="meta">{ready ? t('farm.canCollect') : t('farm.at', { time: clockTime(group.readyAt) })}</div>
      </div>
      <div className="cd">{countdown(left)}</div>
    </button>
  );
}

function Profile({ farm, land, farmId }) {
  const t = useT();
  const toast = useToast();
  const level = land?.bumpkin?.level;
  const name = farm?.username ?? t('farm.yours');
  const island = farm?.island?.type ?? land?.land?.type;
  const vip = vipInfo(farm, land);
  const avatar = bumpkinImage(farm);
  const copy = async text => { if (await copyText(text)) toast(t('farm.copied')); };
  return (
    <div className="card profile">
      <div className="avatar bumpkin">
        {avatar ? <img className="px" src={avatar} alt="" width="64" height="64" /> : <ItemImg name="Sunflower" size={36} />}
      </div>
      <div className="grow">
        <h1 className="ellipsis">{name}</h1>
        <div className="tags">
          {level && <span className="tag lvl">{t('farm.level', { n: level })}</span>}
          {vip.active && <span className="tag vip">VIP</span>}
          {island && <span className="tag">{t('farm.island', { name: island })}</span>}
        </div>
        <div className="profile-actions">
          <button className="mini-btn" onClick={() => copy(farmId)}><Icon name="copy" /> #{farmId}</button>
          <button className="mini-btn" onClick={() => copy(farmLink(farmId))}><Icon name="link" /> {t('farm.copyLink')}</button>
          <a className="mini-btn" href={farmLink(farmId)} target="_blank" rel="noreferrer"><Icon name="external" /> {t('farm.visit')}</a>
        </div>
      </div>
    </div>
  );
}

function Balances({ farm, land, exchange, currency, onOpen }) {
  const t = useT();
  const l = land?.land;
  const flowerBalance = Number(farm?.balance ?? l?.balance ?? 0);
  const rate = exchange?.sfl?.[currency] ?? 0;
  return (
    <div className="balances">
      <button className="card balance main" onClick={() => onOpen('flower')}>
        <span className="label"><img src="/icons/flower_token.webp" alt="" width="18" height="18" /> FLOWER</span>
        <strong className="pixel">{flower(flowerBalance)}</strong>
        <small>{rate ? `≈ ${money(flowerBalance * rate, currency)} · 1 FLOWER = ${money(rate, currency)}` : t('farm.noRate')}</small>
      </button>
      <div className="card balance">
        <span className="label"><ItemImg name="Coins" size={18} /> {t('farm.coins')}</span>
        <strong>{num(farm?.coins ?? l?.coins ?? 0, 0)}</strong>
      </div>
      <div className="card balance">
        <span className="label"><ItemImg name="Gem" size={18} /> {t('farm.gems')}</span>
        <strong>{num(farm?.inventory?.Gem ?? l?.gem ?? 0, 0)}</strong>
      </div>
    </div>
  );
}

function FlowerCalc({ exchange, currency }) {
  const t = useT();
  const [value, setValue] = useState('');
  const amount = Number(String(value).replace(',', '.')) || 0;
  const rate = exchange?.sfl?.[currency] ?? 0;
  const usd = exchange?.sfl?.usd ?? 0;
  return (
    <div className="card calc">
      <label className="calc-in">
        <span className="sr-only">{t('calc.title')}</span>
        <input inputMode="decimal" placeholder="0" value={value} onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, ''))} />
        <b>FLOWER</b>
      </label>
      <div className="calc-out" aria-live="polite">
        <strong>{money(amount * rate, currency)}</strong>
        {currency !== 'usd' && <small>({money(amount * usd, 'usd')})</small>}
      </div>
    </div>
  );
}

function VipCard({ vip, onOpen }) {
  const t = useT();
  const label = vip.lifetime ? t('vip.lifetime') : !vip.active ? t('vip.inactive') : vip.daysLeft > 1 ? t('vip.daysLeft', { n: vip.daysLeft }) : vip.daysLeft === 1 ? t('vip.dayLeft') : t('vip.hoursLeft');
  const warn = vip.active && !vip.lifetime && vip.daysLeft < 7;
  return (
    <button className={`card info-card ${warn ? 'warn' : ''}`} onClick={onOpen}>
      <img className="px" src="https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/icons/vip.webp" alt="" width="34" height="34" />
      <div className="grow">
        <div className="kicker">{t('vip.title')}</div>
        <strong>{label}</strong>
      </div>
      <Icon name="chevronRight" className="chev-r" />
    </button>
  );
}

function ExpansionCard({ exp, onOpen }) {
  const t = useT();
  const sub = exp.building ? t('exp.building', { when: clockTime(exp.building.readyAt) })
    : exp.status === 'next' ? t('exp.ready', { n: Math.round(exp.progress * 100) })
    : exp.status === 'max' ? t('exp.max') : t('exp.formula');
  return (
    <button className="card info-card" onClick={onOpen}>
      <ItemImg name="Basic Land" size={34} />
      <div className="grow">
        <div className="kicker">{t('exp.title')}</div>
        <strong>{exp.max ? t('exp.lands', { n: exp.lands, max: exp.max }) : exp.lands}</strong>
        <div className="sub ellipsis">{sub}</div>
        {exp.status === 'next' && <div className="bar"><i style={{ width: `${exp.progress * 100}%` }} /></div>}
      </div>
      <Icon name="chevronRight" className="chev-r" />
    </button>
  );
}

function VipSheet({ vip, farm, exchange, currency, lang, onClose }) {
  const t = useT();
  const gems = Number(farm?.inventory?.Gem ?? 0);
  const flowerUsd = exchange?.sfl?.usd ?? 0;
  const usdToCur = currency === 'usd' ? 1 : (exchange?.sfl?.[currency] ?? 0) / (flowerUsd || 1);
  return (
    <Sheet open onClose={onClose} title={t('vip.title')}>
      <div className="stat-grid">
        <div className="card stat"><small>{t('vip.title')}</small><strong className={vip.active ? 'leaf' : 'ember'}>{vip.active ? t('vip.active') : t('vip.inactive')}</strong></div>
        {vip.expiresAt && !vip.lifetime && <div className="card stat"><small>{t('vip.expiresLabel')}</small><strong>{new Date(vip.expiresAt).toLocaleDateString(locale(lang))}</strong></div>}
        <div className="card stat"><small>{t('farm.gems')}</small><strong>{num(gems, 0)}</strong></div>
      </div>
      <h3 className="sheet-sub">{t('vip.buy')}</h3>
      <div className="list">
        {Object.entries(VIP_PRICES).map(([bundle, price]) => {
          const usd = gemsToUsd(price);
          return (
            <div className="list-row" key={bundle}>
              <div className="thumb"><ItemImg name="Gem" size={28} /></div>
              <div className="grow">
                <div className="title">{t(`vip.${bundle}`)}</div>
                <div className="sub">{gems >= price ? t('vip.enough') : t('vip.missing', { n: num(price - gems, 0) })}</div>
              </div>
              <div className="val">
                <strong>{num(price, 0)} 💎</strong>
                <small>{flowerUsd ? `≈ ${flower(usd / flowerUsd)} FLOWER · ${money(usd * usdToCur, currency)}` : money(usd, 'usd')}</small>
              </div>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>{t('vip.estimate')}</p>
    </Sheet>
  );
}

function ExpansionSheet({ exp, onClose }) {
  const t = useT();
  return (
    <Sheet open onClose={onClose} title={t('exp.title')}>
      <div className="stat-grid">
        <div className="card stat"><small>{t('exp.islandLabel')}</small><strong style={{ textTransform: 'capitalize' }}>{exp.island}</strong></div>
        <div className="card stat"><small>{t('exp.landsLabel')}</small><strong>{exp.max ? `${exp.lands}/${exp.max}` : exp.lands}</strong></div>
        {exp.status === 'next' && <div className="card stat"><small>{t('exp.nextLabel')}</small><strong>#{exp.next}</strong></div>}
      </div>
      {exp.building && <div style={{ marginTop: 12 }}><Notice kind="ok">{t('exp.building', { when: clockTime(exp.building.readyAt) })}</Notice></div>}
      {exp.status === 'max' && <div style={{ marginTop: 12 }}><Notice>{t('exp.max')}</Notice></div>}
      {exp.status === 'formula' && <div style={{ marginTop: 12 }}><Notice>{t('exp.formula')}</Notice></div>}
      {exp.status === 'next' && (
        <>
          <h3 className="sheet-sub">{t('exp.next', { n: exp.next })}</h3>
          <div className="list">
            {exp.resources.map(r => (
              <div className="list-row" key={r.name}>
                <div className="thumb"><ItemImg name={r.name} size={28} /></div>
                <div className="grow">
                  <div className="title">{r.name}</div>
                  <div className="bar"><i className={r.ok ? 'ok' : ''} style={{ width: `${Math.min(100, (r.have / r.need) * 100)}%` }} /></div>
                </div>
                <div className="val"><strong className={r.ok ? 'leaf' : ''}>{num(r.have, 0)}/{num(r.need, 0)}</strong></div>
              </div>
            ))}
            {exp.coins > 0 && (
              <div className="list-row">
                <div className="thumb"><ItemImg name="Coins" size={28} /></div>
                <div className="grow"><div className="title">{t('exp.coins')}</div>{exp.coins !== exp.coinsFull && <div className="sub">{t('exp.vipDiscount')}</div>}</div>
                <div className="val"><strong className={exp.coinsOk ? 'leaf' : ''}>{num(exp.coins, 0)}</strong></div>
              </div>
            )}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>{t('exp.time')}: {countdown(exp.seconds * 1000)} · {t('exp.levelReq', { n: exp.level })}</p>
        </>
      )}
    </Sheet>
  );
}

function FlowerSheet({ farm, land, exchange, onClose }) {
  const t = useT();
  const bal = Number(farm?.balance ?? land?.land?.balance ?? 0);
  const rows = ['brl', 'usd', 'eur'].filter(c => exchange?.sfl?.[c]);
  return (
    <Sheet open onClose={onClose} title="FLOWER">
      <div className="list">
        {rows.map(c => (
          <div className="list-row" key={c}>
            <div className="grow"><div className="title">{t('detail.balanceIn')} {c.toUpperCase()}</div><div className="sub">{t('detail.rate')}: 1 FLOWER = {money(exchange.sfl[c], c)}</div></div>
            <div className="val"><strong>{money(bal * exchange.sfl[c], c)}</strong></div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function TimerSheet({ group, farm, now, prefs, lang, onClose }) {
  const t = useT();
  const nodes = useMemo(() => extractTimers(farm).filter(x => x.category === group.category && x.name === group.name).sort((a, b) => a.readyAt - b.readyAt), [farm, group]);
  const wanted = isWanted(prefs, group.category, group.name);
  const toggle = v => setSettings(s => {
    const items = { ...s.prefs.items };
    if (v) delete items[`${group.category}:${group.name}`]; else items[`${group.category}:${group.name}`] = false;
    return { prefs: { ...s.prefs, items } };
  });
  return (
    <Sheet open onClose={onClose} title={group.name} icon={<ItemImg name={group.image} size={32} />}>
      <div className="stat-grid">
        <div className="card stat"><small>{t('detail.category')}</small><strong>{categoryLabel(group.category, lang)}</strong></div>
        <div className="card stat"><small>{t('farm.ready')}</small><strong className="leaf">{nodes.filter(n => n.readyAt <= now).length}/{nodes.length}</strong></div>
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        <div className="pref">
          <Icon name="bell" width="24" height="24" />
          <div className="grow"><div className="title">{t('detail.notify')}</div></div>
          <Switch checked={wanted} onChange={toggle} label={t('detail.notify')} disabled={prefs.categories?.[group.category] === false} />
        </div>
      </div>
      <h3 className="sheet-sub">{t('detail.nodes')}</h3>
      <div className="list">
        {nodes.slice(0, 80).map((n, i) => {
          const left = n.readyAt - now;
          return (
            <div className="list-row" key={n.key}>
              <Ring name={n.image} progress={progressOf(n, now)} ready={left <= 0} />
              <div className="grow"><div className="title">#{i + 1}</div><div className="sub">{left <= 0 ? t('farm.canCollect') : t('farm.at', { time: clockTime(n.readyAt) })}</div></div>
              <div className="val"><strong className={left <= 0 ? 'leaf' : ''}>{countdown(left)}</strong></div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

export default function Farm({ data, settings, onOpenSettings }) {
  const t = useT();
  const now = useNow(1000);
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null);
  const { farm, land, exchange, error, loading } = data;
  const lang = settings.lang ?? 'pt';
  const minute = Math.floor(now / 60_000);

  const groups = useMemo(() => {
    // Tudo o que já está pronto do mesmo item vira um card só, não importa quando ficou pronto.
    const out = [];
    const at = minute * 60_000;
    for (const g of groupTimers(extractTimers(farm))) {
      const same = g.readyAt <= at && out.find(x => x.readyAt <= at && x.category === g.category && x.name === g.name);
      if (same) { same.count += g.count; same.keys.push(...g.keys); } else out.push({ ...g, keys: [...g.keys] });
    }
    return out;
  }, [farm, minute]);

  const vip = vipInfo(farm, land, now);
  const exp = useMemo(() => (farm ? expansionInfo(farm, vip.active) : null), [farm, vip.active]);
  const readyCount = groups.filter(g => g.readyAt <= now).reduce((n, g) => n + g.count, 0);
  const upcoming = groups.find(g => g.readyAt > now);
  const presentCats = CATEGORIES.filter(c => groups.some(g => g.category === c.id));
  const visible = groups.filter(g => filter === 'all' || (filter === 'ready' ? g.readyAt <= now : g.category === filter));
  const byCat = presentCats
    .map(c => ({ ...c, items: visible.filter(g => g.category === c.id) }))
    .filter(c => c.items.length)
    .sort((a, b) => a.items[0].readyAt - b.items[0].readyAt);

  return (
    <div className="screen">
      <div className="hero">
        <Profile farm={farm} land={land} farmId={settings.farmId} />
        <Balances farm={farm} land={land} exchange={exchange} currency={settings.currency} onOpen={setSheet} />
      </div>
      <div className="section" style={{ marginTop: 12 }}><FlowerCalc exchange={exchange} currency={settings.currency} /></div>

      {error && (
        <div className="section">
          <Notice kind="err"><b>{error.message}</b>{' '}{error.kind === 'not-found' && <button className="link-btn" onClick={onOpenSettings}>{t('farm.fixId')}</button>}</Notice>
        </div>
      )}

      {farm && (
        <div className="section info-row">
          <VipCard vip={vip} onOpen={() => setSheet('vip')} />
          {exp && <ExpansionCard exp={exp} onOpen={() => setSheet('exp')} />}
        </div>
      )}

      {farm && upcoming && (
        <div className="section">
          <button className="card next" onClick={() => setSheet(upcoming)}>
            <Ring name={upcoming.image} progress={progressOf(upcoming, now)} qty={upcoming.count} />
            <div className="grow">
              <div className="kicker">{t('farm.next')}</div>
              <h3 className="ellipsis">{upcoming.name}</h3>
              <div className="muted" style={{ fontSize: 13 }}>{categoryLabel(upcoming.category, lang)}</div>
            </div>
            <div>
              <div className="big">{countdown(upcoming.readyAt - now)}</div>
              <div className="at">{t('farm.at', { time: clockTime(upcoming.readyAt) })}</div>
            </div>
          </button>
        </div>
      )}

      {farm && (
        <div className="section">
          <div className="section-head">
            <h2>{t('farm.timers')}</h2>
            <span className="count">{t('farm.total', { n: groups.reduce((n, g) => n + g.count, 0) })}</span>
          </div>
          <div className="chip-row" role="toolbar">
            <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('farm.all')}</button>
            <button className="chip" aria-pressed={filter === 'ready'} onClick={() => setFilter('ready')}>
              <Icon name="check" width="16" height="16" /> {t('farm.ready')} <span className="n">{readyCount}</span>
            </button>
            {presentCats.map(c => (
              <button key={c.id} className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                <ItemImg name={c.image} size={18} /> {categoryLabel(c.id, lang)}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            {byCat.length === 0 && <Empty title={t('farm.empty')}>{t('farm.emptyText')}</Empty>}
            {byCat.map(c => {
              const ready = c.items.filter(g => g.readyAt <= now).reduce((n, g) => n + g.count, 0);
              return (
                <div className="cat-block" key={c.id}>
                  <div className="cat-title">
                    <ItemImg name={c.image} size={22} /> {categoryLabel(c.id, lang)}
                    {ready > 0 && <span className="pill">{t(ready > 1 ? 'farm.readyNp' : 'farm.readyN', { n: ready })}</span>}
                  </div>
                  <div className="timer-grid">
                    {c.items.map(g => <TimerTile key={g.keys[0]} group={g} now={now} onOpen={setSheet} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!farm && loading && (
        <div className="section timer-grid">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      )}

      {sheet === 'vip' && <VipSheet vip={vip} farm={farm} exchange={exchange} currency={settings.currency} lang={lang} onClose={() => setSheet(null)} />}
      {sheet === 'exp' && exp && <ExpansionSheet exp={exp} onClose={() => setSheet(null)} />}
      {sheet === 'flower' && <FlowerSheet farm={farm} land={land} exchange={exchange} onClose={() => setSheet(null)} />}
      {sheet && typeof sheet === 'object' && <TimerSheet group={sheet} farm={farm} now={now} prefs={settings.prefs} lang={lang} onClose={() => setSheet(null)} />}
    </div>
  );
}
