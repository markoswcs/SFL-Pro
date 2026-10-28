// API pública do app para gerenciar o push deste aparelho.
// O endpoint da inscrição é aleatório e secreto; quem o tem controla só aquele aparelho.
import { cors, db, FarmError, fetchFarm, json, sendPush, storeTimers, type Device } from '../_shared/server.ts';

const isPushEndpoint = (url: unknown) => {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && u.hostname.length > 3;
  } catch {
    return false;
  }
};

// Mantém só o formato esperado das preferências, para nada estranho ir parar no banco.
function cleanPrefs(prefs: any) {
  const bools = (o: any) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => typeof v === 'boolean' && k.length < 80).slice(0, 400));
  const tz = typeof prefs?.tz === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(prefs.tz) ? prefs.tz : undefined;
  return { enabled: prefs?.enabled !== false, lang: prefs?.lang === 'en' ? 'en' : 'pt', tz, categories: bools(prefs?.categories), items: bools(prefs?.items) };
}

async function findDevice(endpoint: unknown) {
  if (!isPushEndpoint(endpoint)) return null;
  const { data } = await db.from('sflpro_devices').select('*').eq('endpoint', String(endpoint)).maybeSingle();
  return data as Device | null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    switch (body?.action) {
      case 'subscribe': {
        const farmId = Number(String(body.farmId ?? '').replace(/\D/g, ''));
        const sub = body.subscription;
        if (!farmId) return json({ error: 'Informe o Farm ID.' }, 400);
        if (!isPushEndpoint(sub?.endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: 'Inscrição de push inválida.' }, 400);

        // Confere se a fazenda existe e já calcula os timers, para funcionar na hora.
        const farm = await fetchFarm(farmId);
        const now = new Date().toISOString();
        const { error: farmErr } = await db.from('sflpro_farms').upsert({
          farm_id: farmId, next_fetch_at: new Date(Date.now() + 2 * 60_000).toISOString(),
          last_fetch_at: now, last_error: null, fail_count: 0, updated_at: now,
        });
        if (farmErr) throw farmErr;
        const { error: devErr } = await db.from('sflpro_devices').upsert({
          farm_id: farmId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, prefs: cleanPrefs(body.prefs),
        }, { onConflict: 'endpoint' });
        if (devErr) throw devErr;
        const timers = await storeTimers(farmId, farm);
        return json({ ok: true, timers });
      }

      case 'prefs': {
        const device = await findDevice(body.endpoint);
        if (!device) return json({ error: 'Aparelho não inscrito. Ative as notificações de novo.' }, 404);
        await db.from('sflpro_devices').update({ prefs: cleanPrefs(body.prefs) }).eq('id', device.id);
        return json({ ok: true });
      }

      case 'unsubscribe': {
        const device = await findDevice(body.endpoint);
        if (!device) return json({ ok: true });
        await db.from('sflpro_devices').delete().eq('id', device.id);
        // Sem aparelhos, a fazenda deixa de ser acompanhada.
        const { count } = await db.from('sflpro_devices').select('id', { count: 'exact', head: true }).eq('farm_id', device.farm_id);
        if (!count) await db.from('sflpro_farms').delete().eq('farm_id', device.farm_id);
        return json({ ok: true });
      }

      case 'test': {
        const device = await findDevice(body.endpoint);
        if (!device) return json({ error: 'Aparelho não inscrito. Ative as notificações de novo.' }, 404);
        const en = device.prefs?.lang === 'en';
        const ok = await sendPush(device, {
          title: en ? 'All set 🌻' : 'Tudo certo por aqui 🌻',
          body: en ? 'You will get alerts like this when something is ready.' : 'Você vai receber avisos assim quando algo ficar pronto.',
          icon: '/icons/icon-192.png',
          tag: 'sflpro-test',
        });
        return ok ? json({ ok: true }) : json({ error: 'O navegador recusou o envio. Desative e ative de novo.' }, 502);
      }

      case 'prices': {
        // Histórico dos preços P2P em colunas: { t: [ms…], items: { Nome: [preço…] } }.
        // Últimas 48 h de hora em hora, depois uma foto a cada 6 h até 30 dias.
        const since = new Date(Date.now() - 30 * 86400_000).toISOString();
        type Row = { at: string; p2p: Record<string, number>; usd?: number | null; nft?: Record<string, number> | null };
        let { data, error } = await db.from('sflpro_prices').select('at, p2p, usd').gte('at', since).order('at') as { data: Row[] | null; error: unknown };
        // Sem a coluna usd ainda: devolve só os recursos.
        if (error) ({ data, error } = await db.from('sflpro_prices').select('at, p2p').gte('at', since).order('at') as { data: Row[] | null; error: unknown });
        if (error) return json({ error: 'Histórico de preços indisponível.' }, 503);
        // Os floors dos NFTs são pesados: só os últimos 7 dias, e só as fotos que têm NFT (a cada 2 h).
        const { data: nftData } = await db.from('sflpro_prices').select('at, nft')
          .gte('at', new Date(Date.now() - 7 * 86400_000).toISOString()).not('nft', 'is', null).order('at');
        const picked: Row[] = [];
        for (const row of data ?? []) {
          const at = new Date(row.at).getTime();
          const step = Date.now() - at < 48 * 3600_000 ? 3600_000 : 6 * 3600_000;
          const prev = picked[picked.length - 1];
          if (!prev || at - new Date(prev.at).getTime() >= step - 5 * 60_000) picked.push(row);
        }
        const last = data?.[data.length - 1];
        if (last && picked[picked.length - 1] !== last) picked.push(last);
        const items: Record<string, (number | null)[]> = {};
        picked.forEach((row, i) => {
          for (const [name, price] of Object.entries(row.p2p ?? {})) {
            (items[name] ??= Array(picked.length).fill(null))[i] = Number(price);
          }
        });
        // NFTs são ~850: em vez da série inteira, um resumo por id com
        // [preço há 24 h, preço há 7 dias, média 7d, mínimo 7d, máximo 7d, início do histórico].
        const now = Date.now();
        const nftRows = ((nftData ?? []) as Row[]).filter(r => r.nft);
        const nft: Record<string, (number | null)[]> = {};
        if (nftRows.length) {
          const refAt = (key: string, ago: number) => {
            let v: number | null = null;
            for (const r of nftRows) {
              if (new Date(r.at).getTime() > now - ago) break;
              if (r.nft![key] != null) v = r.nft![key];
            }
            return v ?? nftRows.find(r => r.nft![key] != null)?.nft![key] ?? null;
          };
          const keys = new Set(nftRows.flatMap(r => Object.keys(r.nft!)));
          for (const key of keys) {
            const vs = nftRows.map(r => r.nft![key]).filter((v): v is number => v != null);
            const first = nftRows.find(r => r.nft![key] != null)!;
            nft[key] = [refAt(key, 86400_000), refAt(key, 7 * 86400_000), vs.reduce((s, v) => s + v, 0) / vs.length, Math.min(...vs), Math.max(...vs), new Date(first.at).getTime()];
          }
        }
        const body = { t: picked.map(r => new Date(r.at).getTime()), items, usd: picked.map(r => (r.usd == null ? null : Number(r.usd))), nft };
        return new Response(JSON.stringify(body), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        });
      }

      case 'nftHistory': {
        // Série de 7 dias do floor de um NFT, para o gráfico da gaveta.
        const key = String(body.key ?? '');
        if (!/^[cw]\d{1,6}$/.test(key)) return json({ error: 'NFT inválido.' }, 400);
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data, error } = await db.from('sflpro_prices').select('at, nft').gte('at', since).order('at');
        if (error) return json({ error: 'Histórico indisponível.' }, 503);
        const rows = (data ?? []).filter(r => r.nft?.[key] != null);
        return json({ t: rows.map(r => new Date(r.at).getTime()), v: rows.map(r => Number(r.nft[key])) });
      }

      case 'purchases': {
        const farmId = Number(String(body.farmId ?? '').replace(/\D/g, ''));
        if (!farmId) return json({ error: 'Informe o Farm ID.' }, 400);
        const query = (cols: string) => db.from('sflpro_purchases').select(cols).eq('farm_id', farmId).order('bought_at', { ascending: false }).limit(200);
        type Rows = { data: Record<string, unknown>[] | null; error: unknown };
        let { data, error } = (await query('offer_id, item, qty, sfl, bought_at, pending, candidates')) as Rows;
        // Sem as colunas da detecção automática ainda: devolve só as ofertas aceitas.
        if (error) ({ data, error } = (await query('offer_id, item, qty, sfl, bought_at')) as Rows);
        if (error) return json({ error: 'Compras indisponíveis.' }, 503);
        return json({ ok: true, purchases: data ?? [] });
      }

      default:
        return json({ error: 'Ação desconhecida' }, 400);
    }
  } catch (error) {
    if (error instanceof FarmError) return json({ error: error.message, kind: error.kind }, error.kind === 'not-found' ? 404 : 502);
    console.error(error);
    return json({ error: 'Erro interno no servidor de notificações.' }, 500);
  }
});
