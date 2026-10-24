// Roda a cada 15 segundos pelo pg_cron.
// 1) Relê em lote as fazendas cuja hora de atualizar chegou e guarda os timers.
// 2) Envia push para tudo o que ficou pronto, respeitando as preferências de cada aparelho.
import { displayTag, groupTimers, isWanted, notificationText } from '../_shared/farm-timers.js';
import { db, fetchFarms, itemImage, json, sendPush, storeTimers, type Device } from '../_shared/server.ts';

const REFRESH_MS = 5 * 60_000; // a mesma fazenda é relida a cada 5 min para pegar o que foi plantado
const BATCH = 40; // fazendas por chamada; o limite da resposta é 5,5 MB
const MAX_BATCHES = 2; // a API aceita ~1 chamada a cada 5 s por IP; o cron roda a cada 15 s
const SUMMARY_AFTER = 3; // mais que isso no mesmo minuto vira uma notificação só

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const tagOf = (g: { category: string; name: string; readyAt: number }) => `${g.category}:${g.name}:${Math.round(g.readyAt / 60_000)}`;

async function refreshFarms() {
  // Reserva as fazendas no banco (SKIP LOCKED) para duas execuções seguidas não lerem a mesma.
  const { data: due } = await db.rpc('sflpro_claim_due_farms', { max_rows: BATCH * MAX_BATCHES });
  if (!due?.length) return { refreshed: 0, failed: 0 };

  let refreshed = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += BATCH) {
    if (i > 0) await sleep(5_500);
    const chunk = due.slice(i, i + BATCH);
    try {
      const { farms } = await fetchFarms(chunk.map(f => Number(f.farm_id)));
      for (const row of chunk) {
        const farm = farms[String(row.farm_id)];
        const now = new Date();
        if (!farm) {
          // Ficou de fora (não existe ou estourou o tamanho): tenta de novo com espera crescente.
          failed++;
          await db.from('sflpro_farms').update({
            last_error: 'Fazenda não retornada pela API', fail_count: row.fail_count + 1,
            next_fetch_at: new Date(now.getTime() + Math.min(60, 2 ** row.fail_count) * 60_000).toISOString(),
          }).eq('farm_id', row.farm_id);
          continue;
        }
        await storeTimers(Number(row.farm_id), farm);
        await db.from('sflpro_farms').update({
          last_fetch_at: now.toISOString(), last_error: null, fail_count: 0, updated_at: now.toISOString(),
          next_fetch_at: new Date(now.getTime() + REFRESH_MS).toISOString(),
        }).eq('farm_id', row.farm_id);
        refreshed++;
      }
    } catch (error) {
      console.error('lote falhou', (error as Error).message);
      failed += chunk.length;
      break; // provavelmente limite da API; o resto fica para o próximo minuto
    }
  }
  return { refreshed, failed };
}

async function dispatch() {
  const now = Date.now();
  const { data: timers } = await db.from('sflpro_timers').select('*')
    .lte('ready_at', new Date(now).toISOString())
    .gte('ready_at', new Date(now - 30 * 60_000).toISOString());
  if (!timers?.length) return 0;

  const byFarm = new Map<number, typeof timers>();
  for (const t of timers) byFarm.set(Number(t.farm_id), [...(byFarm.get(Number(t.farm_id)) ?? []), t]);

  let sent = 0;
  for (const [farmId, rows] of byFarm) {
    const groups = groupTimers(rows.map(r => ({
      key: r.timer_key, category: r.category, name: r.name, image: r.image, readyAt: new Date(r.ready_at).getTime(), count: 1,
    })));
    const tags = groups.map(tagOf);
    const { data: already } = await db.from('sflpro_sent').select('tag').eq('farm_id', farmId).in('tag', tags);
    const done = new Set((already ?? []).map(a => a.tag));
    const fresh = groups.filter(g => !done.has(tagOf(g)));
    if (!fresh.length) continue;

    // Marca antes de enviar: se duas execuções se cruzarem, só uma ganha a inserção.
    const { data: claimed } = await db.from('sflpro_sent')
      .upsert(fresh.map(g => ({ farm_id: farmId, tag: tagOf(g) })), { onConflict: 'farm_id,tag', ignoreDuplicates: true })
      .select('tag');
    const mine = new Set((claimed ?? []).map(c => c.tag));
    const toSend = fresh.filter(g => mine.has(tagOf(g)));
    if (!toSend.length) continue;

    const { data: devices } = await db.from('sflpro_devices').select('*').eq('farm_id', farmId);
    for (const device of (devices ?? []) as Device[]) {
      const wanted = toSend.filter(g => isWanted(device.prefs, g.category, g.name));
      if (!wanted.length) continue;
      if (wanted.length > SUMMARY_AFTER) {
        const total = wanted.reduce((n, g) => n + g.count, 0);
        const names = [...new Set(wanted.map(g => g.name))];
        await sendPush(device, {
          title: device.prefs?.lang === 'en' ? `${total} things ready on your farm` : `${total} coisas prontas na fazenda`,
          body: names.slice(0, 5).join(', ') + (names.length > 5 ? (device.prefs?.lang === 'en' ? ` and ${names.length - 5} more` : ` e mais ${names.length - 5}`) : ''),
          icon: itemImage(wanted[0].image), tag: `sum:${Math.round(now / 60_000)}`, url: '/?tab=farm', timestamp: now,
        }) && sent++;
        continue;
      }
      for (const g of wanted) {
        const { title, body } = notificationText(g, device.prefs?.lang === 'en' ? 'en' : 'pt');
        // O ícone é a arte do próprio item (pedra, trigo, vaca…); o aparelho baixa a imagem ao exibir.
        await sendPush(device, { title, body, icon: itemImage(g.image), tag: displayTag(g), url: '/?tab=farm', timestamp: g.readyAt }) && sent++;
      }
    }
  }
  return sent;
}

Deno.serve(async req => {
  const secret = req.headers.get('x-cron-secret') ?? '';
  const { data: ok } = await db.rpc('sflpro_check_cron_secret', { candidate: secret });
  if (!ok) return json({ error: 'Não autorizado' }, 401);

  const started = Date.now();
  // Envia primeiro o que já está pronto, para não atrasar por causa da leitura das fazendas.
  const sentBefore = await dispatch();
  const farms = await refreshFarms();
  const sentAfter = await dispatch();
  await db.from('sflpro_sent').delete().lt('sent_at', new Date(Date.now() - 3 * 86400_000).toISOString());
  return json({ ok: true, ...farms, sent: sentBefore + sentAfter, ms: Date.now() - started });
});
