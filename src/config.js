// Valores públicos (a chave do Supabase é a "publishable", feita para ficar no navegador).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://ykbpkhsrxtnnisnorwhd.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_Txki7crNaFMuqseK9G6JKw_aR4TsulA';
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? 'BI8J3PfcHYbOBlUeR4oM6aNbemlVewJng2zhARUjYdvkGbDoAXq5cZ_G3dvMwtu3nn8XYYy28Z9tSRQTbMM0ERQ';

export const FARM_REFRESH_MS = 60_000;
