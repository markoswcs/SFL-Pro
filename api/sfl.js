// Proxy do mesmo domínio para as APIs do jogo, que não liberam CORS para o navegador.
// A chave da Community API fica só aqui (variável SFL_API_KEY) e nunca chega ao navegador.
// A API limita ~1 requisição a cada 5 s por IP, então as respostas ficam em cache na borda da Vercel.
const ALLOWED_HOSTS = new Set(['sfl.world', 'api.sunflower-land.com']);

function cacheSeconds(url) {
  if (url.pathname.startsWith('/img/')) return 60 * 60 * 24 * 7;
  if (url.hostname === 'sfl.world') return 60;
  if (url.pathname.startsWith('/community/farms/')) return 45;
  return 180;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  let target;
  try {
    target = new URL(String(req.query.url ?? ''));
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(400).json({ error: 'Destino não permitido' });
  }

  const headers = { Accept: 'application/json', 'User-Agent': 'SFLPro/2.0 (+https://github.com/markoswcs/SuperSFL)' };
  if (target.hostname === 'api.sunflower-land.com') {
    const key = process.env.SFL_API_KEY;
    if (!key) return res.status(500).json({ error: 'Servidor sem SFL_API_KEY configurada.' });
    headers['x-api-key'] = key;
  }

  try {
    let upstream = await fetch(target, { headers, signal: AbortSignal.timeout(15_000) });
    // Bateu no limite por IP: espera o intervalo pedido pela API e tenta uma vez.
    if (upstream.status === 429) {
      await new Promise(r => setTimeout(r, 5_500));
      upstream = await fetch(target, { headers, signal: AbortSignal.timeout(15_000) });
    }
    // Imagens (usadas para montar o ícone da notificação) passam como binário.
    const isImage = (upstream.headers.get('content-type') ?? '').startsWith('image/');
    const body = isImage ? Buffer.from(await upstream.arrayBuffer()) : await upstream.text();
    const ttl = cacheSeconds(target);
    res.setHeader('Cache-Control', upstream.ok ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}` : 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).json({ error: 'Falha ao falar com a API do jogo', detail: String(error?.message ?? error) });
  }
}
