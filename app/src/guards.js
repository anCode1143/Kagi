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
    checks.push({ status: 'ok', title: `This is really @${account.username}`, detail: `${account.name}, on Kagi` });
  }
  checks.push(paid.length
    ? { status: 'ok', title: `You’ve paid ${contact?.name || 'this address'} ${paid.length === 1 ? 'once' : `${paid.length} times`}`, detail: `Last time: ${when(lastPaidAt, t)}` }
    : { status: 'warn', title: 'You’ve never paid this address', detail: 'Kagi waits a few minutes before first payments go, so you can take it back.' });
  if (lookalike) {
    checks.push({ status: 'danger', title: `Pretends to be ${lookalike.label}`, detail: `Only the first ${lookalike.prefix} and last ${lookalike.suffix} characters match. It’s a copycat.` });
  } else if (typo) {
    checks.push({ status: 'danger', title: `Almost the same as ${typo.label}`, detail: `${typo.distance === 1 ? 'Just 1 character is' : `${typo.distance} characters are`} different. Was it a typing mistake?` });
  } else {
    checks.push({ status: 'ok', title: 'Doesn’t copy anyone you know', detail: 'Kagi compared it with your contacts and past payments.' });
  }
  if (dust) {
    checks.push({ status: 'danger', title: `It sent you a tiny payment ${when(dust.at, t).toLowerCase().startsWith('today') ? 'today' : 'recently'}`, detail: `Just ${money(dust.amount)}. Scammers do this so their address shows up in your history.` });
  }
  if (trusted) {
    checks.push({ status: 'ok', title: 'Someone you trust', detail: 'Goes straight through, with no waiting.' });
  } else {
    checks.push({ status: 'info', title: 'Comes back if nobody collects it', detail: 'Typed it wrong? If nobody collects it in 7 days, you get it back.' });
  }

  let risk = 'new';
  if (lookalike || typo || dust) risk = 'suspicious';
  else if (trusted) risk = 'trusted';
  else if (paid.length) risk = 'known';

  const recommendedHold = { trusted: 'none', known: '10m', new: '10m', suspicious: '1h' }[risk];
  const flags = [lookalike && 'lookalike', typo && 'typo', dust && 'dust', !paid.length && 'new'].filter(Boolean);

  return { address, account, contact, paidCount: paid.length, lastPaidAt, trusted, lookalike, typo, dust, checks, risk, recommendedHold, flags };
}

// Is this amount unusual for you? Big, out-of-pattern payments are what scammers rush people into.
export function amountCheck(s, viewer, lamports) {
  const past = s.txs.filter((tx) => tx.from === viewer && isSuccessful(tx)).map((tx) => tx.amount).sort((a, b) => a - b);
  const balance = s.accounts[viewer]?.balance || 0;
  const typical = past.length ? past[Math.floor(past.length / 2)] : 0;
  const largest = past.length ? past[past.length - 1] : 0;
  const unusual = lamports > 0 && past.length >= 3 && lamports >= Math.max(typical * 5, largest * 1.5);
  const bigShare = lamports > 0 && balance > 0 && lamports >= balance * 0.5;
  return { typical, largest, unusual, bigShare, flagged: unusual || bigShare };
}

// "What's this payment for?" The answers scammers push people towards get a warning or a block.
export const PURPOSES = [
  { key: 'family', label: 'Family or a friend' },
  { key: 'buying', label: 'Buying something' },
  { key: 'investment', label: 'An investment', risk: 'warn', title: 'Most investment offers from strangers are scams', body: 'If someone promised you big or guaranteed returns, stop. Real investments don’t come through messages from people you don’t know.' },
  { key: 'online', label: 'Someone I met online', risk: 'warn', title: 'Scammers make friends online first', body: 'They can chat for weeks before asking for money. Never send money to someone you haven’t met in person.' },
  { key: 'support', label: 'Support told me to', risk: 'warn', title: 'Real companies never ask you to move your crypto', body: 'Banks, exchanges and Kagi will never tell you to send money somewhere “to keep it safe”. This is a scam.' },
  { key: 'giveaway', label: 'A giveaway or prize', risk: 'block', title: 'Kagi won’t send this', body: 'Nobody gives away crypto if you send some first. This is always a scam.' },
  { key: 'other', label: 'Something else' },
];
export const purposeFor = (key) => PURPOSES.find((p) => p.key === key) || null;

// Ask only when it matters: first payments, flagged addresses, and big or unusual amounts.
export const needsPurpose = (check, amount) => check.risk === 'new' || check.risk === 'suspicious' || amount.flagged;

// Big or unusual amounts wait at least 1 hour, even for trusted people; risky reasons wait 24 hours.
const HOLD_ORDER = ['none', '10m', '1h', '24h'];
const atLeast = (hold, min) => (HOLD_ORDER.indexOf(hold) >= HOLD_ORDER.indexOf(min) ? hold : min);
export function suggestedHold(check, amount, purpose = null) {
  let hold = check.recommendedHold;
  if (amount.flagged) hold = atLeast(hold, '1h');
  if (purpose?.risk) hold = atLeast(hold, '24h');
  return hold;
}

// Guard: a 12–24 word recovery phrase typed or pasted anywhere is blocked and never stored.
export function looksLikeRecoveryPhrase(text) {
  const words = String(text || '').trim().toLowerCase().split(/\s+/);
  return words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w));
}

// Incoming dust from an address that imitates one you know: surfaced as an alert on Home.
export function dustAlerts(s, viewer, t) {
  const dismissed = new Set(s.dismissed[viewer] || []);
  return s.txs
    .filter((tx) => tx.to === viewer && tx.amount <= DUST_LIMIT && tx.flags?.includes('dust') && !dismissed.has(tx.id) && phase(tx, t) === 'completed')
    .map((tx) => ({ tx, check: analyze(s, viewer, tx.from, t) }))
    .filter(({ check }) => check.lookalike || check.typo);
}
