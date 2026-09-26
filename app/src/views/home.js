// Home: balance, alerts about suspicious addresses, payments in progress, recent activity.
import { esc, money, moneyParts, when, clock, initials, LAMPORTS_PER_SOL } from '../format.js';
import { icon } from '../icons.js';
import { phase } from '../ledger.js';
import { dustAlerts } from '../guards.js';
import { ASSETS, usd } from '../assets.js';
import { tabbar, who, avatar, personName } from './shell.js';
import { holdingsCard } from './holdings.js';

function greeting(t) {
  const h = new Date(t).getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function pendingRow(s, viewer, tx, t) {
  const outgoing = tx.from === viewer;
  const person = who(s, viewer, outgoing ? tx.to : tx.from);
  const p = phase(tx, t);
  let sub = '';
  let end = '';
  if (outgoing && p === 'held') {
    sub = `<span class="countdown-chip" data-until="${tx.holdUntil}">${clock(tx.holdUntil - t)}</span> left to undo`;
    end = `<button class="btn primary small" data-action="undo" data-id="${tx.id}">${icon('undo', 15)} Undo</button>`;
  } else if (outgoing) {
    sub = 'Waiting for them to collect';
    end = `<span class="pill grey">Sent</span>`;
  } else if (p === 'held') {
    sub = `Ready to collect in <span class="countdown-chip" data-until="${tx.holdUntil}">${clock(tx.holdUntil - t)}</span>`;
    end = `<span class="pill blue">${icon('clock', 13)} On hold</span>`;
  } else {
    sub = 'Ready to collect';
    end = `<button class="btn primary small" data-action="claim" data-id="${tx.id}">Collect</button>`;
  }
  return `<div class="row">
    <button class="row-main" data-action="go" data-to="tx/${tx.id}">
      ${avatar(person)}
      <span class="row-text">
        <span class="row-title">${outgoing ? '−' : '+'}${money(tx.amount)} ${outgoing ? 'to' : 'from'} ${personName(person)}</span>
        <span class="row-sub">${sub}</span>
      </span>
    </button>
    <span class="row-end">${end}</span>
  </div>`;
}

function activityRow(s, viewer, tx, t) {
  const outgoing = tx.from === viewer;
  const person = who(s, viewer, outgoing ? tx.to : tx.from);
  const p = phase(tx, t);
  const lookalike = !outgoing && tx.flags?.includes('dust');
  let pill = '';
  if (p === 'returned') pill = `<span class="pill blue">${icon('undo', 12)} Came back</span>`;
  else if (p === 'cancelled') pill = `<span class="pill grey">${icon('undo', 12)} Undone</span>`;
  else if (lookalike) pill = `<span class="pill amber">Lookalike</span>`;
  const bounced = p === 'returned' || p === 'cancelled';
  const amount = outgoing
    ? `<span class="row-title tabular ${bounced ? 'muted' : ''}">${bounced ? money(tx.amount) : money(-tx.amount)}</span>`
    : `<span class="row-title tabular amount-in">${money(tx.amount, { sign: true })}</span>`;
  const bits = [tx.memo, person.kind === 'unknown' ? null : person.sub, when(tx.createdAt, t)].filter(Boolean);
  return `<button class="row" data-action="go" data-to="tx/${tx.id}">
    ${avatar(person)}
    <span class="row-text">
      <span class="row-title">${personName(person)}</span>
      <span class="row-sub">${bits.map((b) => (b.includes('…') ? `<span class="mono">${esc(b)}</span>` : esc(b))).join(' · ')}</span>
    </span>
    <span class="row-end">${amount}${pill}</span>
  </button>`;
}

export function home(s, viewer, t) {
  const account = s.accounts[viewer];
  const { whole, frac } = moneyParts(account.balance);
  const unread = (s.notices[viewer] || []).some((n) => !n.read);
  const mine = s.txs.filter((tx) => tx.from === viewer || tx.to === viewer);
  const isPending = (tx) => tx.mode === 'hold' && (phase(tx, t) === 'held' || phase(tx, t) === 'claimable');
  const pending = mine.filter(isPending).sort((a, b) => b.createdAt - a.createdAt);
  const activity = mine.filter((tx) => !isPending(tx)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const alerts = dustAlerts(s, viewer, t);

  const alertCards = alerts.map(({ tx, check }) => {
    const like = check.lookalike || check.typo;
    return `<div class="alert">
      <span class="alert-icon">${icon('alert', 18)}</span>
      <div class="alert-body">
        <strong>A lookalike address sent you ${money(tx.amount)}</strong>
        <p>It imitates ${esc(like.label)}. Always pay from Contacts, never by copying an address from Activity.</p>
        <div class="alert-actions">
          <button data-action="go" data-to="tx/${tx.id}">See the difference</button>
          <button data-action="dismiss" data-id="${tx.id}">Dismiss</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const solValue = (account.balance / LAMPORTS_PER_SOL) * ASSETS.SOL.price;

  return `<div class="screen with-tabs">
    <header class="home-top">
      <span class="brand-sm"><span class="wordmark-sm">kagi</span><span class="kana-sm" lang="ja">カギ</span></span>
      <button class="icon-btn" data-action="go" data-to="notices" aria-label="Notifications${unread ? ', new' : ''}">${icon('bell')}${unread ? '<span class="dot"></span>' : ''}</button>
      <button class="avatar dark" data-action="go" data-to="receive" aria-label="Your profile">${esc(initials(account.name))}</button>
    </header>

    <section class="hero" aria-label="Balance">
      <div class="label-mono">${greeting(t)}, @${esc(account.username)}</div>
      <div class="balance-amount">${esc(whole)}<span>${esc(frac)}</span><span class="unit">SOL</span></div>
      <div class="hero-sub"><span class="tabular">≈ ${usd(solValue)}</span> <span class="muted">· demo price</span></div>
    </section>

    <nav class="actions-row" aria-label="Actions">
      <button class="action-btn primary" data-action="go" data-to="send">${icon('send', 18)} Send</button>
      <button class="action-btn" data-action="go" data-to="receive">${icon('receive', 18)} Receive</button>
      <button class="action-btn" data-action="top-up">${icon('plus', 18)} Add</button>
    </nav>

    <div class="protect-strip">
      ${icon('key', 16)}
      <span><strong>Protection on.</strong> Every payment is checked for lookalikes, typos and dusting.</span>
    </div>

    ${alertCards}

    ${pending.length ? `
      <div class="section-title"><span>In progress</span></div>
      <div class="card list">${pending.map((tx) => pendingRow(s, viewer, tx, t)).join('')}</div>` : ''}

    ${holdingsCard(account)}

    <div class="section-title"><span>Activity</span></div>
    <div class="card list">${activity.length ? activity.map((tx) => activityRow(s, viewer, tx, t)).join('') : '<p class="empty">No payments yet.</p>'}</div>
  </div>
  ${tabbar('home')}`;
}
