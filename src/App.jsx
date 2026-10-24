import { useEffect, useMemo, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { extractTimers, groupTimers } from '../supabase/functions/_shared/farm-timers.js';
import { useGameData, useNow } from './lib/hooks.js';
import { enablePush, scheduleLocal } from './lib/push.js';
import { farmLink, SUPPORT } from './lib/farmInfo.js';
import { setSettings, useSettings } from './lib/store.js';
import { useT } from './i18n.js';
import { copyText, Icon, ItemImg, Sheet, ToastProvider, useToast } from './ui.jsx';
import Farm from './screens/Farm.jsx';
import Market from './screens/Market.jsx';
import Alerts from './screens/Alerts.jsx';
import Settings, { CredentialsForm } from './screens/Settings.jsx';

const TABS = [['farm', 'farm'], ['market', 'market'], ['alerts', 'bell'], ['settings', 'gear']];

function useInstall() {
  const [event, setEvent] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    const onPrompt = e => { e.preventDefault(); setEvent(e); };
    const onInstalled = () => { setInstalled(true); setEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  return { available: !!event && !installed, installed, prompt: async () => { await event?.prompt(); setEvent(null); } };
}

export function LanguagePicker() {
  const t = useT();
  return (
    <div className="lang-pick">
      <button onClick={() => setSettings({ lang: 'pt' })}><span className="flag">🇧🇷</span>Português</button>
      <button onClick={() => setSettings({ lang: 'en' })}><span className="flag">🇺🇸</span>English</button>
      <span className="sr-only">{t('lang.title')}</span>
    </div>
  );
}

function Welcome({ settings }) {
  const t = useT();
  if (!settings.lang) {
    return (
      <div className="onboard screen">
        <img className="logo" src="/icons/icon-192.png" alt="" width="84" height="84" />
        <div>
          <h1>SFL <b>Pro</b></h1>
          <p className="dim" style={{ marginTop: 10 }}>Escolha o idioma · Choose your language</p>
        </div>
        <LanguagePicker />
      </div>
    );
  }
  return (
    <div className="onboard screen">
      <img className="logo" src="/icons/icon-192.png" alt="" width="84" height="84" />
      <div>
        <h1>{t('onboard.title1')}<br /><b>{t('onboard.title2')}</b></h1>
        <p className="dim" style={{ marginTop: 10 }}>{t('onboard.text')}</p>
      </div>
      <ol className="steps">
        <li>{t('onboard.s1')}</li>
        <li>{t('onboard.s2')}</li>
        <li>{t('onboard.s3')}</li>
      </ol>
      <div className="card"><CredentialsForm settings={settings} compact /></div>
      <button className="link-btn" onClick={() => setSettings({ lang: null })}>🌐 {settings.lang === 'en' ? 'Português' : 'English'}</button>
    </div>
  );
}

function SupportSheet({ onClose }) {
  const t = useT();
  const toast = useToast();
  return (
    <Sheet open onClose={onClose} title={t('support.title')} icon={<Icon name="heart" width="26" height="26" style={{ color: '#ff5e7e' }} />}>
      <p className="dim" style={{ fontSize: 14 }}>{t('support.text')}</p>
      <a className="btn btn-sun btn-block" style={{ marginTop: 16 }} href={farmLink(SUPPORT.farmId)} target="_blank" rel="noreferrer">
        <ItemImg name="Sunflower" size={22} /> {t('support.visit')}
      </a>
      <p className="hint" style={{ textAlign: 'center', marginTop: 6 }}>Farm ID #{SUPPORT.farmId}</p>
      <h3 className="sheet-sub">{t('support.wallet')}</h3>
      <div className="wallet-box">
        <span className="net-badge"><i /> {t('support.network')}</span>
        <div className="wallet-addr">{SUPPORT.wallet}</div>
        <button className="btn btn-ghost" onClick={async () => { if (await copyText(SUPPORT.wallet)) toast(t('farm.copied')); }}>
          <Icon name="copy" width="18" height="18" /> {t('support.copy')}
        </button>
        <p className="hint" style={{ color: '#ffb4a3' }}>⚠️ {t('support.warn')}</p>
      </div>
      <p style={{ textAlign: 'center', marginTop: 16, fontWeight: 700 }}>{t('support.thanks')}</p>
    </Sheet>
  );
}

function Shell() {
  const settings = useSettings();
  const t = useT();
  const toast = useToast();
  const install = useInstall();
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') ?? 'farm');
  const [update, setUpdate] = useState(null);
  const [support, setSupport] = useState(false);
  const data = useGameData({ farmId: settings.farmId });
  const now = useNow(15_000);

  useEffect(() => { document.documentElement.lang = settings.lang === 'en' ? 'en' : 'pt-BR'; }, [settings.lang]);

  useEffect(() => {
    const updateSW = registerSW({ onNeedRefresh: () => setUpdate(() => () => updateSW(true)) });
  }, []);

  // Mensagens do service worker: clique numa notificação e renovação da inscrição de push.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = e => {
      if (e.data?.type === 'NAVIGATE') setTab(new URL(e.data.url).searchParams.get('tab') ?? 'farm');
      if (e.data?.type === 'RESUBSCRIBE' && settings.farmId && settings.pushEndpoint) {
        enablePush({ farmId: settings.farmId, prefs: settings.prefs }).then(endpoint => setSettings({ pushEndpoint: endpoint })).catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [settings.farmId, settings.prefs, settings.pushEndpoint]);

  const timers = useMemo(() => extractTimers(data.farm), [data.farm]);
  useEffect(() => {
    if (!settings.localAlerts || settings.pushEndpoint) return undefined;
    return scheduleLocal(timers, settings.prefs, { sound: settings.sound, lang: settings.lang });
  }, [timers, settings.prefs, settings.localAlerts, settings.sound, settings.lang, settings.pushEndpoint]);

  const readyCount = useMemo(() => groupTimers(timers).filter(g => g.readyAt <= now).reduce((n, g) => n + g.count, 0), [timers, now]);
  useEffect(() => {
    document.title = readyCount ? `(${readyCount}) SFL Pro` : 'SFL Pro — Sunflower Land';
    navigator.setAppBadge?.(readyCount || undefined)?.catch?.(() => {});
  }, [readyCount]);

  const go = id => {
    setTab(id);
    history.replaceState(null, '', id === 'farm' ? '/' : `/?tab=${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const needsSetup = !settings.farmId || !settings.lang;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src="/icons/icon-192.png" alt="" width="34" height="34" /> SFL <b>Pro</b></div>
        <span className="spacer" />
        {!needsSetup && (
          <span className={`sync-dot ${data.error ? 'err' : ''}`}><i /> {data.error ? t('top.error') : data.updatedAt ? t('top.live') : '…'}</span>
        )}
        <button className="support-btn" onClick={() => setSupport(true)}><Icon name="heart" /> <span>{t('top.support')}</span></button>
        {!needsSetup && (
          <button className={`icon-btn ${data.loading ? 'spin' : ''}`} aria-label={t('top.refresh')} onClick={() => { data.refresh(); toast(t('top.refreshing')); }}>
            <Icon name="refresh" />
          </button>
        )}
      </header>

      {update && (
        <div className="card install">
          <Icon name="download" width="22" height="22" />
          <div className="grow"><b>{t('update.available')}</b></div>
          <button className="btn btn-sun btn-sm" onClick={update}>{t('update.action')}</button>
        </div>
      )}

      {install.available && tab === 'farm' && !needsSetup && (
        <div className="card install">
          <img src="/icons/icon-192.png" alt="" />
          <div className="grow"><b>{t('install.title')}</b><div className="muted" style={{ fontSize: 13 }}>{t('install.text')}</div></div>
          <button className="btn btn-sun btn-sm" onClick={install.prompt}>{t('install.action')}</button>
        </div>
      )}

      <main>
        {needsSetup ? <Welcome settings={settings} /> : (
          <>
            {tab === 'farm' && <Farm data={data} settings={settings} onOpenSettings={() => go('settings')} />}
            {tab === 'market' && <Market data={data} settings={settings} />}
            {tab === 'alerts' && <Alerts data={data} settings={settings} />}
            {tab === 'settings' && <Settings settings={settings} install={install} />}
          </>
        )}
      </main>

      {!needsSetup && (
        <nav className="tabbar" aria-label="Menu">
          {TABS.map(([id, icon]) => (
            <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon name={icon} />
              {t(`tab.${id}`)}
              {id === 'farm' && readyCount > 0 && tab !== 'farm' && <span className="badge">{readyCount}</span>}
            </button>
          ))}
        </nav>
      )}

      {support && <SupportSheet onClose={() => setSupport(false)} />}
    </div>
  );
}

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}
