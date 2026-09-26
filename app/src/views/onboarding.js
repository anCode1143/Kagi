// First run: create a wallet (or connect one), then pick a name and @username.
import { esc, short } from '../format.js';
import { icon } from '../icons.js';
import { validUsername } from '../guards.js';
import { bar } from './shell.js';

export function welcome() {
  return `<div class="screen welcome">
    <div class="brand"><span class="wordmark">kagi</span><span class="kana" lang="ja">カギ</span></div>
    <p class="lead">A crypto wallet with a safety net. Pay people like you would from your bank, and take it back if something looks wrong.</p>
    <ul class="promises">
      <li><span class="avatar amber">${icon('alert', 18)}</span><div><strong>Catches lookalike addresses</strong><span>Before you send, not after.</span></div></li>
      <li><span class="avatar blue">${icon('undo', 18)}</span><div><strong>Undo before it’s collected</strong><span>New payees wait a few minutes first.</span></div></li>
      <li><span class="avatar blue">${icon('clock', 18)}</span><div><strong>Unclaimed money comes back</strong><span>A typo is no longer permanent.</span></div></li>
      <li><span class="avatar blue">${icon('users', 18)}</span><div><strong>Pay @names, not addresses</strong><span>Everyone gets a username, like @aoife.</span></div></li>
    </ul>
    <div class="stack push welcome-actions">
      <button class="btn primary" data-action="onboard-create">Create a wallet for me</button>
      <button class="btn secondary" data-action="go" data-to="onboard/connect">I already have a wallet</button>
      <p class="fine">Demo build. Balances are simulated.</p>
    </div>
  </div>`;
}

export function connect(wallets) {
  const found = wallets.length
    ? `<div class="card list">${wallets.map((w) => `
        <button class="row" data-action="onboard-connect" data-id="${esc(w.id)}">
          <span class="avatar dark square">${icon('wallet', 18)}</span>
          <span class="row-text"><span class="row-title">${esc(w.name)}</span><span class="row-sub">Found in this browser</span></span>
          ${icon('chevron', 18)}
        </button>`).join('')}</div>`
    : `<div class="alert blue">
        <span class="alert-icon">${icon('info', 18)}</span>
        <div class="alert-body"><strong>No wallet found in this browser</strong><p>Install Phantom, Solflare or Backpack, or try Kagi with a demo wallet.</p></div>
      </div>`;
  return `<div class="screen">
    ${bar({ back: 'welcome' })}
    <h2 class="step-title">Connect your wallet</h2>
    <p class="step-lead">Kagi sits on top of the wallet you already use. It only reads your address, and you still approve every payment in your wallet.</p>
    <div class="gap-24">${found}</div>
    <div class="stack push">
      <button class="btn secondary" data-action="onboard-demo-connect">Use a demo wallet</button>
      <button class="btn ghost" data-action="onboard-create">Or let Kagi create one for me</button>
    </div>
  </div>`;
}

export function username(s, ui) {
  const o = ui.onboard;
  const handle = o.username.trim().toLowerCase().replace(/^@/, '');
  let hint = '<span class="hint info">Letters, numbers, dots and underscores.</span>';
  let handleOk = false;
  if (handle) {
    if (!validUsername(handle)) hint = `<span class="hint bad">${icon('alert', 15)} 3–20 characters: letters, numbers, dots or underscores.</span>`;
    else if (s.usernames[handle]) hint = `<span class="hint bad">${icon('alert', 15)} @${esc(handle)} is taken.</span>`;
    else { hint = `<span class="hint ok">${icon('check', 15)} @${esc(handle)} is available</span>`; handleOk = true; }
  }
  const nameOk = o.name.trim().length >= 2;
  const wallet = o.wallet
    ? `${esc(o.wallet.type)} · <code>${esc(short(o.wallet.address))}</code>`
    : 'A new wallet, created on this device';
  return `<div class="screen">
    ${bar({ back: o.wallet ? 'onboard/connect' : 'welcome' })}
    <h2 class="step-title">What should people call you?</h2>
    <p class="step-lead">Friends can pay <strong>@${esc(handle || 'you')}</strong> instead of copying a 44-character address.</p>
    <div class="stack gap-24 form">
      <label class="field"><span>Your name</span>
        <span class="input"><input id="ob-name" data-model="onboard.name" value="${esc(o.name)}" autocomplete="name" placeholder="Saoirse Murphy" maxlength="40"></span>
      </label>
      <label class="field"><span>Username</span>
        <span class="input"><span class="prefix">@</span><input id="ob-user" data-model="onboard.username" value="${esc(o.username)}" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="saoirse" maxlength="21"></span>
        ${hint}
      </label>
      <div class="card pad wallet-line">${icon('wallet')}<div><strong>Wallet</strong><div class="muted">${wallet}</div></div></div>
    </div>
    <div class="stack push">
      <button class="btn primary" data-action="onboard-finish" ${handleOk && nameOk && !o.busy ? '' : 'disabled'}>${o.busy ? 'Setting up…' : 'Create my Kagi'}</button>
    </div>
  </div>`;
}

export function done(s, viewer) {
  const account = s.accounts[viewer];
  if (!account) return welcome();
  const first = account.name.split(/\s+/)[0];
  const walletText = account.createdByKagi ? 'Created by Kagi on this device' : `${account.wallet}, connected`;
  return `<div class="screen">
    <div class="done-hero">
      <span class="avatar blue lg">${icon('check', 30)}</span>
      <h2 class="step-title">You’re all set, ${esc(first)}</h2>
      <p class="step-lead">People can now pay you at <strong>@${esc(account.username)}</strong>.</p>
    </div>
    <div class="card kv">
      <div class="kv-row"><span>Username</span><strong>@${esc(account.username)}</strong></div>
      <div class="kv-row"><span>Address</span><button class="link-btn" data-action="copy" data-text="${esc(viewer)}"><code>${esc(short(viewer))}</code>${icon('copy', 15)}</button></div>
      <div class="kv-row"><span>Wallet</span><strong>${esc(walletText)}</strong></div>
      <div class="kv-row"><span>Protection</span><span class="pill green">${icon('shield', 14)} On</span></div>
    </div>
    ${account.realKey ? '<p class="fine gap-16">Your address is a real Solana-format public key, generated in this browser.</p>' : ''}
    <div class="stack push">
      <button class="btn primary" data-action="go" data-to="home">Go to my wallet</button>
    </div>
  </div>`;
}
