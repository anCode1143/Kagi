// Sending: pick a recipient → Kagi checks it → choose amount and undo window.
import { esc, money, short, span, toLamports, LAMPORTS_PER_SOL } from '../format.js';
import { ASSETS, usd } from '../assets.js';
import { icon } from '../icons.js';
import { resolveInput, analyze, commonPrefix, commonSuffix, amountCheck, suggestedHold } from '../guards.js';
import { HOLDS, holdMs, expiryMs } from '../ledger.js';
import { bar, tabbar, who, avatar, personName, groupedAddress } from './shell.js';

function payeePill(contact) {
  return contact?.trusted
    ? `<span class="pill green">${icon('zap', 13)} Instant</span>`
    : `<span class="pill blue">${icon('clock', 13)} Short hold</span>`;
}

// ---------- Step 1: who are you paying? ----------
export function recipient(s, viewer, ui) {
  const d = ui.draft;
  const r = resolveInput(s, viewer, d.input);
  let hint = '<span class="hint info">Use a contact or @username when you can. Pasted addresses are easy to fake.</span>';
  if (r.kind === 'username') {
    hint = `<span class="hint ok">${icon('check', 15)} @${esc(r.username)} · ${esc(s.accounts[r.address].name)}</span>`;
  } else if (r.kind === 'address') {
    const p = who(s, viewer, r.address);
    hint = `<span class="hint info">${icon('wallet', 15)} ${p.kind === 'unknown' ? 'Address' : esc(p.name)} · <code>${esc(short(r.address))}</code></span>`;
  } else if (r.kind === 'invalid') {
    hint = `<span class="hint bad">${icon('alert', 15)} ${esc(r.error)}</span>`;
  }

  const q = d.input.trim().toLowerCase().replace(/^@/, '');
  const contacts = (s.contacts[viewer] || []).filter((c) => !q
    || c.name.toLowerCase().includes(q)
    || (s.accounts[c.address]?.username || '').includes(q)
    || c.address.toLowerCase().startsWith(q));
  const others = q.length >= 2
    ? Object.values(s.accounts).filter((a) => a.kind === 'kagi' && a.address !== viewer && a.username.startsWith(q) && !contacts.some((c) => c.address === a.address))
    : [];

  const contactRows = contacts.map((c) => {
    const p = who(s, viewer, c.address);
    return `<button class="row" data-action="pick" data-addr="${esc(c.address)}">
      ${avatar(p)}
      <span class="row-text"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${p.sub?.includes('…') ? `<span class="mono">${esc(p.sub)}</span>` : esc(p.sub || '')}</span></span>
      <span class="row-end">${payeePill(c)}</span>
    </button>`;
  }).join('');
  const otherRows = others.map((a) => `<button class="row" data-action="pick" data-addr="${esc(a.address)}">
      ${avatar({ name: a.name, kind: 'person' })}
      <span class="row-text"><span class="row-title">${esc(a.name)}</span><span class="row-sub">@${esc(a.username)} · on Kagi</span></span>
      <span class="row-end">${payeePill(null)}</span>
    </button>`).join('');

  return `<div class="screen with-tabs">
    ${bar({ title: 'Send', back: 'home' })}
    <div class="field">
      <label class="sr-only" for="send-to">Who are you paying?</label>
      <span class="input">
        ${icon('search', 18)}
        <input id="send-to" data-model="draft.input" value="${esc(d.input)}" placeholder="Name, @username or address" autocomplete="off" autocapitalize="none" spellcheck="false" autofocus>
        <button class="chip-btn" data-action="paste">${icon('paste', 15)} Paste</button>
      </span>
      ${hint}
    </div>
    ${d.input.trim() ? `<button class="btn primary gap-16" data-action="to-check" ${r.address ? '' : 'disabled'}>Check recipient</button>` : ''}

    ${contactRows || otherRows ? `
      <div class="section-title"><span>${q ? 'Matches' : 'Contacts'}</span></div>
      <div class="card list">${contactRows}${otherRows}</div>` : ''}

    <div class="alert blue gap-16">
      <span class="alert-icon">${icon('shield', 18)}</span>
      <div class="alert-body"><strong>How Kagi protects this payment</strong><p>Trusted people get paid instantly. Everyone else is checked first and held for a few minutes, so you can undo a mistake.</p></div>
    </div>
  </div>
  ${tabbar('send')}`;
}

// ---------- Step 2: the safety check ----------
const CHECK_ICON = { ok: 'check', warn: 'clock', danger: 'alert', info: 'undo' };

export function compare(entered, known, label, enteredLabel = 'You entered') {
  const pre = commonPrefix(entered, known);
  const suf = commonSuffix(entered, known, pre);
  const same = short(entered) === short(known);
  return `<div class="card pad compare">
    <div class="compare-short">
      <div class="compare-chip warn"><small>${esc(enteredLabel)}</small><code>${esc(short(entered))}</code></div>
      <span class="compare-eq" aria-hidden="true">${same ? '=' : '≈'}</span>
      <div class="compare-chip"><small>${esc(label)}</small><code>${esc(short(known))}</code></div>
    </div>
    <p class="compare-note">${same ? 'Identical when shortened, which is how most wallets show them.' : 'Almost identical at a glance.'}</p>
    <div class="compare-line warn"><small>${esc(enteredLabel)}</small><code>${groupedAddress(entered, pre, entered.length - suf)}</code></div>
    <div class="compare-line"><small>${esc(label)}</small><code>${groupedAddress(known, pre, known.length - suf)}</code></div>
  </div>`;
}

export function check(s, viewer, ui, t) {
  const d = ui.draft;
  const c = analyze(s, viewer, d.address, t);
  const p = who(s, viewer, d.address);
  const like = c.lookalike || c.typo;

  let verdict;
  if (c.risk === 'suspicious') {
    verdict = {
      tone: 'amber', icon: 'alert',
      title: c.lookalike ? `Stop. This isn’t your ${like.label}` : c.typo ? `Careful. This looks like a typo of ${like.label}` : 'Careful. This address sent you a tiny payment',
      body: c.lookalike
        ? 'It looks the same at first glance, but it’s a different address. Scammers make copycat addresses to trick people into paying them.'
        : c.typo ? 'One wrong key can send money to an address nobody owns.' : 'Scammers send tiny amounts so their address shows up in your history, hoping you’ll copy it later.',
    };
  } else if (c.risk === 'trusted') {
    verdict = { tone: 'green', icon: 'check', title: `You trust ${p.name}`, body: 'This payment goes straight through.' };
  } else if (c.risk === 'known') {
    verdict = { tone: 'blue', icon: 'check', title: `You’ve paid ${p.name} before`, body: 'Kagi still waits a few minutes before it goes, in case you change your mind.' };
  } else {
    verdict = { tone: 'blue', icon: 'shield', title: 'You haven’t paid this person before', body: 'Kagi waits a few minutes before first payments go, so you can take it back if something’s wrong.' };
  }

  const handle = c.account?.username ? `<span class="pill grey">@${esc(c.account.username)}</span>` : '';
  let buttons;
  if (c.risk === 'suspicious' && like) {
    buttons = `<button class="btn primary" data-action="use-known" data-addr="${esc(like.of)}">Use my real ${esc(like.label)}</button>
      <button class="btn secondary" data-action="send-anyway">Send anyway</button>`;
  } else if (c.risk === 'suspicious') {
    buttons = `<button class="btn primary" data-action="go" data-to="home">Don’t send</button>
      <button class="btn secondary" data-action="send-anyway">Send anyway</button>`;
  } else {
    buttons = `<button class="btn primary" data-action="go" data-to="send/amount">Continue</button>`;
  }

  return `<div class="screen">
    ${bar({ title: 'Check recipient', back: 'send' })}
    <div class="verdict">
      <span class="verdict-icon ${verdict.tone}">${icon(verdict.icon, 26)}</span>
      <h2 class="verdict-title">${esc(verdict.title)}</h2>
      <p class="verdict-body">${esc(verdict.body)}</p>
    </div>

    ${like ? compare(d.address, like.of, like.label) : `
      <div class="card pad recipient-card">
        <div class="recipient-head">${avatar(p)}<div><strong>${personName(p)}</strong>${handle}</div></div>
        <code class="addr-full">${groupedAddress(d.address)}</code>
      </div>`}

    <ul class="checks card">
      ${c.checks.map((x) => `<li class="check ${x.status}"><span class="check-icon">${icon(CHECK_ICON[x.status], 15)}</span><div><strong>${esc(x.title)}</strong><span>${esc(x.detail)}</span></div></li>`).join('')}
    </ul>

    <div class="stack push actions">${buttons}</div>
  </div>`;
}

// ---------- Step 3: amount and undo window ----------
// Shows the keypad text as typed ("0.25"), with a thousands separator and a smaller SOL unit.
function displayAmount(text) {
  const [whole, decimals] = (text || '0').split('.');
  const number = `${Number(whole || '0').toLocaleString('en-IE')}${decimals !== undefined ? `.${decimals}` : ''}`;
  return `${esc(number)}<span class="unit">SOL</span>`;
}

export function amount(s, viewer, ui, t) {
  const d = ui.draft;
  const c = analyze(s, viewer, d.address, t);
  const p = who(s, viewer, d.address);
  const balance = s.accounts[viewer].balance;
  const lamports = toLamports(d.amount);
  const over = lamports > balance;
  const size = amountCheck(s, viewer, lamports);
  const suggested = suggestedHold(c, size);
  const hold = d.hold || suggested;
  const options = HOLDS.filter((h) => h.key !== 'none' || c.trusted);
  const riskPill = {
    trusted: `<span class="pill green">${icon('zap', 12)} Trusted</span>`,
    known: `<span class="pill blue">Paid before</span>`,
    new: `<span class="pill blue">First payment</span>`,
    suspicious: `<span class="pill amber">${icon('alert', 12)} Warning</span>`,
  }[c.risk];
  const fiat = usd((lamports / LAMPORTS_PER_SOL) * ASSETS.SOL.price);

  const explain = hold === 'none'
    ? `${esc(p.name)} gets it straight away. You can’t take back an instant payment.`
    : `${esc(p.name)} can collect it after <strong>${span(holdMs(s, hold))}</strong>. Until then, you can take it back. If nobody collects it within ${span(expiryMs(s))}, it comes back to you.`;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

  return `<div class="screen">
    <header class="bar">
      <button class="icon-btn" data-action="go" data-to="send/check" aria-label="Back">${icon('back')}</button>
      <div class="to-chip">${avatar(p, 'sm')}<div><strong>${personName(p)}</strong>${riskPill}</div></div>
      <span class="bar-gap"></span>
    </header>

    <div class="amount-block">
      <div class="amount-display tabular" aria-live="polite">${displayAmount(d.amount)}</div>
      <div class="amount-sub ${over ? 'bad' : ''}">${over ? `That’s more than you have (${money(balance)})` : `About ${fiat} · you have ${money(balance)}`}</div>
    </div>

    ${size.flagged && !over ? `<div class="alert amount-alert" role="status">
      <span class="alert-icon">${icon('alert', 20)}</span>
      <div class="alert-body">
        <strong>${size.unusual ? 'That’s a lot more than you usually send' : 'That’s more than half of your money'}</strong>
        <p>${size.unusual ? `You usually send about ${money(size.typical)}, and your biggest payment was ${money(size.largest)}. ` : ''}If someone is rushing you to pay, stop and talk to someone you trust first. Kagi will wait at least an hour before it goes.</p>
      </div>
    </div>` : ''}

    <div class="card pad hold-card">
      <div class="hold-head">${icon('undo', 20)}<strong>Time to change your mind</strong>${hold === suggested ? '<span class="pill grey">Suggested</span>' : ''}</div>
      <div class="chips" role="group" aria-label="Time to change your mind">
        ${options.map((h) => `<button class="chip" data-action="hold" data-k="${h.key}" aria-pressed="${h.key === hold}">${esc(h.label)}</button>`).join('')}
      </div>
      <p class="hold-explain">${explain}</p>
    </div>

    <label class="memo"><span class="sr-only">What’s it for?</span>
      <input id="send-memo" data-model="draft.memo" value="${esc(d.memo)}" placeholder="What’s it for? (optional)" maxlength="60" autocomplete="off">
    </label>

    <div class="keypad" role="group" aria-label="Amount keypad">
      ${keys.map((k) => `<button class="key" data-action="key" data-k="${k}" aria-label="${k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}">${k === 'back' ? icon('backspace', 24) : k}</button>`).join('')}
    </div>

    <button class="btn primary" data-action="send-now" ${lamports > 0 && !over ? '' : 'disabled'}>Send ${esc(money(lamports))}</button>
  </div>`;
}
