// Pieces shared across screens.
import { esc, short, initials } from '../format.js';
import { icon } from '../icons.js';

export function bar({ title = '', back = null, right = '' } = {}) {
  const left = back
    ? `<button class="icon-btn" data-action="go" data-to="${esc(back)}" aria-label="Back">${icon('back')}</button>`
    : '<span class="bar-gap"></span>';
  return `<header class="bar">${left}<h1 class="bar-title">${esc(title)}</h1>${right || '<span class="bar-gap"></span>'}</header>`;
}

const TABS = [
  ['home', 'Home', 'home'],
  ['send', 'Send', 'send'],
  ['contacts', 'Contacts', 'users'],
  ['receive', 'Receive', 'receive'],
];

export function tabbar(active) {
  return `<nav class="tabbar" aria-label="Main">${TABS.map(([to, label, ic]) =>
    `<button class="tab" data-action="go" data-to="${to}" ${active === to ? 'aria-current="page"' : ''}>${icon(ic, 26)}${label}</button>`).join('')}</nav>`;
}

// How an address appears to the person viewing: contact name, @username, label, or a short address.
export function who(s, viewer, address) {
  if (address === 'topup') return { name: 'Added money', sub: 'Demo top-up', kind: 'topup' };
  const account = s.accounts[address];
  const contact = (s.contacts[viewer] || []).find((c) => c.address === address);
  const handle = account?.username ? `@${account.username}` : null;
  if (contact) return { name: contact.name, sub: handle || short(address), contact, account, kind: account?.kind === 'external' ? 'org' : 'person' };
  if (account?.kind === 'kagi') return { name: account.name, sub: handle, account, kind: 'person' };
  if (account?.label) return { name: account.label, sub: short(address), account, kind: 'org' };
  return { name: short(address), sub: 'Unknown address', account, kind: 'unknown', mono: true };
}

export function avatar(person, size = '') {
  if (person.kind === 'topup') return `<span class="avatar blue ${size}">${icon('plus', 18)}</span>`;
  if (person.kind === 'unknown') return `<span class="avatar ${size}">${icon('wallet', 18)}</span>`;
  const shape = person.kind === 'org' ? 'dark square' : '';
  return `<span class="avatar ${shape} ${size}">${esc(initials(person.name))}</span>`;
}

// An address in blocks of four, like a bank IBAN, so it wraps cleanly and is easier to read aloud.
// Characters with index in [from, to) are highlighted.
export function groupedAddress(address, from = -1, to = -1) {
  let html = '';
  for (let i = 0; i < address.length; i += 4) {
    let block = '';
    for (let k = i; k < Math.min(i + 4, address.length); k++) {
      const ch = esc(address[k]);
      block += k >= from && k < to ? `<mark>${ch}</mark>` : ch;
    }
    html += `<span class="addr-block">${block.replace(/<\/mark><mark>/g, '')}</span>`;
  }
  return html;
}

export function personName(person) {
  return person.mono ? `<span class="mono">${esc(person.name)}</span>` : esc(person.name);
}
