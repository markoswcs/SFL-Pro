import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from '../config.js';
import { displayTag, groupTimers, isWanted, notificationText } from '../../supabase/functions/_shared/farm-timers.js';
import { itemImage } from './format.js';
import { getSettings } from './store.js';
import { t } from '../i18n.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// iOS só entrega push para apps instalados na tela inicial.
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function callServer(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/push-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? t('push.noServer'));
  return data;
}

// Idioma e fuso vão junto das preferências para o servidor escrever o aviso no idioma e na hora certos.
const withLang = prefs => ({ ...prefs, lang: getSettings().lang ?? 'pt', tz: Intl.DateTimeFormat().resolvedOptions().timeZone });

export async function getSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush({ farmId, prefs }) {
  if (!pushSupported()) throw new Error(t('alerts.unsupported'));
  if (isIOS() && !isStandalone()) throw new Error(t('alerts.ios'));
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(t('alerts.denied'));
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  await callServer({ action: 'subscribe', farmId, prefs: withLang(prefs), subscription: sub.toJSON() });
  return sub.endpoint;
}

export async function syncPrefs(endpoint, prefs) {
  if (!endpoint) return;
  await callServer({ action: 'prefs', endpoint, prefs: withLang(prefs) });
}

export async function disablePush() {
  const sub = await getSubscription();
  if (!sub) return;
  await callServer({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function sendTest(endpoint) {
  return callServer({ action: 'test', endpoint });
}

export const notificationTag = displayTag;

/**
 * Aviso no segundo exato, só para quem não ativou o push (senão o servidor já avisa e
 * os dois chegariam juntos). Usa a mesma tag do servidor, uma por item.
 */
export function scheduleLocal(timers, prefs, { sound, lang }) {
  if (!pushSupported() || Notification.permission !== 'granted') return () => {};
  const now = Date.now();
  const handles = groupTimers(timers)
    .filter(g => g.readyAt > now && g.readyAt - now < 12 * 3600_000 && isWanted(prefs, g.category, g.name))
    .map(g => setTimeout(async () => {
      const reg = await navigator.serviceWorker.ready;
      const { title, body } = notificationText(g, lang ?? 'pt');
      const options = { body, icon: itemImage(g.image), badge: '/icons/badge-96.png', tag: notificationTag(g), renotify: true, silent: !sound, data: { url: '/?tab=farm' } };
      // O service worker monta o ícone nítido; sem ele, mostra direto.
      if (reg.active) reg.active.postMessage({ type: 'SHOW', title, options });
      else reg.showNotification(title, options);
    }, g.readyAt - now));
  return () => handles.forEach(clearTimeout);
}
