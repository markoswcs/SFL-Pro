// Tradução dos anúncios oficiais (aba Novidades) para o idioma do app, com cache na borda da Vercel.
// Os marcadores de markdown do Discord (##, -, >, 1.) saem antes de traduzir e voltam depois:
// com eles o tradutor às vezes devolve a linha sem traduzir.
const LANGS = new Set(['pt', 'en']);
const MAX_CHARS = 4000;
const MARKER = /^\s*(#{1,6}\s+|[-*•]\s+|>\s*|\d+\.\s+)/;

export async function translate(text, to) {
  const lines = String(text).split('\n');
  const markers = lines.map(line => line.match(MARKER)?.[0] ?? '');
  const body = lines.map((line, i) => line.slice(markers[i].length)).join('\n');
  if (!body.trim()) return text;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(body)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`tradutor respondeu ${res.status}`);
  const data = await res.json();
  const out = (data?.[0] ?? []).map(part => part?.[0] ?? '').join('').split('\n');
  // Se o número de linhas mudou, não dá para devolver os marcadores no lugar certo: vai sem eles.
  if (out.length !== lines.length) return out.join('\n');
  return out.map((line, i) => markers[i] + line).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const to = String(req.query.to ?? '');
  const text = String(req.query.text ?? '').slice(0, MAX_CHARS);
  if (!LANGS.has(to)) return res.status(400).json({ error: 'Idioma inválido' });
  if (!text.trim()) return res.status(400).json({ error: 'Texto vazio' });
  try {
    const translated = await translate(text, to);
    // O mesmo anúncio sempre dá a mesma tradução: guarda por 7 dias.
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({ text: translated });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Tradução indisponível', detail: String(error?.message ?? error) });
  }
}
