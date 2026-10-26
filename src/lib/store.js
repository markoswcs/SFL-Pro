import { useSyncExternalStore } from 'react';
import { defaultPrefs } from '../../supabase/functions/_shared/farm-timers.js';

const KEY = 'sflpro:v2';
const DEFAULTS = {
  farmId: '',
  currency: 'brl',
  sound: true,
  localAlerts: true,
  prefs: defaultPrefs(),
  pushEndpoint: null,
  favorites: [],
  lang: null,
  game: 'sfl',
  yakkaName: '',
  purchases: [],
  sellGoal: 0.1,
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ...DEFAULTS, ...saved, prefs: { ...DEFAULTS.prefs, ...saved.prefs, categories: { ...DEFAULTS.prefs.categories, ...saved.prefs?.categories } } };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = load();
const listeners = new Set();

export function getSettings() {
  return state;
}

export function setSettings(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* modo privado */ }
  listeners.forEach(l => l());
}

export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  state = { ...DEFAULTS };
  listeners.forEach(l => l());
}

export function useSettings() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, getSettings);
}
