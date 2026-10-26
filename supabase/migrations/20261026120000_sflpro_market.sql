-- SFL Pro 2.2: histórico de preços do mercado P2P e compras feitas por oferta aceita.
-- Cole no SQL Editor do Supabase depois da v3; rodar de novo é seguro.

-- Uma foto dos preços (sfl.world, por unidade em FLOWER) a cada ~30 min, guardada pelo push-tick.
CREATE TABLE IF NOT EXISTS public.sflpro_prices (
  at TIMESTAMPTZ PRIMARY KEY,
  p2p JSONB NOT NULL
);

-- Ofertas de compra aceitas: o jogo guarda o preço só até o jogador coletar, então copiamos aqui.
CREATE TABLE IF NOT EXISTS public.sflpro_purchases (
  farm_id BIGINT NOT NULL,
  offer_id TEXT NOT NULL,
  item TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  sfl NUMERIC NOT NULL,
  bought_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (farm_id, offer_id)
);
CREATE INDEX IF NOT EXISTS sflpro_purchases_farm_idx ON public.sflpro_purchases (farm_id, bought_at DESC);

ALTER TABLE public.sflpro_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sflpro_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sflpro_prices, public.sflpro_purchases FROM anon, authenticated;
