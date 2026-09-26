// Contacts, Receive and Notifications.
import { esc, when, initials, short } from '../format.js';
import { icon } from '../icons.js';
import { resolveInput, analyze } from '../guards.js';
import { bar, tabbar, who, avatar, groupedAddress } from './shell.js';

export function contacts(s, viewer, ui, t) {
  const list = (s.contacts[viewer] || []).slice().sort((a, b) => (b.trusted - a.trusted) || a.name.localeCompare(b.name));
  const form = ui.contact;
  const r = resolveInput(s, viewer, form.to);
  let hint = '<span class="hint info">A @username or a full address.</span>';
  let warning = '';
  let canSave = false;
  if (form.to.trim()) {
    if (r.kind === 'invalid') {
      hint = `<span class="hint bad">${icon('alert', 15)} ${esc(r.error)}</span>`;
    } else {
      const already = list.find((c) => c.address === r.address);
      const c = analyze(s, viewer, r.address, t);
      const like = c.lookalike || c.typo;
      if (already) {
        hint = `<span class="hint info">Already saved as ${esc(already.name)}.</span>`;
      } else if (like) {
        hint = '';
        warning = `<div class="alert">
          <span class="alert-icon">${icon('alert', 18)}</span>
          <div class="alert-body">
            <strong>This looks like your ${esc(like.label)}, but isn’t</strong>
            <p>Only the first ${like.prefix ?? 4} and last ${like.suffix ?? 4} characters match. Saving it would make a scam address look trusted.</p>
            ${form.ack ? '<p><strong>Saved addresses still get a hold until you turn on Instant.</strong></p>' : '<div class="alert-actions"><button data-action="contact-ack">I’m sure, let me save it</button></div>'}
          </div>
        </div>`;
        canSave = form.ack;
      } else {
        hint = r.kind === 'username'
          ? `<span class="hint ok">${icon('check', 15)} @${esc(r.username)} · ${esc(s.accounts[r.address].name)}</span>`
          : `<span class="hint ok">${icon('check', 15)} Valid address</span>`;
        canSave = true;
      }
    }
  }
  canSave = canSave && form.name.trim().length > 0;

  const rows = list.map((c) => {
    const p = who(s, viewer, c.address);
    return `<div class="row">
      <button class="row-main" data-action="pick" data-addr="${esc(c.address)}" aria-label="Send to ${esc(c.name)}">
        ${avatar(p)}
        <span class="row-text"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${p.sub?.includes('…') ? `<span class="mono">${esc(p.sub)}</span>` : esc(p.sub || '')}</span></span>
      </button>
      <span class="switch-wrap">
        <span class="switch-label" aria-hidden="true">${c.trusted ? 'Instant' : 'Hold'}</span>
        <button class="switch" role="switch" aria-checked="${c.trusted}" data-action="trust" data-addr="${esc(c.address)}" aria-label="Instant payments to ${esc(c.name)}"><span></span></button>
      </span>
    </div>`;
  }).join('');

  return `<div class="screen with-tabs">
    ${bar({ title: 'Contacts', back: 'home' })}
    <div class="card pad stack">
      <strong>Add a contact</strong>
      <label class="field"><span class="sr-only">Name</span>
        <span class="input"><input id="contact-name" data-model="contact.name" value="${esc(form.name)}" placeholder="Name" maxlength="40" autocomplete="off"></span>
      </label>
      <label class="field"><span class="sr-only">Username or address</span>
        <span class="input"><input id="contact-to" data-model="contact.to" value="${esc(form.to)}" placeholder="@username or address" autocomplete="off" autocapitalize="none" spellcheck="false"></span>
        ${hint}
      </label>
      ${warning}
      <button class="btn primary" data-action="contact-add" data-trusted="false" ${canSave ? '' : 'disabled'}>Save contact</button>
    </div>

    <div class="section-title"><span>Saved</span><span class="muted small">Instant = no hold</span></div>
    <div class="card list">${rows || '<p class="empty">No contacts yet.</p>'}</div>

    <div class="alert blue gap-16">
      <span class="alert-icon">${icon('zap', 18)}</span>
      <div class="alert-body"><strong>Trusted payees go straight through</strong><p>Turn on Instant for people you pay often. Everyone else gets a short hold, so you can undo a mistake. After a first payment is collected, Kagi turns Instant on for you.</p></div>
    </div>
  </div>
  ${tabbar('contacts')}`;
}

export function receive(s, viewer) {
  const account = s.accounts[viewer];
  const source = account.createdByKagi ? 'Created by Kagi on this device.' : `Connected from ${esc(account.wallet)}.`;
  return `<div class="screen with-tabs">
    ${bar({ title: 'Receive', back: 'home' })}
    <div class="card receive-card">
      <span class="avatar dark lg">${esc(initials(account.name))}</span>
      <strong class="receive-name">${esc(account.name)}</strong>
      <button class="handle-btn" data-action="copy" data-text="@${esc(account.username)}">@${esc(account.username)} ${icon('copy', 16)}</button>
      <p class="muted">Anyone on Kagi can pay you with your username. No address to copy, nothing to mistype.</p>
    </div>
    <div class="section-title"><span>Show this code</span></div>
    <div class="card qr-card">
      <div class="qr" data-qr="solana:${esc(viewer)}?label=${esc(encodeURIComponent(`@${account.username}`))}" role="img" aria-label="QR code with your wallet address"></div>
      <p class="muted">Someone can scan this with any Solana wallet app to pay you, so nobody has to type your address.</p>
    </div>
    <div class="section-title"><span>Your address</span></div>
    <div class="card pad">
      <code class="addr-full">${groupedAddress(viewer)}</code>
      <button class="btn secondary gap-16" data-action="copy" data-text="${esc(viewer)}">${icon('copy', 18)} Copy address</button>
    </div>
    <p class="fine gap-16">For other wallets and exchanges. ${source}</p>
  </div>
  ${tabbar('receive')}`;
}

const NOTICE_ICON = { returned: 'undo', claimed: 'check', trusted: 'zap', dust: 'alert', incoming: 'clock', received: 'receive', cancelled: 'undo' };

export function notices(s, viewer, t) {
  const list = s.notices[viewer] || [];
  const unread = list.some((n) => !n.read);
  const right = unread ? '<button class="text-btn" data-action="notices-read">Mark all read</button>' : '';
  return `<div class="screen">
    ${bar({ title: 'Notifications', back: 'home', right })}
    ${list.length ? `<div class="card list">${list.map((n) => `
      <button class="row notice" data-action="go" data-to="${n.txId ? `tx/${esc(n.txId)}` : 'home'}">
        <span class="avatar ${n.kind === 'dust' ? 'amber' : 'blue'}">${icon(NOTICE_ICON[n.kind] || 'bell', 18)}</span>
        <span class="row-text">
          <span class="row-title wrap">${esc(n.title)}</span>
          <span class="row-sub wrap">${esc(n.body)}</span>
          <span class="row-sub">${esc(when(n.at, t))}</span>
        </span>
        ${n.read ? '' : '<span class="unread-dot"><span class="sr-only">Unread</span></span>'}
      </button>`).join('')}</div>` : '<div class="placeholder"><p>Nothing here yet.</p></div>'}
  </div>`;
}
