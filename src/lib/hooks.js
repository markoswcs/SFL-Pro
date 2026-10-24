import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { FARM_REFRESH_MS } from '../config.js';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Carrega fazenda, resumo público, preços e câmbio, com atualização periódica. */
export function useGameData({ farmId }) {
  const [state, setState] = useState({ farm: null, land: null, prices: null, exchange: null, error: null, loading: true, updatedAt: null });
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState(s => ({ ...s, loading: true }));
    const [farm, land, prices, exchange] = await Promise.allSettled([
      farmId ? api.farm(farmId) : Promise.resolve(null),
      farmId ? api.land(farmId) : Promise.resolve(null),
      api.prices(),
      api.exchange(),
    ]);
    setState(s => ({
      farm: farm.status === 'fulfilled' ? farm.value : s.farm,
      land: land.status === 'fulfilled' ? land.value : s.land,
      prices: prices.status === 'fulfilled' ? prices.value : s.prices,
      exchange: exchange.status === 'fulfilled' ? exchange.value : s.exchange,
      error: farm.status === 'rejected' ? farm.reason : null,
      loading: false,
      updatedAt: Date.now(),
    }));
    busy.current = false;
  }, [farmId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, FARM_REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  return { ...state, refresh };
}

/** Busca sob demanda com cache simples por chave; usado nas abas do mercado. */
const cache = new Map();
export function useResource(key, fetcher, { ttl = 60_000, enabled = true } = {}) {
  const [state, setState] = useState(() => ({ data: cache.get(key)?.data ?? null, error: null, loading: enabled }));
  const load = useCallback(async (force = false) => {
    if (!enabled) return;
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < ttl) { setState({ data: hit.data, error: null, loading: false }); return; }
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await fetcher();
      cache.set(key, { data, at: Date.now() });
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState(s => ({ ...s, error, loading: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: () => load(true) };
}
