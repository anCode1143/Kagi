// Tokens shown in the holdings visualiser. SOL comes from the live demo balance; the others are
// display-only demo holdings. Prices are fixed demo values in USD, not live market data.
import { LAMPORTS_PER_SOL } from './format.js';

export const ASSETS = {
  SOL: { name: 'Solana', price: 150, slot: 1 },
  BTC: { name: 'Bitcoin', price: 60000, slot: 2 },
  ETH: { name: 'Ethereum', price: 3000, slot: 3 },
  USDC: { name: 'USD Coin', price: 1, slot: 4 },
  JUP: { name: 'Jupiter', price: 0.8, slot: 0 },
  BONK: { name: 'Bonk', price: 0.00002, slot: 0 },
};

// Categorical slots 1–4 from the validated reference palette, in its fixed order; slot 0 is the
// neutral "Other". Colour follows the token, never its rank.
const SERIES = { 1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#eda100', 0: '#9aa1ad' };
export const colorOf = (symbol) => SERIES[ASSETS[symbol]?.slot ?? 0];

const DEMO_HOLDINGS = {
  default: { BTC: 0.012, ETH: 0.35, USDC: 420.5, JUP: 180, BONK: 2500000 },
  aoife: { ETH: 0.08, USDC: 95, BONK: 12000000 },
  padraig: { BTC: 0.2, USDC: 1500 },
  ciaran: { USDC: 12.4, JUP: 40 },
};

// Tokens that turned up uninvited. Scammers name them after a website ("claim at …") so people visit it.
const UNVERIFIED = {
  default: [
    { symbol: 'CLAIM', name: 'Claim 5,000 USDC at sol-rewards.io', amount: 5000 },
    { symbol: 'DROP', name: 'Airdrop voucher: visit jup-claim.net', amount: 1 },
  ],
};
export const unverifiedFor = (account) => UNVERIFIED[account.username] || (DEMO_HOLDINGS[account.username] ? [] : UNVERIFIED.default);

export function holdingsFor(account) {
  const extra = DEMO_HOLDINGS[account.username] || DEMO_HOLDINGS.default;
  const rows = [
    { symbol: 'SOL', amount: account.balance / LAMPORTS_PER_SOL },
    ...Object.entries(extra).map(([symbol, amount]) => ({ symbol, amount })),
  ];
  const total = rows.reduce((sum, r) => sum + r.amount * ASSETS[r.symbol].price, 0);
  return rows
    .map((r) => {
      const value = r.amount * ASSETS[r.symbol].price;
      return { ...r, ...ASSETS[r.symbol], value, share: total ? value / total : 0, color: colorOf(r.symbol) };
    })
    .sort((a, b) => b.value - a.value);
}

// Bar segments in fixed slot order (so neighbours are always the validated pairs), with the
// small tokens folded into one grey "Other" segment at the end.
export function segments(rows) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const named = [1, 2, 3, 4].map((slot) => rows.find((r) => r.slot === slot)).filter((r) => r && r.value > 0)
    .map((r) => ({ label: r.symbol, value: r.value, color: r.color }));
  const rest = rows.filter((r) => r.slot === 0 && r.value > 0);
  if (rest.length) {
    named.push({ label: 'Other', value: rest.reduce((sum, r) => sum + r.value, 0), color: SERIES[0], members: rest.map((r) => r.symbol) });
  }
  return named.map((s) => ({ ...s, share: total ? s.value / total : 0 }));
}

export const usd = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function tokenAmount(amount) {
  const digits = amount >= 1000 ? 0 : amount >= 1 ? 2 : 4;
  return amount.toLocaleString('en-IE', { maximumFractionDigits: digits });
}

export function percent(share) {
  if (share > 0 && share < 0.01) return '<1%';
  return `${Math.round(share * 100)}%`;
}
