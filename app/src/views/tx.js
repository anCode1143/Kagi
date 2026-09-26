// One payment, from either side, in whatever state it's in.
import { esc, money, short, when, at, dateTime, clock, span } from '../format.js';
import { icon } from '../icons.js';
import { phase } from '../ledger.js';
import { analyze } from '../guards.js';
import { bar, who, avatar, personName } from './shell.js';
import { compare } from './send.js';

const RING_C = 2 * Math.PI * 88;

function timeline(steps, night = false) {
  return `<ol class="timeline card ${night ? 'night' : ''}">${steps.map((st) => `
    <li class="tl ${st.state}">
      <span class="tl-dot">${st.state === 'done' ? icon('check', 12) : ''}</span>
      <div><strong>${esc(st.title)}</strong><span>${st.sub}</span></div>
    </li>`).join('')}</ol>`;
}

function details(rows) {
  return `<div class="card kv">${rows.filter(Boolean).map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div>`;
}

function hero(tone, iconName, title, body) {
  return `<div class="verdict">
    <span class="verdict-icon ${tone}">${icon(iconName, 26)}</span>
    <h2 class="verdict-title">${title}</h2>
    ${body ? `<p class="verdict-body">${body}</p>` : ''}
  </div>`;
}

const idLine = (tx) => `<p class="fine">Payment ID <code>${esc(tx.id)}</code></p>`;

export function txView(s, viewer, id, t) {
  const tx = s.txs.find((x) => x.id === id);
  if (!tx || (tx.from !== viewer && tx.to !== viewer)) {
    return `<div class="screen">${bar({ title: 'Payment', back: 'home' })}<div class="placeholder"><p>This payment isn’t on this account.</p></div></div>`;
  }
  return tx.from === viewer ? outgoing(s, viewer, tx, t) : incoming(s, viewer, tx, t);
}

function outgoing(s, viewer, tx, t) {
  const p = who(s, viewer, tx.to);
  const name = personName(p);
  const p0 = phase(tx, t);
  const flagged = tx.flags?.some((f) => ['lookalike', 'typo', 'dust'].includes(f));

  if (p0 === 'held') {
    const left = Math.max(0, Math.min(1, (tx.holdUntil - t) / (tx.holdUntil - tx.createdAt)));
    return `<div class="screen night">
      <header class="bar">
        <button class="icon-btn" data-action="go" data-to="home" aria-label="Close">${icon('close')}</button>
        <h1 class="bar-title">Payment on hold</h1><span class="bar-gap"></span>
      </header>
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
          <circle class="ring-track" cx="100" cy="100" r="88"></circle>
          <circle class="ring-bar" cx="100" cy="100" r="88" transform="rotate(-90 100 100)"
            stroke-dasharray="${RING_C}" style="stroke-dashoffset:${RING_C * (1 - left)}"
            data-ring data-from="${tx.createdAt}" data-to="${tx.holdUntil}" data-c="${RING_C}"></circle>
        </svg>
        <div class="ring-text"><span class="ring-time tabular" role="timer" aria-hidden="true" data-until="${tx.holdUntil}">${clock(tx.holdUntil - t)}</span><span data-words-until="${tx.holdUntil}" data-suffix="left to undo">${span(Math.max(1000, tx.holdUntil - t))} left to undo</span></div>
      </div>
      <div class="hold-amount">
        <strong class="tabular">${money(tx.amount)}</strong>
        <span>to ${name}</span>
        ${flagged ? `<span class="pill amber">${icon('alert', 12)} Flagged address</span>` : `<span class="pill on-night">${icon('shield', 12)} Protected by Kagi</span>`}
      </div>
      ${timeline([
        { state: 'done', title: 'Sent into a hold', sub: `${esc(when(tx.createdAt, t))} · held by the escrow, not by Kagi` },
        { state: 'now', title: 'You can still take it back', sub: `Until ${esc(at(tx.holdUntil, t))}` },
        { state: 'todo', title: 'They collect it', sub: `Any time after ${esc(at(tx.holdUntil, t))}` },
        { state: 'todo', title: 'Or it comes back to you', sub: `Automatically, if nobody collects it by ${esc(dateTime(tx.expiresAt))}` },
      ], true)}
      <div class="stack push actions">
        <button class="btn white" data-action="undo" data-id="${tx.id}">${icon('undo', 20)} Undo payment</button>
      </div>
    </div>`;
  }

  if (p0 === 'cancelled') {
    return `<div class="screen blue">
      <div class="big-result">
        <span class="big-result-icon">${icon('undo', 36)}</span>
        <h2>${money(tx.amount)} is back</h2>
        <p>You undid the payment before anyone could collect it. Nothing was lost.</p>
      </div>
      ${details([
        ['Was going to', name],
        ['Undone', esc(when(tx.settledAt, t))],
        ['Balance now', `<span class="tabular">${money(s.accounts[viewer].balance)}</span>`],
      ])}
      ${flagged ? `<div class="report gap-16">
        <span class="alert-icon">${icon('shield', 18)}</span>
        <div><strong>Report this lookalike</strong><p>Warn other Kagi users about <code>${esc(short(tx.to))}</code>.</p></div>
        <button class="btn small outline-white" data-action="report" data-addr="${esc(tx.to)}">Report</button>
      </div>` : ''}
      <div class="stack push actions"><button class="btn white blue-text" data-action="go" data-to="home">Done</button></div>
    </div>`;
  }

  if (p0 === 'returned') {
    return `<div class="screen">
      ${bar({ title: 'Payment', back: 'home' })}
      ${hero('blue', 'undo', `Your ${money(tx.amount)} came back`, `Nobody collected it from ${name} within ${span(tx.expiresAt - tx.createdAt)}, so it returned to you automatically. The address may have had a typo.`)}
      ${timeline([
        { state: 'done', title: `Sent ${money(tx.amount)}`, sub: esc(dateTime(tx.createdAt)) },
        { state: 'done', title: 'Nobody collected it', sub: `The deadline was ${esc(dateTime(tx.expiresAt))}` },
        { state: 'done', title: 'Returned to you', sub: `${esc(dateTime(tx.settledAt || tx.expiresAt))} · automatically` },
      ])}
      <div class="alert gap-16">
        <span class="alert-icon">${icon('alert', 18)}</span>
        <div class="alert-body"><p>Without Kagi, money sent to a mistyped address is gone for good. Nobody can reverse it.</p></div>
      </div>
      <div class="stack push actions">
        <button class="btn primary" data-action="go" data-to="send">Send again from Contacts</button>
        <button class="btn secondary" data-action="go" data-to="home">Done</button>
      </div>
    </div>`;
  }

  if (p0 === 'claimable') {
    return `<div class="screen">
      ${bar({ title: 'Payment', back: 'home' })}
      ${hero('blue', 'clock', `Waiting for ${name} to collect`, `The undo window has closed. If nobody collects it by ${esc(dateTime(tx.expiresAt))}, it comes back to you automatically.`)}
      ${timeline([
        { state: 'done', title: `Sent ${money(tx.amount)}`, sub: esc(when(tx.createdAt, t)) },
        { state: 'done', title: 'Undo window closed', sub: esc(when(tx.holdUntil, t)) },
        { state: 'now', title: 'Waiting to be collected', sub: `Returns in <span data-until="${tx.expiresAt}">${clock(tx.expiresAt - t)}</span> if nobody does` },
      ])}
      ${idLine(tx)}
    </div>`;
  }

  // claimed or completed
  const instant = tx.mode === 'instant';
  return `<div class="screen">
    ${bar({ title: 'Payment', back: 'home' })}
    ${hero('green', 'check', instant ? `Sent to ${name}` : `${name} collected it`, instant ? 'It went straight through.' : 'The payment is complete.')}
    ${details([
      ['Amount', `<span class="tabular">${money(tx.amount)}</span>`],
      ['To', name],
      tx.memo && ['For', esc(tx.memo)],
      ['Sent', esc(dateTime(tx.createdAt))],
      !instant && ['Collected', esc(dateTime(tx.settledAt))],
      ['Type', instant ? 'Instant' : 'Protected, with an undo window'],
    ])}
    ${idLine(tx)}
  </div>`;
}

function incoming(s, viewer, tx, t) {
  if (tx.from === 'topup') {
    return `<div class="screen">${bar({ title: 'Payment', back: 'home' })}
      ${hero('blue', 'plus', `Added ${money(tx.amount)}`, 'Demo money, added to your balance.')}</div>`;
  }
  const p = who(s, viewer, tx.from);
  const name = personName(p);
  const p0 = phase(tx, t);

  if (p0 === 'completed' && tx.flags?.includes('dust')) {
    const c = analyze(s, viewer, tx.from, t);
    const like = c.lookalike || c.typo;
    return `<div class="screen">
      ${bar({ title: 'Payment', back: 'home' })}
      ${hero('amber', 'alert', like ? `This came from a lookalike of your ${esc(like.label)}` : 'A tiny payment from an unknown address', `Someone sent you ${money(tx.amount)} so this address shows up in your activity. If you copy it later, your money goes to them.`)}
      ${like ? compare(tx.from, like.of, like.label, 'Sent you dust') : ''}
      <div class="alert blue gap-16">
        <span class="alert-icon">${icon('shield', 18)}</span>
        <div class="alert-body"><strong>Kagi has your back</strong><p>If you ever try to pay this address, Kagi will stop you and point you to the real one.</p></div>
      </div>
      <div class="stack push actions">
        <button class="btn primary" data-action="dismiss" data-id="${tx.id}" data-then="home">Got it</button>
      </div>
    </div>`;
  }

  if (p0 === 'held') {
    return `<div class="screen">
      ${bar({ title: 'Payment', back: 'home' })}
      ${hero('blue', 'clock', `${name} is sending you ${money(tx.amount)}`, `You can collect it in <span class="tabular strong" data-until="${tx.holdUntil}">${clock(tx.holdUntil - t)}</span>. Until then, ${name} can still undo it.`)}
      ${timeline([
        { state: 'done', title: 'Sent', sub: esc(when(tx.createdAt, t)) },
        { state: 'now', title: 'Undo window', sub: `Ends at ${esc(at(tx.holdUntil, t))}` },
        { state: 'todo', title: 'You collect it', sub: `By ${esc(dateTime(tx.expiresAt))}` },
      ])}
    </div>`;
  }

  if (p0 === 'claimable') {
    return `<div class="screen">
      ${bar({ title: 'Payment', back: 'home' })}
      <div class="collect-card card">
        ${avatar(p, 'lg')}
        <span class="muted">${name} sent you</span>
        <strong class="collect-amount tabular">${money(tx.amount)}</strong>
        ${tx.memo ? `<span class="muted">“${esc(tx.memo)}”</span>` : ''}
        <span class="pill green">${icon('check', 13)} Ready to collect</span>
      </div>
      <div class="alert blue gap-16">
        <span class="alert-icon">${icon('info', 18)}</span>
        <div class="alert-body"><strong>Why do I need to collect?</strong><p>Kagi held this payment for a few minutes in case ${name} made a mistake. Collect it by ${esc(dateTime(tx.expiresAt))}, or it goes back to them.</p></div>
      </div>
      <div class="stack push actions">
        <button class="btn primary" data-action="claim" data-id="${tx.id}">Collect ${money(tx.amount)}</button>
      </div>
    </div>`;
  }

  const outcomes = {
    claimed: ['green', 'check', `You collected ${money(tx.amount)}`, `From ${name}, ${esc(dateTime(tx.settledAt))}.`],
    completed: ['green', 'check', `${name} sent you ${money(tx.amount)}`, tx.memo ? `“${esc(tx.memo)}”` : 'It went straight into your balance.'],
    cancelled: ['grey', 'undo', `${name} undid this payment`, 'They cancelled it before it could be collected.'],
    returned: ['grey', 'undo', 'This payment went back', `It wasn’t collected within ${span(tx.expiresAt - tx.createdAt)}, so it returned to ${name}.`],
  };
  const [tone, ic, title, body] = outcomes[p0] || outcomes.completed;
  return `<div class="screen">${bar({ title: 'Payment', back: 'home' })}${hero(tone, ic, title, body)}${idLine(tx)}</div>`;
}
