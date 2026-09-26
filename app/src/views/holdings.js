// Holdings: what share of the wallet each token makes up. Part-to-whole, so one stacked bar,
// with the token list underneath doubling as legend and table.
import { esc } from '../format.js';
import { icon } from '../icons.js';
import { holdingsFor, segments, usd, tokenAmount, percent } from '../assets.js';
import { bar, tabbar } from './shell.js';

export function stackBar(parts, size = '') {
  return `<div class="stack-bar ${size}" aria-hidden="true">${parts.map((p) => {
    const tip = `${p.label}${p.members ? ` (${p.members.join(', ')})` : ''} · ${usd(p.value)} · ${percent(p.share)}`;
    return `<span class="seg" style="flex: ${p.value} 1 0%; background: ${p.color}" data-tip="${esc(tip)}"></span>`;
  }).join('')}</div>`;
}

export function legend(parts) {
  return `<ul class="legend">${parts.map((p) => `
    <li><span class="swatch" style="background: ${p.color}"></span>${esc(p.label)} <span class="muted">${percent(p.share)}</span></li>`).join('')}</ul>`;
}

// Compact card for Home.
export function holdingsCard(account) {
  const rows = holdingsFor(account);
  const parts = segments(rows);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return `<section class="panel holdings-card">
    <div class="panel-head">
      <span class="label-mono">Holdings</span>
      <button class="text-btn" data-action="go" data-to="holdings">See all</button>
    </div>
    <div class="holdings-total"><strong class="tabular">${usd(total)}</strong><span class="muted">${rows.length} tokens · demo prices</span></div>
    ${stackBar(parts)}
    ${legend(parts)}
  </section>`;
}

export function holdings(s, viewer) {
  const account = s.accounts[viewer];
  const rows = holdingsFor(account);
  const parts = segments(rows);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return `<div class="screen with-tabs">
    ${bar({ title: 'Holdings', back: 'home' })}
    <section class="hero">
      <div class="label-mono">Total value</div>
      <div class="hero-figure tabular">${usd(total)}</div>
      <div class="hero-sub">${rows.length} tokens · values use demo prices</div>
    </section>
    ${stackBar(parts, 'lg')}
    ${legend(parts)}

    <div class="section-title"><span>Tokens</span></div>
    <div class="card list">
      ${rows.map((r) => `<div class="row asset-row">
        <span class="token" aria-hidden="true"><span class="swatch" style="background: ${r.color}"></span>${esc(r.symbol.slice(0, 4))}</span>
        <span class="row-text">
          <span class="row-title">${esc(r.name)}</span>
          <span class="row-sub tabular">${esc(tokenAmount(r.amount))} ${esc(r.symbol)}</span>
        </span>
        <span class="row-end">
          <span class="row-title tabular">${usd(r.value)}</span>
          <span class="row-sub tabular">${percent(r.share)}</span>
        </span>
      </div>`).join('')}
    </div>

    <div class="alert blue gap-16">
      <span class="alert-icon">${icon('shield', 18)}</span>
      <div class="alert-body"><strong>Protection covers SOL payments</strong><p>Other tokens are shown so you can see everything in one place. Prices here are fixed demo values, not live market data.</p></div>
    </div>
  </div>
  ${tabbar('home')}`;
}
