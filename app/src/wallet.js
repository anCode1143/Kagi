// Creating and connecting wallets. Only the public address is used in this build.
import { encode, randomAddress } from './base58.js';

// Generates a real Ed25519 keypair in the browser when supported, so the address is a genuine
// Solana-format public key. Falls back to 32 random bytes on older browsers.
export async function createWallet() {
  try {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    return { address: encode(raw), realKey: true };
  } catch {
    return { address: randomAddress(), realKey: false };
  }
}

// Solana browser wallets inject a provider object on window.
export function detectWallets() {
  const found = [];
  const phantom = window.phantom?.solana;
  if (phantom?.isPhantom) found.push({ id: 'phantom', name: 'Phantom', provider: phantom });
  if (window.solflare?.isSolflare) found.push({ id: 'solflare', name: 'Solflare', provider: window.solflare });
  if (window.backpack?.isBackpack) found.push({ id: 'backpack', name: 'Backpack', provider: window.backpack });
  return found;
}

export async function connectWallet(id) {
  const wallet = detectWallets().find((w) => w.id === id);
  if (!wallet) throw new Error('Wallet not found');
  const result = await wallet.provider.connect();
  const key = result?.publicKey || wallet.provider.publicKey;
  return { name: wallet.name, address: key.toString() };
}
