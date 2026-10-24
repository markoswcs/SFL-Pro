-- SFL Pro 2.0: backend de notificações reescrito.
-- Pode ser colado inteiro no SQL Editor do Supabase; rodar de novo é seguro.
-- As tabelas antigas tinham políticas públicas (qualquer um lia e escrevia com a chave do navegador).
-- Agora nenhuma tabela tem política: só as edge functions, com a service role, acessam os dados.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Remove o backend antigo e seus agendamentos.
DO $$
DECLARE job BIGINT;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname IN ('check-farm-push', 'check_farm_push_cron', 'invoke-check-farm', 'sflpro-push-tick') LOOP
    PERFORM cron.unschedule(job);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.notification_logs CASCADE;
DROP TABLE IF EXISTS public.farm_schedules CASCADE;
DROP FUNCTION IF EXISTS public.set_farm_schedule_updated_at() CASCADE;

CREATE TABLE IF NOT EXISTS public.sflpro_farms (
  farm_id BIGINT PRIMARY KEY,
  next_fetch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fetch_at TIMESTAMPTZ,
  last_error TEXT,
  fail_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sflpro_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id BIGINT NOT NULL REFERENCES public.sflpro_farms(farm_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_push_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sflpro_devices_farm_idx ON public.sflpro_devices (farm_id);

CREATE TABLE IF NOT EXISTS public.sflpro_timers (
  farm_id BIGINT NOT NULL REFERENCES public.sflpro_farms(farm_id) ON DELETE CASCADE,
  timer_key TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  ready_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (farm_id, timer_key)
);
CREATE INDEX IF NOT EXISTS sflpro_timers_ready_idx ON public.sflpro_timers (ready_at);

CREATE TABLE IF NOT EXISTS public.sflpro_sent (
  farm_id BIGINT NOT NULL,
  tag TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, tag)
);

ALTER TABLE public.sflpro_farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sflpro_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sflpro_timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sflpro_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sflpro_farms, public.sflpro_devices, public.sflpro_timers, public.sflpro_sent FROM anon, authenticated;

-- Segredo do cron gerado dentro do banco: nunca aparece no código nem no repositório.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'sflpro_cron_secret') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'sflpro_cron_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sflpro_check_cron_secret(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'sflpro_cron_secret' AND decrypted_secret = candidate);
$$;
REVOKE ALL ON FUNCTION public.sflpro_check_cron_secret(TEXT) FROM PUBLIC, anon, authenticated;

-- Reserva até max_rows fazendas com leitura vencida e já empurra a próxima leitura,
-- para que execuções sobrepostas do cron não busquem a mesma fazenda duas vezes.
CREATE OR REPLACE FUNCTION public.sflpro_claim_due_farms(max_rows INT)
RETURNS TABLE (farm_id BIGINT, fail_count INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.sflpro_farms f
  SET next_fetch_at = NOW() + INTERVAL '2 minutes'
  WHERE f.farm_id IN (
    SELECT farm_id FROM public.sflpro_farms
    WHERE next_fetch_at <= NOW()
    ORDER BY next_fetch_at
    LIMIT max_rows
    FOR UPDATE SKIP LOCKED
  )
  RETURNING f.farm_id, f.fail_count;
$$;
REVOKE ALL ON FUNCTION public.sflpro_claim_due_farms(INT) FROM PUBLIC, anon, authenticated;

-- A cada 15 segundos: o atraso máximo entre "ficou pronto" e o push é de ~15 s.
SELECT cron.schedule(
  'sflpro-push-tick',
  '15 seconds',
  $cron$
    SELECT net.http_post(
      url := 'https://ykbpkhsrxtnnisnorwhd.supabase.co/functions/v1/push-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sflpro_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);
