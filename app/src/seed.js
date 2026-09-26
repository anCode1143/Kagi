// Demo world: a few Kagi users, an exchange, and a scammer's lookalike address.
// Fixed addresses so the pitch always shows the same "7xKp…3fQa" pair as the README banner.
import { SOL } from './format.js';

export const ADDR = {
  aoife: 'AoF3kR8mNq2VtX7wZcYb5LhJ9sDgPe4uHa6iWn1rTbKd',
  padraig: 'Dq9HfB3xT6pLm2WkRz8NcV5yGs4JtE7uAh1bKr3ZnPwe',
  ciaran: 'Cw4RtY8kPz2MnB6vQs9HjX3fLd7GaE5uKc1mTr8WqNbh',
  exchange: '7xKpQ4mRb9TzW2vLcN8hYd3JfS6aE1uGq5VnXo3fQa',
  poison: '7xKpQ9eHw1RcZ5nTbF2mJk8LsP4yVd6UhBgCrZ3fQa',
  typo: '9pLm4Tq8Vx2Kc7Rb5Ns3Hy6Jf1Gd9Wz4Ea8Uk2MrXw2d',
};

const DAY = 864e5;

export function seedWorld() {
  return {
    version: 2,
    clockOffset: 0,
    shortTimers: false,
    owner: null,
    viewer: null,
    accounts: {
      [ADDR.aoife]: { address: ADDR.aoife, kind: 'kagi', username: 'aoife', name: 'Aoife Byrne', balance: SOL(3.124) },
      [ADDR.padraig]: { address: ADDR.padraig, kind: 'kagi', username: 'padraig', name: 'Pádraig Murphy', balance: SOL(25) },
      [ADDR.ciaran]: { address: ADDR.ciaran, kind: 'kagi', username: 'ciaran', name: 'Ciarán Walsh', balance: SOL(0.88) },
      [ADDR.exchange]: { address: ADDR.exchange, kind: 'external', label: 'Exchange', autoClaim: true, balance: 0 },
      [ADDR.poison]: { address: ADDR.poison, kind: 'external', autoClaim: true, balance: 0 },
    },
    usernames: { aoife: ADDR.aoife, padraig: ADDR.padraig, ciaran: ADDR.ciaran },
    contacts: {},
    txs: [],
    notices: {},
    dismissed: {},
  };
}

// Gives a brand-new owner a believable history, so the guards have something to compare against.
export function seedOwnerHistory(s, me, name, t) {
  let n = 0;
  const tx = (fields) => s.txs.push({ id: `seed_${n++}`, mode: 'instant', status: 'completed', memo: '', flags: [], ...fields });

  tx({ from: me, to: ADDR.exchange, amount: SOL(2), createdAt: t - 60 * DAY });
  tx({ from: me, to: ADDR.padraig, amount: SOL(0.5), createdAt: t - 50 * DAY, memo: 'Petrol' });
  tx({ from: me, to: ADDR.aoife, amount: SOL(0.15), createdAt: t - 40 * DAY, memo: 'Lunch' });
  tx({ from: me, to: ADDR.exchange, amount: SOL(1.5), createdAt: t - 35 * DAY });
  tx({ from: ADDR.padraig, to: me, amount: SOL(1), createdAt: t - 30 * DAY, memo: 'Birthday' });
  tx({ from: me, to: ADDR.padraig, amount: SOL(0.5), createdAt: t - 25 * DAY });
  tx({ from: me, to: ADDR.aoife, amount: SOL(0.32), createdAt: t - 20 * DAY, memo: 'Groceries' });
  tx({ from: me, to: ADDR.exchange, amount: SOL(3), createdAt: t - 14 * DAY });
  tx({
    from: me, to: ADDR.typo, amount: SOL(0.2), createdAt: t - 11 * DAY,
    mode: 'hold', status: 'returned', holdKey: '10m',
    holdUntil: t - 11 * DAY + 10 * 60e3, expiresAt: t - 4 * DAY, settledAt: t - 4 * DAY,
  });
  tx({ from: me, to: ADDR.aoife, amount: SOL(0.25), createdAt: t - 6 * DAY, memo: 'Pizza' });
  tx({ from: ADDR.aoife, to: me, amount: SOL(0.185), createdAt: t - 3 * DAY, memo: 'Taxi' });
  // No dust in a new wallet: the demo panel's "A lookalike address dusts you" triggers it on cue.

  s.contacts[me] = [
    { address: ADDR.aoife, name: 'Aoife Byrne', trusted: true, addedAt: t - 90 * DAY },
    { address: ADDR.padraig, name: 'Dad', trusted: true, addedAt: t - 90 * DAY },
    { address: ADDR.exchange, name: 'Exchange deposit', trusted: true, addedAt: t - 61 * DAY },
    { address: ADDR.ciaran, name: 'Ciarán Walsh', trusted: false, addedAt: t - 2 * DAY },
  ];
  s.contacts[ADDR.aoife] = [{ address: me, name, trusted: false, addedAt: t - 40 * DAY }];
  s.contacts[ADDR.padraig] = [{ address: me, name, trusted: true, addedAt: t - 90 * DAY }];

  s.notices[me] = [
    {
      id: 'seed_notice_returned', kind: 'returned', at: t - 4 * DAY, read: true, txId: 'seed_8',
      title: 'Your 0.2 SOL came back',
      body: 'Nobody collected it within 7 days, so it returned automatically.',
    },
  ];
}
