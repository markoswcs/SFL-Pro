// Todas as chamadas passam por /api/sfl (proxy do mesmo domínio), porque as APIs do jogo
// não liberam CORS. A chave da Community API é adicionada lá no servidor.
import { t } from '../i18n.js';

const GAME = 'https://api.sunflower-land.com/community';
const SFL_WORLD = 'https://sfl.world/api';

export class ApiError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

async function call(url) {
  let res;
  try {
    res = await fetch(`/api/sfl?url=${encodeURIComponent(url)}`);
  } catch {
    throw new ApiError(t('err.offline'), 0, 'offline');
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.ok) return data;

  const msg = String(data?.error ?? '');
  if (res.status === 401 || /api key/i.test(msg)) throw new ApiError(t('err.server'), 401, 'server-key');
  if (res.status === 429) throw new ApiError(t('err.rate'), 429, 'rate-limit');
  if (res.status === 404) throw new ApiError(t('err.notFound'), 404, 'not-found');
  throw new ApiError(msg || t('err.generic'), res.status, 'server');
}

export const api = {
  farm: farmId => call(`${GAME}/farms/${encodeURIComponent(farmId)}`).then(d => d?.farm ?? d),
  land: farmId => call(`${SFL_WORLD}/v1.1/land/${encodeURIComponent(farmId)}`),
  prices: () => call(`${SFL_WORLD}/v1/prices`).then(d => d?.data ?? d),
  exchange: () => call(`${SFL_WORLD}/v1.1/exchange`),
  nfts: () => call(`${SFL_WORLD}/v1/nfts`),
  community: (type, params = {}) => call(`${GAME}/data?${new URLSearchParams({ type, ...params })}`),
  yakkaLeaderboard: () => call('https://api.yakkamon.com/leaderboard'),
};
