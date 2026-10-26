// Utilidades das edge functions: cliente Supabase com service role, web push e leitura da fazenda.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';
import { extractTimers } from './farm-timers.js';
import { itemImage } from './item-image.js';

export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
if (!VAPID_PUBLIC || !VAPID_PRIVATE) console.error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas');
else webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export class FarmError extends Error {
  constructor(message: string, public kind: string) { super(message); }
}

// Chave da Community API do dono do app; lê qualquer fazenda, então o usuário só informa o Farm ID.
const API_KEY = Deno.env.get('SFL_API_KEY') ?? '';
const API_HEADERS = { 'x-api-key': API_KEY, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'SFLPro/2.0' };

export async function fetchFarm(farmId: string | number) {
  const res = await fetch(`https://api.sunflower-land.com/community/farms/${farmId}`, { headers: API_HEADERS, signal: AbortSignal.timeout(15_000) });
  const data = await res.json().catch(() => null);
  if (res.status === 401 || /api key/i.test(String(data?.error ?? ''))) throw new FarmError('O servidor está sem acesso à API do jogo.', 'server-key');
  if (res.status === 404) throw new FarmError('Fazenda não encontrada.', 'not-found');
  if (res.status === 429) throw new FarmError('Limite da API atingido.', 'rate-limit');
  if (!res.ok) throw new FarmError(`API do jogo respondeu ${res.status}.`, 'server');
  return data?.farm ?? data;
}

/** Substitui os timers guardados da fazenda pelos lidos agora. */
export async function storeTimers(farmId: number, farm: unknown) {
  const now = Date.now();
  // Guarda só o que ainda vai ficar pronto ou ficou pronto há pouco; o resto não gera aviso.
  const rows = extractTimers(farm, now)
    .filter((t: { readyAt: number }) => t.readyAt > now - 10 * 60_000 && t.readyAt < now + 14 * 86400_000)
    .map((t: { key: string; category: string; name: string; image: string; readyAt: number; amount?: number; meta?: unknown }) => ({
      farm_id: farmId, timer_key: t.key, category: t.category, name: t.name, image: t.image, ready_at: new Date(t.readyAt).toISOString(),
      amount: t.amount ?? 1, meta: t.meta ?? null,
    }));
  await db.from('sflpro_timers').delete().eq('farm_id', farmId);
  if (rows.length) {
    let { error } = await db.from('sflpro_timers').insert(rows);
    // Banco ainda sem as colunas amount/meta (migração 20261026 não aplicada): grava sem elas.
    if (error && /amount|meta|column/i.test(error.message)) {
      ({ error } = await db.from('sflpro_timers').insert(rows.map(({ amount: _a, meta: _m, ...r }) => r)));
    }
    if (error) throw error;
  }
  await recordPurchases(farmId, farm).catch(e => console.error('compras falharam', (e as Error).message));
  return rows.length;
}

/** Copia as ofertas de compra aceitas: depois que o jogador coleta, o jogo apaga o preço. */
async function recordPurchases(farmId: number, farm: any) {
  const rows = Object.entries(farm?.trades?.offers ?? {})
    .filter(([, o]: [string, any]) => o?.fulfilledAt)
    .map(([id, o]: [string, any]) => {
      const [item, qty] = Object.entries(o.items ?? {})[0] ?? ['?', 0];
      return { farm_id: farmId, offer_id: id, item, qty: Number(qty) || 0, sfl: Number(o.sfl ?? 0), bought_at: new Date(o.fulfilledAt).toISOString() };
    });
  if (!rows.length) return;
  await db.from('sflpro_purchases').upsert(rows, { onConflict: 'farm_id,offer_id', ignoreDuplicates: true });
}

/**
 * Busca várias fazendas numa chamada (POST /community/getFarms, até 100 ids).
 * Fazendas grandes podem estourar o limite de 5,5 MB da resposta; essas voltam em "skipped".
 */
export async function fetchFarms(ids: number[]) {
  const res = await fetch('https://api.sunflower-land.com/community/getFarms', {
    method: 'POST', headers: API_HEADERS, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(40_000),
  });
  if (res.status === 429) throw new FarmError('Limite da API atingido.', 'rate-limit');
  if (!res.ok) throw new FarmError(`getFarms respondeu ${res.status}`, 'server');
  const data = await res.json();
  return { farms: (data?.farms ?? {}) as Record<string, unknown>, skipped: (data?.skipped ?? []) as number[] };
}

export type Device = { id: string; farm_id: number; endpoint: string; p256dh: string; auth: string; prefs: Record<string, unknown> };

/** Envia um push; remove o aparelho se o navegador disser que a inscrição acabou. */
export async function sendPush(device: Device, payload: Record<string, unknown>) {
  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high', topic: String(payload.tag ?? 'sfl').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) },
    );
    await db.from('sflpro_devices').update({ last_push_at: new Date().toISOString() }).eq('id', device.id);
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await db.from('sflpro_devices').delete().eq('id', device.id);
    else console.error('push falhou', status, (error as Error).message);
    return false;
  }
}

export { itemImage };
