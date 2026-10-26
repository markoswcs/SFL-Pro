import { useState } from 'react';
import { api } from '../lib/api.js';
import { disablePush, enablePush, getSubscription, syncPrefs } from '../lib/push.js';
import { getSettings, resetSettings, setSettings } from '../lib/store.js';
import { useT } from '../i18n.js';
import { Icon, Notice, useToast } from '../ui.jsx';

export function CredentialsForm({ settings, onSaved, compact = false }) {
  const t = useT();
  const toast = useToast();
  const [farmId, setFarmId] = useState(settings.farmId);
  const [state, setState] = useState({ busy: false, error: null, ok: null });

  async function save(e) {
    e.preventDefault();
    const id = farmId.trim().replace(/\D/g, '');
    if (!id) { setState({ busy: false, error: t('form.required'), ok: null }); return; }
    setState({ busy: true, error: null, ok: null });
    try {
      const farm = await api.farm(id);
      setState({ busy: false, error: null, ok: t('form.found', { name: farm?.username ? `: ${farm.username}` : '' }) });
      const changed = id !== settings.farmId;
      setSettings({ farmId: id });
      // Trocou de fazenda com o push ativo: reinscreve este aparelho na fazenda nova.
      if (changed && settings.pushEndpoint && (await getSubscription())) {
        await enablePush({ farmId: id, prefs: settings.prefs }).catch(() => {});
      }
      toast(t('form.saved'));
      onSaved?.();
    } catch (err) {
      setState({ busy: false, error: err.message, ok: null });
    }
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
      <div className="field">
        <label htmlFor="farm-id">{t('form.farmId')}</label>
        <input id="farm-id" className="input" inputMode="numeric" autoComplete="off" placeholder="2601876753363557" value={farmId} onChange={e => setFarmId(e.target.value)} />
        <span className="hint">{t('form.farmIdHint')}</span>
      </div>
      {state.error && <Notice kind="err">{state.error}</Notice>}
      {state.ok && <Notice kind="ok">{state.ok}</Notice>}
      <button className="btn btn-sun" disabled={state.busy}>{state.busy ? t('form.searching') : compact ? t('form.enter') : t('form.save')}</button>
    </form>
  );
}

export default function Settings({ settings, install }) {
  const t = useT();
  const toast = useToast();

  const changeLang = lang => {
    setSettings({ lang });
    // As notificações push passam a vir no idioma novo.
    if (settings.pushEndpoint) syncPrefs(settings.pushEndpoint, getSettings().prefs).catch(() => {});
  };

  return (
    <div className="screen">
      <div className="section-head" style={{ marginTop: 6 }}><h2>{t('settings.title')}</h2></div>

      <div className="card"><CredentialsForm settings={settings} /></div>

      <div className="section">
        <div className="section-head"><h2>{t('settings.prefs')}</h2></div>
        <div className="list">
          <div className="pref">
            <Icon name="globe" width="26" height="26" />
            <div className="grow"><div className="title">{t('settings.language')}</div><div className="sub">{t('settings.languageSub')}</div></div>
            <select className="input" style={{ width: 'auto', minHeight: 40 }} value={settings.lang ?? 'pt'} onChange={e => changeLang(e.target.value)}>
              <option value="pt">🇧🇷 Português</option>
              <option value="en">🇺🇸 English</option>
            </select>
          </div>
          <div className="pref">
            <Icon name="market" width="26" height="26" />
            <div className="grow"><div className="title">{t('settings.currency')}</div><div className="sub">{t('settings.currencySub')}</div></div>
            <select className="input" style={{ width: 'auto', minHeight: 40 }} value={settings.currency} onChange={e => setSettings({ currency: e.target.value })}>
              <option value="brl">R$ BRL</option>
              <option value="usd">US$ USD</option>
              <option value="eur">€ EUR</option>
            </select>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>{t('settings.app')}</h2></div>
        <div className="list">
          <div className="pref">
            <Icon name="download" width="26" height="26" />
            <div className="grow"><div className="title">{t('settings.install')}</div><div className="sub">{install.installed ? t('settings.installed') : t('settings.installSub')}</div></div>
            {install.available && <button className="btn btn-sun btn-sm" onClick={install.prompt}>{t('install.action')}</button>}
          </div>
          <div className="pref">
            <Icon name="info" width="26" height="26" />
            <div className="grow"><div className="title">{t('tour.replay')}</div><div className="sub">{t('tour.replaySub')}</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSettings({ tourDone: false, game: 'sfl' })}>{t('tour.start')}</button>
          </div>
          <div className="pref">
            <Icon name="x" width="26" height="26" />
            <div className="grow"><div className="title">{t('settings.clear')}</div><div className="sub">{t('settings.clearSub')}</div></div>
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!confirm(t('settings.clearConfirm'))) return;
                await disablePush().catch(() => {});
                resetSettings();
                toast(t('settings.cleared'));
              }}
            >{t('settings.clearAction')}</button>
          </div>
        </div>
      </div>

      <p className="hint" style={{ textAlign: 'center', margin: '28px 0 8px' }}>{t('settings.footer')}</p>
    </div>
  );
}
