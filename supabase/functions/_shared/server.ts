// Utilidades das edge functions: cliente Supabase com service role, web push e leitura da fazenda.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';
import { extractTimers } from './farm-timers.js';
import { detectPurchase, farmState } from './purchases.js';
import { itemImage } from './item-image.js';
import { strategyTimers, weekStats } from './strategy.js';

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

type History = { t: number[]; items: Record<string, (number | null)[]> };
type NftPrices = { at: number; floors: Record<string, number>; names: Record<string, string>; stats: Record<string, unknown> };
type StrategyPrices = { at: number; p2p: Record<string, number>; history: History; nft: NftPrices | null };

// Preços dos últimos 7 dias (uma foto por hora; NFTs a cada 2 h) para os avisos de compra e venda.
// Guardados na memória da função por 10 min: a mesma rodada lê dezenas de fazendas.
let priceCache: { loadedAt: number; value: StrategyPrices | null } | null = null;
let nftNames: { loadedAt: number; names: Record<string, string> } | null = null;

/** Nome de cada NFT por id ("c123", "w45"), da sfl.world (guardado por 6 h). */
async function loadNftNames() {
  if (nftNames && Date.now() - nftNames.loadedAt < 6 * 3600_000) return nftNames.names;
  const res = await fetch('https://sfl.world/api/v1/nfts', { headers: { Accept: 'application/json', 'User-Agent': 'SFLPro/2.3' }, signal: AbortSignal.timeout(15_000) });
  const data = res.ok ? await res.json() : null;
  const names: Record<string, string> = {};
  for (const [prefix, list] of [['c', data?.collectibles], ['w', data?.wearables]] as const) {
    for (const n of list ?? []) if (n?.name) names[`${prefix}${n.id}`] = n.name;
  }
  nftNames = { loadedAt: Date.now(), names };
  return names;
}

async function strategyPrices(): Promise<StrategyPrices | null> {
  if (priceCache && Date.now() - priceCache.loadedAt < 10 * 60_000) return priceCache.value;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data, error } = await db.from('sflpro_prices').select('at, p2p').gte('at', since).order('at');
  if (error || !data?.length) { priceCache = { loadedAt: Date.now(), value: null }; return null; }
  const picked: { at: number; p2p: Record<string, number> }[] = [];
  for (const row of data) {
    const at = new Date(row.at).getTime();
    const prev = picked[picked.length - 1];
    if (!prev || at - prev.at >= 55 * 60_000) picked.push({ at, p2p: row.p2p ?? {} });
  }
  const last = data[data.length - 1];
  const lastAt = new Date(last.at).getTime();
  if (picked[picked.length - 1].at !== lastAt) picked.push({ at: lastAt, p2p: last.p2p ?? {} });
  const items: Record<string, (number | null)[]> = {};
  picked.forEach((row, i) => { for (const [name, v] of Object.entries(row.p2p)) (items[name] ??= Array(picked.length).fill(null))[i] = Number(v); });

  // NFTs: floor mais recente e média/máx./mín. de 7 dias por id.
  let nft: NftPrices | null = null;
  const { data: nftRows } = await db.from('sflpro_prices').select('at, nft').gte('at', since).not('nft', 'is', null).order('at');
  if (nftRows?.length) {
    const t = nftRows.map(r => new Date(r.at).getTime());
    const series: Record<string, (number | null)[]> = {};
    nftRows.forEach((r, i) => { for (const [k, v] of Object.entries(r.nft ?? {})) (series[k] ??= Array(nftRows.length).fill(null))[i] = Number(v); });
    const names = await loadNftNames().catch(() => ({} as Record<string, string>));
    nft = { at: t[t.length - 1], floors: nftRows[nftRows.length - 1].nft ?? {}, names, stats: weekStats({ t, items: series }) };
  }
  priceCache = { loadedAt: Date.now(), value: { at: lastAt, p2p: last.p2p ?? {}, history: { t: picked.map(r => r.at), items }, nft } };
  return priceCache.value;
}

/** Itens seguidos e posições (preço médio) de todos os aparelhos da fazenda, juntos. */
async function strategyWatch(farmId: number) {
  const { data } = await db.from('sflpro_devices').select('prefs').eq('farm_id', farmId);
  const items = new Map<string, { name: string; key?: string | null }>();
  let positions: unknown[] = [];
  let goal = 0;
  for (const d of data ?? []) {
    const prefs = (d.prefs ?? {}) as { watch?: { name: string; key?: string | null }[]; positions?: unknown[]; sellGoal?: number };
    for (const w of prefs.watch ?? []) if (w?.name) items.set(w.key ?? w.name, w);
    if ((prefs.positions?.length ?? 0) > positions.length) positions = prefs.positions!;
    if (prefs.sellGoal && !goal) goal = prefs.sellGoal;
  }
  return { items: [...items.values()], positions, goal };
}

/** Guarda as vendas do mercado: depois que o jogador coleta, o jogo apaga o anúncio. */
async function recordSales(farmId: number, farm: any) {
  const rows = Object.entries(farm?.trades?.listings ?? {})
    .filter(([, l]: [string, any]) => l?.fulfilledAt)
    .map(([id, l]: [string, any]) => {
      const [item, qty] = Object.entries(l.items ?? {})[0] ?? ['?', 0];
      return { farm_id: farmId, listing_id: id, item, qty: Number(qty) || 0, sfl: Number(l.sfl ?? 0), tax: Number(l.tax ?? 0), sold_at: new Date(l.fulfilledAt).toISOString() };
    });
  if (!rows.length) return;
  await db.from('sflpro_sales').upsert(rows, { onConflict: 'farm_id,listing_id', ignoreDuplicates: true });
}

/** Substitui os timers guardados da fazenda pelos lidos agora. */
export async function storeTimers(farmId: number, farm: unknown) {
  const now = Date.now();
  // Guarda também o que já está pronto (até 3 dias): o aviso soma o total pronto de cada item.
  // Só gera aviso o que ficou pronto na última hora (push-tick); o que foi coletado some na próxima leitura.
  const strategy = await Promise.all([strategyPrices(), strategyWatch(farmId)]).then(([prices, watch]) => strategyTimers(farm, prices, now, watch)).catch(e => { console.error('estratégia falhou', (e as Error).message); return []; });
  const rows = [...extractTimers(farm, now), ...strategy]
    .filter((t: { readyAt: number }) => t.readyAt > now - 3 * 86400_000 && t.readyAt < now + 14 * 86400_000)
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
  await recordSales(farmId, farm).catch(e => console.error('vendas falharam', (e as Error).message));
  await detectFarmPurchase(farmId, farm).catch(e => console.error('detecção de compra falhou', (e as Error).message));
  return rows.length;
}

/**
 * Compra instantânea no mercado não deixa preço na fazenda: compara esta leitura com a anterior
 * (saldo que saiu × itens que entraram) e guarda o que achou em sflpro_purchases.
 */
async function detectFarmPurchase(farmId: number, farm: unknown) {
  const cur = farmState(farm);
  const { data: row, error } = await db.from('sflpro_farms').select('last_state').eq('farm_id', farmId).maybeSingle();
  if (error) return; // migração 20261028000000 ainda não aplicada
  await db.from('sflpro_farms').update({ last_state: cur }).eq('farm_id', farmId);
  if (!row?.last_state) return;
  const { data: price } = await db.from('sflpro_prices').select('p2p').order('at', { ascending: false }).limit(1).maybeSingle();
  const found = detectPurchase(row.last_state, cur, price?.p2p ?? {});
  if (!found) return;
  await db.from('sflpro_purchases').upsert({
    farm_id: farmId, offer_id: `auto-${found.at}`, item: found.item, qty: found.qty, sfl: found.spent,
    bought_at: new Date(found.at).toISOString(), pending: found.pending, candidates: found.candidates,
  }, { onConflict: 'farm_id,offer_id', ignoreDuplicates: true });
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
      // Sem Topic: no FCM, mensagens com Topic viram "recolhíveis" e, com o celular dormindo,
      // só 4 delas ficam na fila; o resto era descartado. A troca de aviso repetido já é feita pela tag.
      // TTL de 3 h: com o celular desligado ou sem rede, o aviso ainda chega quando ele voltar.
      { TTL: 3 * 60 * 60, urgency: 'high' },
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
