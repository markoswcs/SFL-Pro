import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, CROP_MS, FRUIT_MS, GREENHOUSE_MS, categoryLabel, extractTimers } from '../../supabase/functions/_shared/farm-timers.js';
import { disablePush, enablePush, getSubscription, isIOS, isStandalone, pushSupported, sendTest, syncPrefs } from '../lib/push.js';
import { setSettings } from '../lib/store.js';
import { useT } from '../i18n.js';
import { Icon, ItemImg, Notice, Switch, useToast } from '../ui.jsx';

// Itens conhecidos por categoria, para dar para escolher mesmo o que não está plantado agora.
const KNOWN = {
  crops: Object.keys(CROP_MS),
  fruits: Object.keys(FRUIT_MS),
  greenhouse: Object.keys(GREENHOUSE_MS),
  animals: ['Chicken', 'Cow', 'Sheep'],
};

function CategoryRow({ cat, prefs, names, lang, onToggleCat, onToggleItem }) {
  const t = useT();
  const label = categoryLabel(cat.id, lang);
  const [open, setOpen] = useState(false);
  const on = prefs.categories?.[cat.id] !== false;
  const offItems = names.filter(n => prefs.items?.[`${cat.id}:${n}`] === false).length;
  return (
    <>
      <div className="pref">
        <ItemImg name={cat.image} size={28} />
        <button className="grow" style={{ textAlign: 'left' }} onClick={() => names.length > 1 && setOpen(o => !o)} aria-expanded={open} disabled={names.length <= 1}>
          <div className="title row">{label} {names.length > 1 && <Icon name="chevron" className={`chev ${open ? 'open' : ''}`} />}</div>
          <div className="sub">{!on ? t('alerts.catOff') : offItems ? t('alerts.catSome', { on: names.length - offItems, total: names.length }) : names.length > 1 ? t('alerts.catAll') : t('alerts.catOn')}</div>
        </button>
        <Switch checked={on} onChange={v => onToggleCat(cat.id, v)} label={t('alerts.notify', { name: label })} disabled={prefs.enabled === false} />
      </div>
      {open && on && (
        <div className="pref-items">
          {names.map(n => {
            const itemOn = prefs.items?.[`${cat.id}:${n}`] !== false;
            return (
              <button key={n} className="item-toggle" aria-pressed={itemOn} onClick={() => onToggleItem(cat.id, n, !itemOn)}>
                <ItemImg name={n} size={22} /> <span className="ellipsis">{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Alerts({ data, settings }) {
  const t = useT();
  const toast = useToast();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const permission = pushSupported() ? Notification.permission : 'unsupported';
  const { prefs } = settings;

  useEffect(() => { getSubscription().then(s => setSubscribed(!!s)).catch(() => {}); }, []);

  // Envia as preferências ao servidor um instante depois da última mudança.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!subscribed || !settings.pushEndpoint) return;
    const timer = setTimeout(() => syncPrefs(settings.pushEndpoint, prefs).catch(e => setError(e.message)), 700);
    return () => clearTimeout(timer);
  }, [prefs, subscribed, settings.pushEndpoint]);

  const names = useMemo(() => {
    const present = {};
    for (const x of extractTimers(data.farm)) (present[x.category] ??= new Set()).add(x.name);
    return Object.fromEntries(CATEGORIES.map(c => [c.id, [...new Set([...(KNOWN[c.id] ?? []), ...(present[c.id] ?? [])])]]));
  }, [data.farm]);

  const updatePrefs = fn => setSettings(s => ({ prefs: fn(s.prefs) }));
  const toggleCat = (id, v) => updatePrefs(p => ({ ...p, categories: { ...p.categories, [id]: v } }));
  const toggleItem = (cat, name, v) => updatePrefs(p => {
    const items = { ...p.items };
    if (v) delete items[`${cat}:${name}`]; else items[`${cat}:${name}`] = false;
    return { ...p, items };
  });
  const setAll = v => updatePrefs(p => ({ ...p, categories: Object.fromEntries(CATEGORIES.map(c => [c.id, v])), items: v ? {} : p.items }));

  async function turnOn() {
    setError(null);
    if (!settings.farmId) { setError(t('alerts.needFarm')); return; }
    setBusy(true);
    try {
      const endpoint = await enablePush({ farmId: settings.farmId, prefs });
      setSettings({ pushEndpoint: endpoint });
      setSubscribed(true);
      toast(t('alerts.enabled'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await disablePush().catch(() => {});
    setSettings({ pushEndpoint: null });
    setSubscribed(false);
    setBusy(false);
    toast(t('alerts.disabled'));
  }

  async function test() {
    try {
      await sendTest(settings.pushEndpoint);
      toast(t('alerts.testSent'));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="screen">
      <div className="card push-card">
        <div className="row">
          <ItemImg name="Sunflower" size={34} />
          <div className="grow">
            <h2>{t('alerts.title')}</h2>
            <div className={`push-state ${subscribed ? 'on' : ''}`}><i /> {subscribed ? t('alerts.on') : t('alerts.off')}</div>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 14 }}>{t('alerts.text')}</p>
        {permission === 'unsupported' && <Notice kind="err">{t('alerts.unsupported')}</Notice>}
        {isIOS() && !isStandalone() && <Notice>{t('alerts.ios')}</Notice>}
        {permission === 'denied' && <Notice kind="err">{t('alerts.denied')}</Notice>}
        {error && <Notice kind="err">{error}</Notice>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {subscribed ? (
            <>
              <button className="btn btn-ghost grow" onClick={test} disabled={busy}>{t('alerts.test')}</button>
              <button className="btn btn-danger" onClick={turnOff} disabled={busy}>{t('alerts.disable')}</button>
            </>
          ) : (
            <button className="btn btn-sun btn-block" onClick={turnOn} disabled={busy || permission === 'unsupported'}>
              <Icon name="bell" width="20" height="20" /> {busy ? t('alerts.enabling') : t('alerts.enable')}
            </button>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>{t('alerts.what')}</h2>
          <span className="spacer" />
          <button className="link-btn" onClick={() => setAll(true)}>{t('alerts.allOn')}</button>
          <button className="link-btn" style={{ color: 'var(--muted)' }} onClick={() => setAll(false)}>{t('alerts.allOff')}</button>
        </div>
        <div className="list">
          <div className="pref">
            <Icon name="bell" width="26" height="26" />
            <div className="grow"><div className="title">{t('alerts.master')}</div><div className="sub">{t('alerts.masterSub')}</div></div>
            <Switch checked={prefs.enabled !== false} onChange={v => updatePrefs(p => ({ ...p, enabled: v }))} label={t('alerts.master')} />
          </div>
          {CATEGORIES.map(c => (
            <CategoryRow key={c.id} cat={c} prefs={prefs} names={names[c.id].length ? names[c.id] : [c.image]} lang={settings.lang} onToggleCat={toggleCat} onToggleItem={toggleItem} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>{t('alerts.open')}</h2></div>
        <div className="list">
          <div className="pref">
            <Icon name="check" width="26" height="26" />
            <div className="grow"><div className="title">{t('alerts.exact')}</div><div className="sub">{t('alerts.exactSub')}</div></div>
            <Switch checked={settings.localAlerts} onChange={v => setSettings({ localAlerts: v })} label={t('alerts.exact')} />
          </div>
          <div className="pref">
            <Icon name="bell" width="26" height="26" />
            <div className="grow"><div className="title">{t('alerts.sound')}</div><div className="sub">{t('alerts.soundSub')}</div></div>
            <Switch checked={settings.sound} onChange={v => setSettings({ sound: v })} label={t('alerts.sound')} />
          </div>
        </div>
      </div>
    </div>
  );
}
