export { itemImage } from '../../supabase/functions/_shared/item-image.js';

export function countdown(ms) {
  if (ms <= 0) return 'Pronto';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s % 60}s`;
}

export function clockTime(ts) {
  const date = new Date(ts);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString('pt-BR', { weekday: 'short' })} ${time}`;
}

const nf = (min, max) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

export function num(value, max = 2) {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 1e6) return `${nf(0, 1).format(n / 1e6)} mi`;
  if (Math.abs(n) >= 1e4) return `${nf(0, 1).format(n / 1e3)} mil`;
  return nf(0, max).format(n);
}

export function flower(value) {
  const n = Number(value ?? 0);
  return nf(n < 1 ? 4 : 2, n < 1 ? 6 : 2).format(n);
}

export function money(value, currency = 'brl') {
  return new Intl.NumberFormat(currency === 'usd' ? 'en-US' : 'pt-BR', {
    style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
  }).format(Number(value ?? 0));
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'agora';
  if (diff < 3600_000) return `há ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `há ${Math.floor(diff / 3600_000)} h`;
  return `há ${Math.floor(diff / 86400_000)} d`;
}
