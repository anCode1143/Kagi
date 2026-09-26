// Maps a route to a screen.
import { detectWallets } from '../wallet.js';
import { welcome, connect, username, done } from './onboarding.js';
import { home } from './home.js';
import { recipient, check, amount } from './send.js';
import { txView } from './tx.js';
import { contacts, receive, notices } from './misc.js';
import { holdings } from './holdings.js';
import { demoPanel } from './demo.js';

export function renderRoute(route, { s, viewer, t, ui }) {
  switch (route.name) {
    case 'welcome':
      return welcome();
    case 'onboard':
      if (route.parts[1] === 'connect') return connect(detectWallets());
      if (route.parts[1] === 'username') return username(s, ui);
      if (route.parts[1] === 'done') return done(s, viewer);
      return welcome();
    case 'send':
      // Later steps need a recipient; without one, start over.
      if (route.parts[1] === 'check' && ui.draft.address) return check(s, viewer, ui, t);
      if (route.parts[1] === 'amount' && ui.draft.address) return amount(s, viewer, ui, t);
      return recipient(s, viewer, ui);
    case 'tx':
      return txView(s, viewer, route.parts[1], t);
    case 'contacts':
      return contacts(s, viewer, ui, t);
    case 'receive':
      return receive(s, viewer);
    case 'notices':
      return notices(s, viewer, t);
    case 'holdings':
      return holdings(s, viewer);
    default:
      return home(s, viewer, t);
  }
}

export const renderDemo = ({ s, viewer, t, ui }) => demoPanel(s, viewer, t, ui);
