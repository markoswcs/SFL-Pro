-- SFL Pro: vendas do mercado, para a aba Lucro somar o resultado da estratégia.
-- O jogo apaga o anúncio quando o jogador coleta o FLOWER, então copiamos aqui. Rodar de novo é seguro.
CREATE TABLE IF NOT EXISTS public.sflpro_sales (
  farm_id BIGINT NOT NULL,
  listing_id TEXT NOT NULL,
  item TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  sfl NUMERIC NOT NULL,
  tax NUMERIC NOT NULL DEFAULT 0,
  sold_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (farm_id, listing_id)
);
CREATE INDEX IF NOT EXISTS sflpro_sales_farm_idx ON public.sflpro_sales (farm_id, sold_at DESC);

ALTER TABLE public.sflpro_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sflpro_sales FROM anon, authenticated;
