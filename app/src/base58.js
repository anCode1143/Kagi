// Base58 (the Bitcoin/Solana alphabet): no 0, O, I or l, so addresses are harder to misread.

export const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encode(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

export function randomAddress() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encode(bytes);
}

// A Solana address is 32 bytes, which is 32 to 44 base58 characters.
export const isAddress = (text) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);

// What an address-poisoning attacker generates: same first 5 and last 4 characters, different middle.
export function lookalikeOf(address, head = 5, tail = 4) {
  const middleLength = address.length - head - tail;
  const pick = new Uint8Array(middleLength);
  crypto.getRandomValues(pick);
  let middle = '';
  for (let i = 0; i < middleLength; i++) {
    let c = ALPHABET[pick[i] % 58];
    if (c === address[head + i]) c = ALPHABET[(pick[i] + 7) % 58];
    middle += c;
  }
  return address.slice(0, head) + middle + address.slice(-tail);
}
