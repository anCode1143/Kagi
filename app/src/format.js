// Small formatting helpers shared by every view.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Amounts are stored in lamports, Solana's smallest unit: 1 SOL = 1,000,000,000 lamports.
export const LAMPORTS_PER_SOL = 1e9;

// Up to 4 decimals for everyday amounts; tiny "dust" amounts keep all 9 so they don't show as 0.
function solNumber(lamports, minimumFractionDigits = 0) {
  const sol = Math.abs(lamports) / LAMPORTS_PER_SOL;
  const maximumFractionDigits = sol > 0 && sol < 0.0001 ? 9 : 4;
  return sol.toLocaleString('en-IE', { minimumFractionDigits, maximumFractionDigits });
}

export function money(lamports, { sign = false } = {}) {
  const text = `${solNumber(lamports)} SOL`;
  if (sign) return (lamports < 0 ? '−' : '+') + text;
  return (lamports < 0 ? '−' : '') + text;
}

// Splits a balance into "12" and ".84" so the decimals can be drawn smaller.
export function moneyParts(lamports) {
  const text = solNumber(lamports, 2);
  const dot = text.indexOf('.');
  return { whole: text.slice(0, dot), frac: text.slice(dot) };
}

// Keypad text ("0.25") to lamports, without floating-point rounding.
export function toLamports(text) {
  const [whole = '0', decimals = ''] = String(text || '0').split('.');
  return Number(whole || '0') * LAMPORTS_PER_SOL + Number(`${decimals}000000000`.slice(0, 9));
}

export const SOL = (amount) => Math.round(amount * LAMPORTS_PER_SOL);

export const short = (address) => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '');

const pad = (n) => String(n).padStart(2, '0');

export function when(time, reference) {
  const date = new Date(time);
  const ref = new Date(reference);
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === ref.toDateString()) return `Today, ${hm}`;
  const yesterday = new Date(reference - 864e5);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${hm}`;
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

// Clock time for today ("13:46"), otherwise date and time ("3 Oct, 13:46").
export function at(time, reference) {
  const date = new Date(time);
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === new Date(reference).toDateString()) return hm;
  return `${date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}, ${hm}`;
}

export function dateTime(time) {
  const date = new Date(time);
  return `${date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Countdown text: "9:48" or "1:02:03".
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Human length of time: "10 minutes", "7 days".
export function span(ms) {
  if (ms >= 864e5 * 1.5) return `${Math.round(ms / 864e5)} days`;
  if (ms >= 36e5) {
    const h = Math.round(ms / 36e5);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (ms >= 6e4) {
    const m = Math.round(ms / 6e4);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  const s = Math.max(1, Math.ceil(ms / 1000));
  return `${s} second${s === 1 ? '' : 's'}`;
}

export function initials(name) {
  const parts = String(name || '?').replace(/^@/, '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
