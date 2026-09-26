// A simulated ledger standing in for the Solana program.
// A protected payment is an escrow ("hold") with two deadlines:
//   holdUntil  – before this, only the sender can act (Undo). After it, the recipient can collect.
//   expiresAt  – if nobody has collected by now, the money returns to the sender automatically.
import { now } from './store.js';
import { money, SOL } from './format.js';
import { lookalikeOf } from './base58.js';
import { ADDR } from './seed.js';

const MIN = 60e3;
const HOUR = 36e5;
const DAY = 864e5;

export const HOLDS = [
  { key: 'none', label: 'Instant', long: 'straight away' },
  { key: '10m', label: '10 min', long: '10 minutes', ms: 10 * MIN, demoMs: 15e3 },
  { key: '1h', label: '1 hour', long: '1 hour', ms: HOUR, demoMs: 30e3 },
  { key: '24h', label: '24 hours', long: '24 hours', ms: DAY, demoMs: 60e3 },
];
const EXPIRY = { ms: 7 * DAY, demoMs: 90e3 };

export const holdMs = (s, key) => {
  const h = HOLDS.find((x) => x.key === key);
  if (!h?.ms) return 0;
  return s.shortTimers ? h.demoMs : h.ms;
};
export const expiryMs = (s) => (s.shortTimers ? EXPIRY.demoMs : EXPIRY.ms);

// held → claimable → (claimed | returned); held → cancelled. Instant payments are simply completed.
export function phase(tx, t) {
  if (tx.mode !== 'hold') return tx.status;
  if (tx.status !== 'held') return tx.status;
  if (t < tx.holdUntil) return 'held';
  if (t < tx.expiresAt) return 'claimable';
  return 'expired';
}

let seq = 0;
export const uid = (prefix = 'tx') => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function pushNotice(s, address, notice) {
  if (!s.accounts[address] || s.accounts[address].kind !== 'kagi') return;
  (s.notices[address] ||= []).unshift({ id: uid('n'), at: now(), read: false, ...notice });
}

export function nameFor(s, viewer, address) {
  const contact = (s.contacts[viewer] || []).find((c) => c.address === address);
  if (contact) return contact.name;
  const account = s.accounts[address];
  if (account?.username) return `@${account.username}`;
  if (account?.label) return account.label;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function credit(s, address, amount) {
  const account = s.accounts[address];
  if (account) account.balance = (account.balance || 0) + amount;
}

export function send(s, { from, to, amount, memo = '', hold = 'none', flags = [] }) {
  const sender = s.accounts[from];
  if (!sender || sender.balance < amount) throw new Error('Not enough money for this payment.');
  if (!(amount > 0)) throw new Error('Enter an amount.');
  const t = now();
  sender.balance -= amount;
  const tx = { id: uid(), from, to, amount, memo, createdAt: t, flags };
  if (hold === 'none') {
    Object.assign(tx, { mode: 'instant', status: 'completed', settledAt: t });
    credit(s, to, amount);
    pushNotice(s, to, { kind: 'received', txId: tx.id, title: `${nameFor(s, to, from)} sent you ${money(amount)}`, body: memo || 'It’s already in your balance.' });
  } else {
    const holdUntil = t + holdMs(s, hold);
    Object.assign(tx, { mode: 'hold', status: 'held', holdKey: hold, holdUntil, expiresAt: t + expiryMs(s) });
    pushNotice(s, to, { kind: 'incoming', txId: tx.id, title: `${nameFor(s, to, from)} is sending you ${money(amount)}`, body: 'You can collect it once the hold ends.' });
  }
  s.txs.push(tx);
  return tx;
}

export function cancel(s, id, by) {
  const tx = s.txs.find((x) => x.id === id);
  if (!tx || tx.from !== by) throw new Error('Only the sender can undo a payment.');
  if (phase(tx, now()) !== 'held') throw new Error('The undo window has closed.');
  tx.status = 'cancelled';
  tx.settledAt = now();
  credit(s, tx.from, tx.amount);
  pushNotice(s, tx.to, { kind: 'cancelled', txId: tx.id, title: `${nameFor(s, tx.to, tx.from)} cancelled a payment`, body: `${money(tx.amount)} went back to them before it could be collected.` });
  return tx;
}

export function claim(s, id, by) {
  const tx = s.txs.find((x) => x.id === id);
  if (!tx || tx.to !== by) throw new Error('This payment isn’t yours to collect.');
  if (phase(tx, now()) !== 'claimable') throw new Error('This payment can’t be collected right now.');
  tx.status = 'claimed';
  tx.settledAt = now();
  credit(s, tx.to, tx.amount);
  pushNotice(s, tx.from, { kind: 'claimed', txId: tx.id, title: `${nameFor(s, tx.from, tx.to)} collected ${money(tx.amount)}`, body: 'The payment is complete.' });
  autoTrust(s, tx);
  return tx;
}

// After a clean payment is collected, the recipient becomes a trusted payee for next time.
// Never for payments that were flagged as suspicious.
function autoTrust(s, tx) {
  if (tx.flags?.some((f) => ['lookalike', 'typo', 'dust'].includes(f))) return;
  const list = (s.contacts[tx.from] ||= []);
  let contact = list.find((c) => c.address === tx.to);
  if (contact?.trusted) return;
  if (!contact) {
    contact = { address: tx.to, name: nameFor(s, tx.from, tx.to), trusted: false, addedAt: now() };
    list.push(contact);
  }
  contact.trusted = true;
  pushNotice(s, tx.from, { kind: 'trusted', txId: tx.id, title: `${contact.name} is now a trusted payee`, body: 'Future payments to them go straight through. You can change this in Contacts.' });
}

// Runs every second: returns expired holds and lets live external wallets collect.
export function settle(s) {
  const t = now();
  let changed = false;
  for (const tx of s.txs) {
    if (tx.mode !== 'hold' || tx.status !== 'held') continue;
    const p = phase(tx, t);
    if (p === 'expired') {
      tx.status = 'returned';
      tx.settledAt = tx.expiresAt;
      credit(s, tx.from, tx.amount);
      pushNotice(s, tx.from, { kind: 'returned', txId: tx.id, title: `Your ${money(tx.amount)} came back`, body: `Nobody collected it from ${nameFor(s, tx.from, tx.to)}, so it returned automatically.` });
      changed = true;
    } else if (p === 'claimable' && s.accounts[tx.to]?.autoClaim) {
      tx.status = 'claimed';
      tx.settledAt = t;
      credit(s, tx.to, tx.amount);
      pushNotice(s, tx.from, { kind: 'claimed', txId: tx.id, title: `${nameFor(s, tx.from, tx.to)} collected ${money(tx.amount)}`, body: 'The payment is complete.' });
      changed = true;
    }
  }
  return changed;
}

export function topUp(s, address, amount) {
  credit(s, address, amount);
  s.txs.push({ id: uid(), from: 'topup', to: address, amount, memo: 'Demo top-up', createdAt: now(), mode: 'instant', status: 'completed', flags: [] });
}

export function setTrusted(s, owner, address, trusted) {
  const contact = (s.contacts[owner] || []).find((c) => c.address === address);
  if (contact) contact.trusted = trusted;
}

export function addContact(s, owner, { address, name, trusted = false }) {
  const list = (s.contacts[owner] ||= []);
  const existing = list.find((c) => c.address === address);
  if (existing) {
    existing.name = name || existing.name;
    return existing;
  }
  const contact = { address, name, trusted, addedAt: now() };
  list.push(contact);
  return contact;
}

// Demo: an attacker "dusts" you from a lookalike of an address you've paid.
export function simulateDust(s, viewer) {
  const contacts = s.contacts[viewer] || [];
  const target = contacts.find((c) => s.accounts[c.address]?.kind === 'external') || contacts[0] || { address: ADDR.exchange };
  const fake = lookalikeOf(target.address);
  s.accounts[fake] = { address: fake, kind: 'external', autoClaim: true, balance: 0 };
  const amount = SOL(0.000001);
  const tx = { id: uid(), from: fake, to: viewer, amount, memo: '', createdAt: now(), mode: 'instant', status: 'completed', settledAt: now(), flags: ['dust'] };
  s.txs.push(tx);
  credit(s, viewer, amount);
  pushNotice(s, viewer, { kind: 'dust', txId: tx.id, title: `A lookalike address sent you ${money(amount)}`, body: `It copies ${target.name || 'an address you know'}. Pay from Contacts, never by copying from Activity.` });
  return tx;
}

// Demo: someone sends the viewer a protected payment they'll need to collect.
export function simulateIncoming(s, from, to, amount, memo) {
  return send(s, { from, to, amount, memo, hold: '10m' });
}
