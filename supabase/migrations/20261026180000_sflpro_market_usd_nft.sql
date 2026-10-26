-- SFL Pro 2.3: cotação do FLOWER em dólar e preço mínimo (floor) dos NFTs em cada foto de preço.
-- Cole no SQL Editor do Supabase depois da 20261026120000; rodar de novo é seguro.

ALTER TABLE public.sflpro_prices
  ADD COLUMN IF NOT EXISTS usd NUMERIC,
  ADD COLUMN IF NOT EXISTS nft JSONB;
