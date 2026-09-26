# Handoff: add a Devnet mode to the Kagi app

Notes for the next Claude session. Delete this file once the work is done.

## The task

Connect the web app in `app/` to the Anchor escrow program in `program/src/lib.rs` on Solana **devnet**, behind a **Demo / Devnet switch**. Demo mode (today's simulated ledger) stays the default and must keep working exactly as it does, because it's the backup for the live pitch.

The program is **not deployed yet**, so read its ID from one place with a placeholder, e.g. `app/src/config.js`: `export const PROGRAM_ID = null;`. Build everything now. Test what works without the program (balance, test SOL, instant transfers), and leave hold / undo / collect / reclaim ready to test once a teammate pastes the ID. Don't deploy the program yourself.

## Current state

- `app/` is a no-build ES-module app, served with `python -m http.server 5173 --directory app` (also in `.claude/launch.json`). No Node on this machine, so load libraries from a CDN (e.g. `https://esm.sh/@solana/web3.js@1.98.0`).
- `app/src/ledger.js` is the simulated escrow. The screens only call `send`, `cancel`, `claim`, `settle`, and `topUp`.
- `app/src/guards.js` has all the safety checks. Keep them in the app for both modes.
- There are uncommitted changes in the working tree: the recovery-phrase block, "What's this payment for?", and unverified tokens. They're finished and tested. Commit them first if the user asks.
- Test in the built-in browser with `?profile=qa` in the URL, so the user's own demo data isn't touched. Screenshots often time out; checking page text or running JS is more reliable.

## The user's preferences

- Front-end work only. Teammates own the program; don't change `program/` unless asked.
- Plain language and large, accessible UI ("usable by a great-grandmother"). Blue on cool neutrals, amber for warnings, nothing that looks like Revolut, no gradients.
- The currency is SOL, stored in lamports.
- Ask before committing. When asked to push: commit on a branch, push it, then fast-forward `main` and push. The repo is `anCode1143/Kagi`.

## Program details (from `program/src/lib.rs`)

- **Instruction data:** an 8-byte discriminator, the first 8 bytes of `sha256("global:<name>")` (compute it with WebCrypto), followed by Borsh little-endian args.
  - `create_hold(id: u64, amount: u64, hold_seconds: i64, expiry_seconds: i64)`
  - `cancel()`, `claim()` and `reclaim()` take no args.
- **Account order (must match exactly):**

  | Instruction | Accounts |
  |---|---|
  | `create_hold` | sender (signer, writable), recipient, hold PDA (writable), system program |
  | `cancel` | sender (signer, writable), hold (writable) |
  | `claim` | recipient (signer, writable), sender (writable), hold (writable) |
  | `reclaim` | caller (signer), sender (writable), hold (writable) |

- **Hold PDA:** seeds `["hold", sender pubkey, id as u64 little-endian]`.
- **Hold account layout:** 8-byte discriminator, then sender (32), recipient (32), id u64, amount u64, created_at i64, claimable_at i64, expires_at i64, bump u8. For `getProgramAccounts`, filter on sender at offset 8 or recipient at offset 40.
- Auto-return doesn't happen on its own: call `reclaim` for the viewer's expired holds when the app loads.
- For live demos, use short windows, e.g. `hold_seconds = 30`, `expiry_seconds = 90`. Fast-forward can't move the chain's clock, so hide or disable it in Devnet mode.

## Watch out for

- **Signing:** Kagi-created wallets don't keep their private key today (`app/src/wallet.js`). For Devnet mode, generate a web3.js `Keypair` per demo person (you, @aoife, @padraig, @ciaran) and keep its secret key in localStorage. That's fine for a devnet demo, but label it as not safe for real money. Phantom's `signAndSendTransaction` is a bonus; it can't be tested in the built-in browser.
- **Claiming** needs the recipient to sign. That's why each demo person needs their own devnet keypair. Switching people in the demo panel then works on-chain too.
- **Invalid addresses:** the fixed demo addresses in `app/src/seed.js` may not decode to 32 bytes, so they may not be valid public keys. In Devnet mode, use the keypairs' public keys for people. For the exchange and the lookalike, retry random middles until the address decodes to exactly 32 bytes.
- **Test SOL:** `requestAirdrop` on devnet is often rate-limited. Show a clear message and a link to faucet.solana.com if it fails. The sender can also fund the other demo people.
- Add Solana Explorer links (`https://explorer.solana.com/tx/<sig>?cluster=devnet`) to the payment screens in Devnet mode.
