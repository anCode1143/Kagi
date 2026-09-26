// The safety guards. Given who you are and where you're sending, decide how risky it is.
//   1. Have you sent money to this address before?
//   2. Is it similar to an address you know? (address poisoning, typos)
//   3. Did it send you a tiny "dust" payment? (dusting)
//   4. If nobody claims it, it comes back automatically.
//   5. Trusted payees go straight through.
import { isAddress } from './base58.js';
import { money, when, SOL } from './format.js';
import { phase } from './ledger.js';

const DUST_LIMIT = SOL(0.001); // 0.001 SOL or less counts as dust
const USERNAME = /^[a-z0-9_.]{3,20}$/;

export const validUsername = (name) => USERNAME.test(name);

// Turns what the user typed into an address.
export function resolveInput(s, viewer, raw) {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'empty' };
  if (isAddress(text)) {
    if (text === viewer) return { kind: 'invalid', error: 'That’s your own address.' };
    return { kind: 'address', address: text };
  }
  const name = text.replace(/^@/, '').toLowerCase();
  if (text.startsWith('@') || validUsername(name)) {
    const address = s.usernames[name];
    if (!address) return { kind: 'invalid', error: `No one on Kagi is called @${name}.` };
    if (address === viewer) return { kind: 'invalid', error: 'That’s you.' };
    return { kind: 'username', address, username: name };
  }
  return { kind: 'invalid', error: 'That isn’t a valid address. Solana addresses are 32–44 letters and numbers.' };
}

// Every address the viewer has a reason to recognise, with a friendly label.
export function knownAddresses(s, viewer) {
  const known = new Map();
  for (const c of s.contacts[viewer] || []) known.set(c.address, c.name);
  for (const tx of s.txs) {
    if (tx.from === viewer && isSuccessful(tx) && !known.has(tx.to)) {
      known.set(tx.to, s.accounts[tx.to]?.username ? `@${s.accounts[tx.to].username}` : 'an address you paid');
    }
  }
  return known;
}

const isSuccessful = (tx) => tx.status === 'completed' || tx.status === 'claimed';

export function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function commonSuffix(a, b, prefix = 0) {
  let i = 0;
  const max = Math.min(a.length, b.length) - prefix;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

export function analyze(s, viewer, address, t) {
  const account = s.accounts[address];
  const contact = (s.contacts[viewer] || []).find((c) => c.address === address);
  const paid = s.txs.filter((tx) => tx.from === viewer && tx.to === address && isSuccessful(tx));
  const lastPaidAt = paid.reduce((max, tx) => Math.max(max, tx.createdAt), 0);
  const trusted = Boolean(contact?.trusted);

  // Lookalike and typo checks only matter for addresses you don't already know.
  let lookalike = null;
  let typo = null;
  const known = knownAddresses(s, viewer);
  if (!known.has(address)) {
    for (const [other, label] of known) {
      const pre = commonPrefix(address, other);
      const suf = commonSuffix(address, other, pre);
      if (pre >= 4 && suf >= 4) {
        if (!lookalike || pre + suf > lookalike.prefix + lookalike.suffix) lookalike = { of: other, label, prefix: pre, suffix: suf };
        continue;
      }
      const d = distance(address, other);
      if (d <= 3 && (!typo || d < typo.distance)) typo = { of: other, label, distance: d };
    }
  }

  const dustTx = paid.length === 0
    ? s.txs.filter((tx) => tx.from === address && tx.to === viewer && tx.amount <= DUST_LIMIT).sort((a, b) => b.createdAt - a.createdAt)[0]
    : null;
  const dust = dustTx ? { amount: dustTx.amount, at: dustTx.createdAt } : null;

  const checks = [];
  if (account?.username) {
    checks.push({ status: 'ok', title: `Verified Kagi user @${account.username}`, detail: account.name });
  }
  checks.push(paid.length
    ? { status: 'ok', title: `You’ve paid ${contact?.name || 'this address'} ${paid.length === 1 ? 'once' : `${paid.length} times`}`, detail: `Last payment ${when(lastPaidAt, t)}` }
    : { status: 'warn', title: 'You’ve never sent money here', detail: 'First payments are held for a few minutes, so you can undo a mistake.' });
  if (lookalike) {
    checks.push({ status: 'danger', title: `Looks like ${lookalike.label}, but isn’t`, detail: `Only the first ${lookalike.prefix} and last ${lookalike.suffix} characters match. This is how address-poisoning scams work.` });
  } else if (typo) {
    checks.push({ status: 'danger', title: `One slip away from ${typo.label}`, detail: `${typo.distance === 1 ? 'Just 1 character is' : `${typo.distance} characters are`} different. Did you mistype it?` });
  } else {
    checks.push({ status: 'ok', title: 'Doesn’t imitate anyone you know', detail: 'Compared with your contacts and past payments.' });
  }
  if (dust) {
    checks.push({ status: 'danger', title: `It sent you ${money(dust.amount)} ${when(dust.at, t).toLowerCase().startsWith('today') ? 'today' : 'recently'}`, detail: 'Tiny “dust” payments plant an address in your history so you copy it later.' });
  }
  if (trusted) {
    checks.push({ status: 'ok', title: 'Trusted payee', detail: 'Goes straight through, no hold.' });
  } else {
    checks.push({ status: 'info', title: 'Comes back if nobody collects it', detail: 'Mistyped or dead address? The money returns to you after 7 days.' });
  }

  let risk = 'new';
  if (lookalike || typo || dust) risk = 'suspicious';
  else if (trusted) risk = 'trusted';
  else if (paid.length) risk = 'known';

  const recommendedHold = { trusted: 'none', known: '10m', new: '10m', suspicious: '1h' }[risk];
  const flags = [lookalike && 'lookalike', typo && 'typo', dust && 'dust', !paid.length && 'new'].filter(Boolean);

  return { address, account, contact, paidCount: paid.length, lastPaidAt, trusted, lookalike, typo, dust, checks, risk, recommendedHold, flags };
}

// Incoming dust from an address that imitates one you know: surfaced as an alert on Home.
export function dustAlerts(s, viewer, t) {
  const dismissed = new Set(s.dismissed[viewer] || []);
  return s.txs
    .filter((tx) => tx.to === viewer && tx.amount <= DUST_LIMIT && tx.flags?.includes('dust') && !dismissed.has(tx.id) && phase(tx, t) === 'completed')
    .map((tx) => ({ tx, check: analyze(s, viewer, tx.from, t) }))
    .filter(({ check }) => check.lookalike || check.typo);
}
