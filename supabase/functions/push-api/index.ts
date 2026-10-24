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
  return { enabled: prefs?.enabled !== false, lang: prefs?.lang === 'en' ? 'en' : 'pt', categories: bools(prefs?.categories), items: bools(prefs?.items) };
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
          farm_id: farmId, next_fetch_at: new Date(Date.now() + 5 * 60_000).toISOString(),
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
          icon: 'https://sfl.world/img/source/Sunflower.png',
          tag: 'sflpro-test',
        });
        return ok ? json({ ok: true }) : json({ error: 'O navegador recusou o envio. Desative e ative de novo.' }, 502);
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
