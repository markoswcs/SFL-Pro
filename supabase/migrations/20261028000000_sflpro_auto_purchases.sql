-- SFL Pro 2.4: compras do mercado detectadas automaticamente.
-- Cole no SQL Editor do Supabase depois da 20261026180000; rodar de novo é seguro.

-- Resumo da última leitura de cada fazenda (saldo, inventário, ofertas…) para comparar com a próxima.
ALTER TABLE public.sflpro_farms ADD COLUMN IF NOT EXISTS last_state JSONB;

-- Compra detectada: `pending` quando não deu para saber qual item foi; `candidates` são as opções.
ALTER TABLE public.sflpro_purchases
  ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS candidates JSONB;
