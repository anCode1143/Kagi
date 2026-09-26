// App state. `state` is the simulated ledger and is saved to localStorage; `ui` is per-session
// scratch state (form drafts, open panels) that is never saved.
import { seedWorld } from './seed.js';

// `?profile=name` in the URL keeps a separate saved demo, e.g. two people side by side.
const profile = new URLSearchParams(location.search).get('profile');
const KEY = profile ? `kagi:v2:${profile}` : 'kagi:v2';

export function freshDraft() {
  return { input: '', address: null, amount: '0', memo: '', hold: null, ack: false };
}

// Small per-device preferences (e.g. whether Activity is expanded). Losing them is harmless.
const PREFS = 'kagi:prefs';
export function pref(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || '{}');
    return key in saved ? saved[key] : fallback;
  } catch {
    return fallback;
  }
}
export function setPref(key, value) {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || '{}');
    saved[key] = value;
    localStorage.setItem(PREFS, JSON.stringify(saved));
  } catch {
    // Storage blocked: the preference just won't survive a reload.
  }
}

export const ui = {
  draft: freshDraft(),
  onboard: { name: '', username: '', wallet: null, busy: false },
  contact: { name: '', to: '', ack: false },
  demoOpen: false,
  activityOpen: pref('activityOpen', false),
};

let state = load() || seedWorld();
const listeners = new Set();

export const store = {
  get: () => state,
  // Runs `fn` against the state, then saves and re-renders. If `fn` returns false, nothing changed.
  update(fn) {
    const result = fn(state);
    if (result === false) return result;
    persist();
    listeners.forEach((l) => l());
    return result;
  },
  subscribe(fn) {
    listeners.add(fn);
  },
};

export const now = () => Date.now() + (state.clockOffset || 0);
export const me = () => state.viewer || state.owner;

export function resetAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage may be blocked; the in-memory reset below still works.
  }
  state = seedWorld();
  ui.draft = freshDraft();
  ui.onboard = { name: '', username: '', wallet: null, busy: false };
  ui.contact = { name: '', to: '', ack: false };
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the demo keeps working in memory.
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && saved.version === 2 ? saved : null;
  } catch {
    return null;
  }
}
