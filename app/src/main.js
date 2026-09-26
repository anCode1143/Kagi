// Kagi: router, actions and the one-second clock that runs holds and auto-returns.
import { store, ui, now, me, freshDraft, resetAll } from './store.js';
import { settle, send, cancel, claim, topUp, setTrusted, addContact, simulateDust, simulateIncoming, phase } from './ledger.js';
import { resolveInput, analyze, validUsername } from './guards.js';
import { createWallet, connectWallet } from './wallet.js';
import { randomAddress } from './base58.js';
import { seedOwnerHistory, ADDR } from './seed.js';
import { renderRoute, renderDemo } from './views/index.js';
import { clock, dateTime, toLamports, SOL } from './format.js';

const app = document.getElementById('app');
const demo = document.getElementById('demo');
const toastEl = document.getElementById('toast');

// ---------- Routing ----------
function parseRoute() {
  const path = location.hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter(Boolean);
  return { path, name: parts[0] || '', parts };
}

export function go(to) {
  const target = `#/${to}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function redirect(to) {
  history.replaceState(null, '', `#/${to}`);
  return parseRoute();
}

// ---------- Rendering ----------
let lastPath = '';
let phaseSignature = '';

function render() {
  const s = store.get();
  let route = parseRoute();
  const onboarding = route.name === 'welcome' || route.name === 'onboard';
  if (!s.owner && !onboarding) route = redirect('welcome');
  else if (s.owner && onboarding && route.path !== 'onboard/done') route = redirect('home');
  else if (!route.name) route = redirect(s.owner ? 'home' : 'welcome');

  const samePage = route.path === lastPath;
  const focus = samePage ? captureFocus() : null;
  const scrollTop = samePage ? app.querySelector('.screen')?.scrollTop || 0 : 0;

  const ctx = { s, viewer: me(), t: now(), ui };
  app.innerHTML = renderRoute(route, ctx);
  demo.innerHTML = renderDemo(ctx);
  demo.classList.toggle('open', ui.demoOpen);

  const screen = app.querySelector('.screen');
  if (screen) screen.scrollTop = scrollTop;
  if (focus) restoreFocus(focus);
  if (!samePage) app.querySelector('[autofocus]')?.focus();
  lastPath = route.path;
  phaseSignature = signature();
  updateLive();
}

function captureFocus() {
  const el = document.activeElement;
  if (!el?.id) return null;
  return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus({ id, start, end }) {
  const el = document.getElementById(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    if (start != null) el.setSelectionRange(start, end);
  } catch {
    // Some input types don't support selection ranges.
  }
}

// Countdowns and progress rings tick without re-rendering the whole screen.
function updateLive() {
  const t = now();
  document.querySelectorAll('[data-until]').forEach((el) => {
    el.textContent = clock(Number(el.dataset.until) - t);
  });
  document.querySelectorAll('[data-ring]').forEach((el) => {
    const from = Number(el.dataset.from);
    const to = Number(el.dataset.to);
    const c = Number(el.dataset.c);
    const left = Math.max(0, Math.min(1, (to - t) / (to - from)));
    el.style.strokeDashoffset = String(c * (1 - left));
  });
  const demoClock = document.querySelector('[data-demo-clock]');
  if (demoClock) demoClock.textContent = dateTime(t);
}

// Changes whenever a hold crosses a deadline, so the screen re-renders at that moment.
function signature() {
  const s = store.get();
  const t = now();
  const v = me();
  return s.txs.filter((x) => x.mode === 'hold' && (x.from === v || x.to === v)).map((x) => x.id + phase(x, t)).join('|');
}

// ---------- Toasts ----------
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400);
}

let lastNoticeId = null;
function announceNewNotice() {
  const latest = (store.get().notices[me()] || [])[0];
  if (latest && latest.id !== lastNoticeId && !latest.read && lastNoticeId !== null) toast(latest.title);
  lastNoticeId = latest?.id || '';
}

// ---------- Amount keypad ----------
function pressKey(key) {
  const current = ui.draft.amount || '0';
  let next = current;
  if (key === 'back') {
    next = current.length > 1 ? current.slice(0, -1) : '0';
  } else if (key === '.') {
    if (!current.includes('.')) next = `${current}.`;
  } else {
    const decimals = current.split('.')[1];
    if (decimals !== undefined && decimals.length >= 4) return;
    if (current.replace('.', '').length >= 9) return;
    next = current === '0' ? key : current + key;
  }
  ui.draft.amount = next;
  render();
}

// ---------- Actions (buttons carry data-action="name") ----------
const actions = {
  go: (d) => go(d.to),

  // Onboarding
  'onboard-create': () => {
    ui.onboard.wallet = null;
    go('onboard/username');
  },
  'onboard-demo-connect': () => {
    ui.onboard.wallet = { type: 'Demo wallet', address: randomAddress() };
    go('onboard/username');
  },
  'onboard-connect': async (d) => {
    const wallet = await connectWallet(d.id);
    ui.onboard.wallet = { type: wallet.name, address: wallet.address };
    go('onboard/username');
  },
  'onboard-finish': async () => {
    const o = ui.onboard;
    const username = o.username.trim().toLowerCase().replace(/^@/, '');
    const name = o.name.trim();
    if (!validUsername(username) || store.get().usernames[username] || name.length < 2) return;
    o.busy = true;
    render();
    let address = o.wallet?.address;
    let realKey = false;
    if (!address) ({ address, realKey } = await createWallet());
    history.replaceState(null, '', '#/onboard/done');
    store.update((s) => {
      s.accounts[address] = {
        address, kind: 'kagi', username, name, balance: SOL(12.84),
        wallet: o.wallet?.type || 'Kagi wallet', createdByKagi: !o.wallet, realKey,
      };
      s.usernames[username] = address;
      s.owner = address;
      s.viewer = address;
      seedOwnerHistory(s, address, name, now());
    });
    ui.onboard = { name: '', username: '', wallet: null, busy: false };
    lastNoticeId = (store.get().notices[address] || [])[0]?.id || '';
  },

  // Home
  'top-up': () => {
    store.update((s) => topUp(s, me(), SOL(1)));
    toast('Added 1 SOL of demo money');
  },
  dismiss: (d) => {
    store.update((s) => {
      (s.dismissed[me()] ||= []).push(d.id);
    });
    if (d.then) go(d.then);
  },
  report: () => toast('Reported. Thanks for helping protect other Kagi users.'),
  copy: async (d) => {
    try {
      await navigator.clipboard.writeText(d.text);
      toast('Copied');
    } catch {
      toast('Couldn’t copy. Select the text instead.');
    }
  },

  // Sending
  paste: async () => {
    try {
      ui.draft.input = (await navigator.clipboard.readText()).trim();
      render();
      document.getElementById('send-to')?.focus();
    } catch {
      toast('Couldn’t read the clipboard. Paste with Ctrl+V instead.');
    }
  },
  pick: (d) => {
    ui.draft = { ...freshDraft(), input: d.addr, address: d.addr };
    go('send/check');
  },
  'to-check': () => {
    const result = resolveInput(store.get(), me(), ui.draft.input);
    if (!result.address) return;
    ui.draft.address = result.address;
    ui.draft.ack = false;
    ui.draft.hold = null;
    go('send/check');
  },
  'use-known': (d) => {
    ui.draft = { ...freshDraft(), input: d.addr, address: d.addr };
    render();
    toast('Switched to your saved address');
  },
  'send-anyway': () => {
    ui.draft.ack = true;
    go('send/amount');
  },
  key: (d) => pressKey(d.k),
  hold: (d) => {
    ui.draft.hold = d.k;
    render();
  },
  'send-now': () => {
    const d = ui.draft;
    const viewer = me();
    const check = analyze(store.get(), viewer, d.address, now());
    let tx;
    store.update((s) => {
      tx = send(s, { from: viewer, to: d.address, amount: toLamports(d.amount), memo: d.memo.trim(), hold: d.hold || check.recommendedHold, flags: check.flags });
    });
    ui.draft = freshDraft();
    go(`tx/${tx.id}`);
  },
  undo: (d) => {
    store.update((s) => {
      cancel(s, d.id, me());
    });
    toast('Payment undone. The money is back in your balance.');
    go(`tx/${d.id}`);
  },
  claim: (d) => {
    store.update((s) => {
      claim(s, d.id, me());
    });
    toast('Collected. It’s in your balance.');
  },

  // Contacts
  trust: (d) => store.update((s) => {
    const contact = (s.contacts[me()] || []).find((c) => c.address === d.addr);
    setTrusted(s, me(), d.addr, !contact?.trusted);
  }),
  'contact-add': (d) => {
    const result = resolveInput(store.get(), me(), ui.contact.to);
    if (!result.address || !ui.contact.name.trim()) return;
    store.update((s) => {
      addContact(s, me(), { address: result.address, name: ui.contact.name.trim(), trusted: d.trusted === 'true' });
    });
    ui.contact = { name: '', to: '', ack: false };
    toast('Contact saved');
  },
  'contact-ack': () => {
    ui.contact.ack = true;
    render();
  },
  'notices-read': () => store.update((s) => {
    for (const n of s.notices[me()] || []) n.read = true;
  }),

  // Demo controls
  'demo-toggle': () => {
    ui.demoOpen = !ui.demoOpen;
    render();
  },
  'demo-view': (d) => {
    store.update((s) => {
      s.viewer = d.addr;
    });
    ui.draft = freshDraft();
    ui.demoOpen = false;
    lastNoticeId = (store.get().notices[d.addr] || [])[0]?.id || '';
    go('home');
  },
  'demo-dust': () => {
    store.update((s) => {
      simulateDust(s, me());
    });
    ui.demoOpen = false;
    go('home');
  },
  'demo-incoming': () => {
    store.update((s) => {
      const from = me() === ADDR.aoife ? s.owner : ADDR.aoife;
      simulateIncoming(s, from, me(), SOL(0.5), 'Concert tickets');
    });
    ui.demoOpen = false;
    go('home');
  },
  'demo-ff': (d) => store.update((s) => {
    s.clockOffset = (s.clockOffset || 0) + Number(d.ms);
    settle(s);
  }),
  'demo-short': () => store.update((s) => {
    s.shortTimers = !s.shortTimers;
  }),
  'demo-reset': () => {
    if (!window.confirm('Reset the demo? This clears the wallet and history saved in this browser.')) return;
    resetAll();
    lastNoticeId = null;
    go('welcome');
  },
};

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  if (e.target === demo && ui.demoOpen) {
    ui.demoOpen = false;
    render();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = actions[el.dataset.action];
  if (!action) return;
  e.preventDefault();
  try {
    await action(el.dataset, el);
  } catch (err) {
    toast(err?.message || 'Something went wrong.');
    render();
  }
});

document.addEventListener('input', (e) => {
  const model = e.target.dataset?.model;
  if (!model) return;
  const [scope, key] = model.split('.');
  ui[scope][key] = e.target.value;
  if (scope === 'draft' && key === 'input') ui.draft.address = null;
  if (scope === 'contact' && key === 'to') ui.contact.ack = false;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.demoOpen) {
    ui.demoOpen = false;
    render();
    return;
  }
  if (e.key === 'Enter' && e.target.id === 'send-to') {
    actions['to-check']();
    return;
  }
  if (parseRoute().path !== 'send/amount' || e.target.closest('input, textarea')) return;
  if (/^[0-9]$/.test(e.key)) pressKey(e.key);
  else if (e.key === '.' || e.key === ',') pressKey('.');
  else if (e.key === 'Backspace') pressKey('back');
  else if (e.key === 'Enter') document.querySelector('[data-action="send-now"]:not(:disabled)')?.click();
  else return;
  e.preventDefault();
});

// Hover tooltip for chart segments ([data-tip]); the token list below each chart is the
// keyboard and screen-reader route to the same numbers.
const tipEl = document.getElementById('tip');
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) {
    tipEl.classList.remove('show');
    return;
  }
  const wrap = tipEl.parentElement.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  tipEl.textContent = el.dataset.tip;
  const half = tipEl.offsetWidth / 2;
  const x = Math.min(Math.max(box.left + box.width / 2 - wrap.left, half + 8), wrap.width - half - 8);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${box.top - wrap.top - 8}px`;
  tipEl.classList.add('show');
});
document.addEventListener('scroll', () => tipEl.classList.remove('show'), true);

// ---------- Start ----------
store.subscribe(render);
window.addEventListener('hashchange', render);
store.update((s) => settle(s) || false);
lastNoticeId = (store.get().notices[me()] || [])[0]?.id ?? null;
render();

setInterval(() => {
  store.update((s) => settle(s) || false);
  announceNewNotice();
  if (signature() !== phaseSignature) render();
  else updateLive();
}, 1000);
