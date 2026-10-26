-- SFL Pro 2.1: quantidade e dados extras nos timers (vendas, ilha flutuante) e cron mais rápido.
-- Cole no SQL Editor do Supabase depois da v2; rodar de novo é seguro.

ALTER TABLE public.sflpro_timers
  ADD COLUMN IF NOT EXISTS amount NUMERIC,
  ADD COLUMN IF NOT EXISTS meta JSONB;

-- A cada 10 segundos (antes 15): o push sai até ~10 s depois de algo ficar pronto.
-- cron.schedule com o mesmo nome substitui o agendamento anterior.
SELECT cron.schedule(
  'sflpro-push-tick',
  '10 seconds',
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
