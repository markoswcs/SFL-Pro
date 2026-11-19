// Aba Lucro: estratégia para ganhar FLOWER. O que vender (quanto e a que preço), o que comprar,
// os eventos do calendário, os avisos no celular e quanto a estratégia já rendeu.
// O app reconhece pela própria fazenda o que foi feito: anúncio aberto, venda, oferta e compra.
import { useMemo, useState } from 'react';
import { buySignal, calendarEvents, fullMoonPlan, NFT_TAX, nftBuySignal, openListing, openOffer, sellSignal, stockPlan, TRADE_LIMITS, weekStats } from '../../supabase/functions/_shared/strategy.js';
import { flower, num } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { enablePush, farmSales } from '../lib/push.js';
import { nftStats, resourceTax } from '../lib/market.js';
import { ownedNfts } from '../lib/nfts.js';
import { getSettings, setSettings } from '../lib/store.js';
import { locale, useT } from '../i18n.js';
import { Icon, ItemImg, Notice, Switch, useToast } from '../ui.jsx';
import { usePositions } from './MarketPrices.jsx';

const DAY = 86400_000;
const pct = v => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`);
const tone = v => (v == null || Math.abs(v) < 0.005 ? 'dim' : v > 0 ? 'leaf' : 'ember');
const price = v => num(v, v < 1 ? 4 : 2);
// Lucro com sinal e 2 casas (o flower() mostra casas demais em valores pequenos).
const signedF = v => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 2)}`;

/** Venda a partir do anúncio: recebido = preço − taxa. */
const saleOf = (id, l) => {
  const [item, qty] = Object.entries(l.items ?? {})[0] ?? ['?', 0];
  return { id, item, qty: Number(qty) || 0, sfl: Number(l.sfl ?? 0), tax: Number(l.tax ?? 0), at: l.fulfilledAt };
};

function Status({ children }) {
  return <span className="tag profit-ok">{children}</span>;
}

/** Interruptores das três categorias de aviso, ligados às preferências que vão ao servidor. */
function AlertSwitches({ settings, farm, goal }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cats = settings.prefs?.categories ?? {};
  const toggle = (id, v) => setSettings(s => ({
    prefs: { ...s.prefs, categories: { ...s.prefs.categories, [id]: v } },
    // Ligar um aviso começa a contar o lucro, se ainda não estava contando.
    ...(v && !s.strategy?.start ? { strategy: { start: Date.now(), balance: Number(farm?.balance ?? 0) } } : {}),
  }));
  async function turnOn() {
    setError(null);
    if (!settings.farmId) { setError(t('alerts.needFarm')); return; }
    setBusy(true);
    try {
      const endpoint = await enablePush({ farmId: settings.farmId, prefs: settings.prefs });
      setSettings({ pushEndpoint: endpoint });
      toast(t('alerts.enabled'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = [
    ['sellSignal', 'Flower', t('pr.sellOn'), t('pr.sellOnSub', { goal: Math.round(goal * 100) })],
    ['buySignal', 'Flower', t('pr.buyOn'), t('pr.buyOnSub')],
    ['calendar', 'Duskberry', t('pr.calOn'), t('pr.calOnSub')],
  ];
  return (
    <div className="section">
      <div className="section-head"><h2>{t('pr.alerts')}</h2></div>
      {!settings.pushEndpoint && (
        <div className="card row" style={{ marginBottom: 10 }}>
          <Icon name="bell" width="24" height="24" />
          <div className="grow sub">{t('pr.needPush')}</div>
          <button className="btn btn-sun small" onClick={turnOn} disabled={busy}>{t('pr.turnOn')}</button>
        </div>
      )}
      {error && <Notice kind="err">{error}</Notice>}
      <div className="list">
        {rows.map(([id, img, title, sub]) => (
          <div key={id} className="pref">
            <ItemImg name={img} size={28} />
            <div className="grow"><div className="title">{title}</div><div className="sub">{sub}</div></div>
            <Switch checked={cats[id] !== false && settings.prefs?.enabled !== false} onChange={v => toggle(id, v)} label={title} disabled={settings.prefs?.enabled === false} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Quanto a estratégia rendeu desde que começou a contar. */
function Result({ farm, settings, sales, positions, txs }) {
  const t = useT();
  const start = settings.strategy?.start;
  const startNow = () => setSettings({ strategy: { start: Date.now(), balance: Number(farm?.balance ?? 0) } });
  const r = useMemo(() => {
    if (!start) return null;
    const avg = new Map(positions.map(p => [p.item, p.avgUnit]));
    const after = sales.filter(s => s.at >= start);
    let received = 0;
    let cost = 0;
    for (const s of after) {
      received += s.sfl - s.tax;
      cost += s.qty * (avg.get(s.item) ?? 0);
    }
    const bought = txs.filter(x => x.at >= start);
    const boughtItems = new Set(bought.map(x => x.item));
    const open = positions.filter(p => boughtItems.has(p.item) && p.price > 0);
    return {
      sales: after.length, received, realized: received - cost,
      spent: bought.reduce((s, x) => s + x.sfl, 0), bought: bought.length,
      unrealized: open.reduce((s, p) => s + p.m.profit, 0),
      balance: Number(farm?.balance ?? 0) - (settings.strategy?.balance ?? 0),
    };
  }, [start, sales, positions, txs, farm, settings.strategy]);

  return (
    <div className="section">
      <div className="section-head">
        <h2>{t('pr.result')}</h2>
        {start && <span className="count">{t('pr.since', { date: new Date(start).toLocaleDateString(locale(getSettings().lang)) })}</span>}
        <span className="spacer" />
        {start && <button className="link-btn" style={{ color: 'var(--muted)' }} onClick={() => confirm(t('pr.restartAsk')) && startNow()}>{t('pr.restart')}</button>}
      </div>
      {!r ? (
        <div className="card row">
          <div className="grow"><div style={{ fontWeight: 800 }}>{t('pr.start')}</div><div className="sub">{t('pr.startSub')}</div></div>
          <button className="btn btn-sun small" onClick={startNow}>{t('pr.startBtn')}</button>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="card stat"><small>{t('pr.realized')}</small><strong className={tone(r.realized)}>{signedF(r.realized)}</strong><span className="sub">{t('pr.salesN', { n: r.sales, f: num(r.received, 2) })}</span></div>
            <div className="card stat"><small>{t('pr.open')}</small><strong className={tone(r.unrealized)}>{signedF(r.unrealized)}</strong><span className="sub">{t('pr.boughtN', { n: r.bought, f: num(r.spent, 2) })}</span></div>
            <div className="card stat"><small>{t('pr.balance')}</small><strong className={tone(r.balance)}>{signedF(r.balance)}</strong><span className="sub">{t('pr.balanceSub', { f: num(Number(farm?.balance ?? 0), 2) })}</span></div>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{t('pr.costNote')}</p>
        </>
      )}
    </div>
  );
}

/** O que vender: estoque parado, posições que bateram a meta e NFTs seus acima da média. */
function SellList({ farm, plan, positions, nftRows, sales, goal }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const soldToday = name => sales.some(s => s.item === name && s.at > Date.now() - DAY);
  const status = name => {
    const l = openListing(farm, name);
    if (l) return <Status>{t('pr.status.listed', { p: flower(Number(l.sfl ?? 0)) })}</Status>;
    if (soldToday(name)) return <Status>{t('pr.status.sold')}</Status>;
    return null;
  };
  const targets = positions.filter(p => p.price > 0 && p.qty > 0 && p.m.target > 0).sort((a, b) => b.price / b.m.target - a.price / a.m.target);
  const list = all ? plan.stock : plan.stock.slice(0, 8);
  const sig = r => (r.sell ? <span className="tag sell-tag">{t('pr.sig.sell')} {pct(r.above)}</span>
    : r.hold ? <span className="tag dim-tag">{t('pr.sig.hold')} {pct(r.above)}</span>
      : r.above != null ? <span className="tag">{t('pr.sig.ok')} {pct(r.above)}</span> : <span className="tag">{t('pr.noSignal')}</span>);
  return (
    <div className="section">
      <div className="section-head">
        <h2>{t('pr.sellNow')}</h2>
        <span className="count">{t('pr.stock', { f: flower(plan.stockTotal) })}</span>
      </div>
      {targets.length > 0 && (
        <>
          <h3 className="pref-group-title">{t('pr.targets', { goal: Math.round(goal * 100) })}</h3>
          <div className="list" style={{ marginBottom: 12 }}>
            {targets.map(p => {
              const hit = p.price >= p.m.target;
              return (
                <div key={p.item} className="list-row">
                  <div className="thumb"><ItemImg name={p.item} size={28} /></div>
                  <div className="grow">
                    <div className="title">{p.item} {hit ? <span className="tag sell-tag">{t('pr.sig.target')}</span> : null} {status(p.item)}</div>
                    <div className="sub">{t('pr.targetLine', { target: price(p.m.target), avg: price(p.avgUnit), now: price(p.price) })}</div>
                  </div>
                  <div className="val"><strong className={tone(p.m.profit)}>{signedF(p.m.profit)}</strong><small>{pct(p.m.pct)}</small></div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {plan.stock.length === 0 ? <p className="hint">{t('pr.noStock')}</p> : (
        <div className="list">
          {list.map(r => (
            <div key={r.name} className="list-row">
              <div className="thumb"><ItemImg name={r.name} size={28} /></div>
              <div className="grow">
                <div className="title">{num(r.qty, 1)} {r.name} {sig(r)} {status(r.name)}</div>
                <div className="sub">{t('pr.lot', { lot: num(r.lot, 0), price: price(r.price), net: flower(r.lotNet) })}{r.lots > 1 ? ` · ${t('pr.lots', { n: r.lots })}` : ''}</div>
              </div>
              <div className="val"><strong>{flower(r.total)}</strong><small>FLOWER</small></div>
            </div>
          ))}
        </div>
      )}
      {plan.stock.length > 8 && <button className="link-btn" style={{ marginTop: 8 }} onClick={() => setAll(v => !v)}>{all ? t('pr.less') : t('pr.more', { n: plan.stock.length - 8 })}</button>}
      {nftRows.length > 0 && (
        <>
          <h3 className="pref-group-title" style={{ marginTop: 14 }}>{t('pr.nftSell')}</h3>
          <div className="list">
            {nftRows.map(r => (
              <div key={r.key} className="list-row">
                <div className="thumb"><ItemImg name={r.name} size={28} /></div>
                <div className="grow">
                  <div className="title">{r.name} {sig(r)} {status(r.name)}</div>
                  <div className="sub">{t('pr.nftLine', { floor: flower(r.floor), net: flower(r.floor * (1 - NFT_TAX)) })}</div>
                </div>
                <div className="val"><strong>{flower(r.floor)}</strong><small>floor</small></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** O que comprar: itens e NFTs que a pessoa segue, com o sinal e o reconhecimento da compra. */
function WatchList({ farm, settings, prices, stats, nfts, history, txs, taxRate }) {
  const t = useT();
  const [text, setText] = useState('');
  const watch = settings.prefs?.watch ?? [];
  const byName = useMemo(() => new Map(nfts.map(n => [n.name.toLowerCase(), n])), [nfts]);
  const options = useMemo(() => [...new Set([...Object.keys(TRADE_LIMITS), ...nfts.map(n => n.name)])].sort(), [nfts]);
  const save = list => setSettings(s => ({ prefs: { ...s.prefs, watch: list } }));
  const add = () => {
    const raw = text.trim();
    if (!raw) return;
    const res = Object.keys(TRADE_LIMITS).find(n => n.toLowerCase() === raw.toLowerCase());
    const nft = !res && byName.get(raw.toLowerCase());
    if (!res && !nft) return;
    const entry = res ? { name: res, key: null, at: Date.now() } : { name: nft.name, key: nft.key, at: Date.now() };
    if (!watch.some(w => (w.key ?? w.name) === (entry.key ?? entry.name))) save([...watch, entry]);
    setText('');
  };
  const rows = watch.map(w => {
    if (w.key) {
      const n = nfts.find(x => x.key === w.key);
      const floor = n?.floor ?? 0;
      const st = nftStats(history?.nft?.[w.key], floor);
      const s = nftBuySignal(floor, st);
      return { ...w, price: floor, avg7: st.avg7, ...s };
    }
    const p = Number(prices?.p2p?.[w.name] ?? 0);
    const s = buySignal(p, stats[w.name], taxRate);
    return { ...w, price: p, avg7: stats[w.name]?.avg7, ...s };
  });
  const bought = w => txs.some(x => x.item === w.name && x.at >= (w.at ?? 0));
  return (
    <div className="section">
      <div className="section-head"><h2>{t('pr.watch')}</h2></div>
      <p className="hint" style={{ marginBottom: 8 }}>{t('pr.watchSub')}</p>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input grow" list="pr-watch-options" value={text} placeholder={t('pr.watchPh')} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <datalist id="pr-watch-options">{options.map(o => <option key={o} value={o} />)}</datalist>
        <button className="btn btn-sun small" onClick={add}>{t('pr.watchAdd')}</button>
      </div>
      {rows.length === 0 ? <p className="hint">{t('pr.watchEmpty')}</p> : (
        <div className="list">
          {rows.map(r => (
            <div key={r.key ?? r.name} className="list-row">
              <div className="thumb"><ItemImg name={r.name} size={28} /></div>
              <div className="grow">
                <div className="title">
                  {r.name}{' '}
                  {r.buy ? <span className="tag sell-tag">{t('pr.sig.buy')} {pct(r.below)}</span> : r.below != null ? <span className="tag">{t('pr.sig.wait')} {pct(r.below)}</span> : <span className="tag">{t('pr.noSignal')}</span>}{' '}
                  {openOffer(farm, r.name) ? <Status>{t('pr.status.offer')}</Status> : bought(r) ? <Status>{t('pr.status.bought')}</Status> : null}
                </div>
                <div className="sub">
                  {t('pr.watchLine', { price: price(r.price), avg: r.avg7 ? price(r.avg7) : '—' })}
                  {r.margin != null && r.margin > 0 ? ` · ${t('pr.margin', { p: pct(r.margin) })}` : ''}
                  {!r.key && TRADE_LIMITS[r.name] ? ` · ${t('pr.maxLot', { n: num(TRADE_LIMITS[r.name], 0) })}` : ''}
                </div>
              </div>
              <button className="icon-btn" aria-label={t('pr.remove')} title={t('pr.remove')} onClick={() => save(watch.filter(w => (w.key ?? w.name) !== (r.key ?? r.name)))}><Icon name="x" width="18" height="18" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Próximos eventos do calendário, com o plano da Lua Cheia. */
function Calendar({ farm, moon }) {
  const t = useT();
  const events = calendarEvents(farm).slice(0, 6);
  const when = at => {
    const d = Math.floor((at - Date.now()) / DAY);
    const date = new Date(at).toLocaleString(locale(getSettings().lang), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return at <= Date.now() ? t('pr.now') : d >= 1 ? t('pr.inDays', { n: d, date }) : t('pr.soon', { date });
  };
  const moonFruitPlanted = Object.values(farm?.fruitPatches ?? {}).some(p => ['Celestine', 'Lunara', 'Duskberry'].includes(p?.fruit?.name) && (p.fruit.plantedAt ?? 0) > Date.now() - 2 * DAY);
  const seedsHeld = moon.options.some(o => o.have > 0);
  if (!events.length) return null;
  return (
    <div className="section">
      <div className="section-head"><h2>{t('pr.events')}</h2></div>
      <div className="list">
        {events.map(e => (
          <div key={`${e.name}:${e.at}`} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="thumb"><ItemImg name={e.name === 'fullMoon' ? 'Duskberry' : 'Flower'} size={28} /></div>
            <div className="grow">
              <div className="title">
                {e.name === 'fullMoon' ? t('pr.fullMoon') : t('pr.doubleDelivery')} <span className="tag">{when(e.at)}</span>{' '}
                {e.name === 'fullMoon' && e.at <= Date.now() && (seedsHeld || moonFruitPlanted) ? <Status>{t('pr.status.bought')}</Status> : null}
              </div>
              {e.name === 'fullMoon' ? (
                <>
                  <div className="sub">{moon.buys.length ? t('pr.moonPlan', { buys: moon.buys.map(b => `${b.qty} ${b.seed}`).join(' + '), coins: num(moon.coins, 0), net: flower(moon.net) }) : t('pr.moonNone')}</div>
                  <div className="sub">{t('pr.moonRules', { h: moon.harvests })}</div>
                  {moon.unsold.length > 0 && <div className="sub">{t('pr.moonUnsold', { list: moon.unsold.map(u => `${num(u.qty, 1)} ${u.fruit} (${flower(u.net)} FLOWER)`).join(', ') })}</div>}
                </>
              ) : <div className="sub">{t('pr.ddHint')}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Profit({ data, settings }) {
  const t = useT();
  const { farm, land, prices, exchange } = data;
  const pos = usePositions({ farm, land, prices, settings, exchange });
  const { history, nfts, txs, positions, goal } = pos;
  const { data: serverSales } = useResource(`sales:${settings.farmId}`, () => farmSales(settings.farmId), { ttl: 120_000, enabled: !!settings.farmId });
  const taxRate = useMemo(() => resourceTax(farm, land).rate, [farm, land]);
  const stats = useMemo(() => weekStats(history), [history]);

  // Vendas: as guardadas pelo servidor + as que ainda estão na fazenda, sem repetir.
  const sales = useMemo(() => {
    const byId = new Map();
    for (const s of serverSales ?? []) byId.set(s.listing_id, { id: s.listing_id, item: s.item, qty: Number(s.qty), sfl: Number(s.sfl), tax: Number(s.tax ?? 0), at: Date.parse(s.sold_at) });
    for (const [id, l] of Object.entries(farm?.trades?.listings ?? {})) if (l?.fulfilledAt && !byId.has(id)) byId.set(id, saleOf(id, l));
    return [...byId.values()];
  }, [serverSales, farm]);

  const plan = useMemo(() => {
    const stock = stockPlan(farm, prices?.p2p, stats, taxRate);
    return { stock, stockTotal: stock.reduce((s, r) => s + r.total, 0) };
  }, [farm, prices, stats, taxRate]);
  const moon = useMemo(() => fullMoonPlan(farm, prices?.p2p, stats, taxRate), [farm, prices, stats, taxRate]);
  const nftRows = useMemo(() => {
    const owned = ownedNfts(farm, nfts);
    return nfts.filter(n => owned.has(n.key) && n.floor * (1 - NFT_TAX) >= 1).map(n => {
      const st = nftStats(history?.nft?.[n.key], n.floor);
      return { ...n, ...sellSignal(n.floor, st) };
    }).sort((a, b) => Number(b.sell) - Number(a.sell) || b.floor - a.floor).slice(0, 12);
  }, [farm, nfts, history]);

  if (!farm) return <Notice>{t('market.needFarm')}</Notice>;
  return (
    <>
      <AlertSwitches settings={settings} farm={farm} goal={goal} />
      <Result farm={farm} settings={settings} sales={sales} positions={positions} txs={txs} />
      <Calendar farm={farm} moon={moon} />
      <SellList farm={farm} plan={plan} positions={positions} nftRows={nftRows} sales={sales} goal={goal} />
      <WatchList farm={farm} settings={settings} prices={prices} stats={stats} nfts={nfts} history={history} txs={txs} taxRate={taxRate} />
      <p className="hint" style={{ marginTop: 16 }}>{t('pr.disclaimer')}</p>
    </>
  );
}
