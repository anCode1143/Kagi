// Demo controls: switch between people, trigger a dusting attack, fast-forward time.
import { esc, initials, dateTime, span } from '../format.js';
import { icon } from '../icons.js';
import { ADDR } from '../seed.js';

export function demoPanel(s, viewer, t, ui) {
  const people = s.owner ? [s.owner, ADDR.aoife, ADDR.padraig, ADDR.ciaran] : [];
  const offset = s.clockOffset || 0;
  const ahead = offset ? ` <span class="muted">(${span(offset)} ahead)</span>` : '';
  const sender = viewer === ADDR.aoife ? s.accounts[s.owner] : s.accounts[ADDR.aoife];

  const body = s.owner ? `
    <div class="demo-group">
      <h3>View the app as</h3>
      ${people.map((a) => {
        const acc = s.accounts[a];
        return `<button class="demo-btn" data-action="demo-view" data-addr="${esc(a)}" aria-pressed="${a === viewer}">
          <span class="avatar sm ${a === s.owner ? 'dark' : ''}">${esc(initials(acc.name))}</span>
          <span>${esc(acc.name)} <span class="muted">@${esc(acc.username)}</span></span>
        </button>`;
      }).join('')}
    </div>
    <div class="demo-group">
      <h3>Make something happen</h3>
      <button class="demo-btn" data-action="demo-dust">${icon('alert', 18)} A lookalike address dusts you</button>
      <button class="demo-btn" data-action="demo-incoming">${icon('receive', 18)} ${esc(sender?.name.split(' ')[0] || 'Someone')} sends you 0.5 SOL (with a hold)</button>
      <button class="demo-btn" data-action="top-up">${icon('plus', 18)} Add 1 SOL of demo money</button>
    </div>
    <div class="demo-group">
      <h3>Time</h3>
      <p class="demo-clock"><span data-demo-clock>${esc(dateTime(t))}</span>${ahead}</p>
      <div class="demo-row">
        <button class="demo-btn" data-action="demo-ff" data-ms="600000">+10 min</button>
        <button class="demo-btn" data-action="demo-ff" data-ms="3600000">+1 hour</button>
        <button class="demo-btn" data-action="demo-ff" data-ms="604800000">+7 days</button>
      </div>
      <button class="demo-btn" data-action="demo-short" aria-pressed="${Boolean(s.shortTimers)}">${icon('zap', 18)} Short timers for live demos</button>
      <p>Holds become 15 s, 30 s and 60 s, and unclaimed money comes back after 90 s.</p>
    </div>` : `
    <div class="demo-group"><p>Create or connect a wallet first. Then you can switch between people, simulate a dusting attack and fast-forward time from here.</p></div>`;

  return `<button class="demo-fab" data-action="demo-toggle" aria-expanded="${ui.demoOpen}">${icon('sliders', 16)} Demo</button>
  <div class="demo-panel">
    <h2>${icon('sliders', 16)} Demo controls <button class="icon-btn demo-close" data-action="demo-toggle" aria-label="Close demo controls">${icon('close')}</button></h2>
    ${body}
    <div class="demo-group"><button class="demo-btn" data-action="demo-reset">${icon('undo', 18)} Reset demo</button></div>
  </div>`;
}
