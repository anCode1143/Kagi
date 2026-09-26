# Kagi escrow program

The on-chain version of the holds the web app currently simulates in [`app/src/ledger.js`](../app/src/ledger.js). Source: [`src/lib.rs`](src/lib.rs) (Anchor).

## Deploy to devnet from the browser

No Rust or Solana tools needed locally.

1. Open [Solana Playground](https://beta.solpg.io) and create a new **Anchor** project.
2. Replace `src/lib.rs` with this folder's `src/lib.rs`.
3. Click the wallet button (bottom left) to create a Playground wallet, then get devnet SOL: run `solana airdrop 5` in the Playground terminal, or use [faucet.solana.com](https://faucet.solana.com).
4. **Build**, then **Deploy**. Playground fills in `declare_id!` with the program's address.
5. Copy the **program ID** and export the **IDL** (Build & Deploy panel), and put both in the repo so the app can use them.

## What each instruction does

| Instruction | Signer | Allowed when | Money goes to | App action it replaces |
|---|---|---|---|---|
| `create_hold(id, amount, hold_seconds, expiry_seconds)` | sender | any time | into the hold | `send()` with a hold |
| `cancel()` | sender | before `claimable_at` | sender | `cancel()`, the **Undo** button |
| `claim()` | recipient | `claimable_at` to `expires_at` | recipient (rent back to sender) | `claim()`, the **Collect** button |
| `reclaim()` | anyone | after `expires_at` | sender | `settle()` auto-return |

- **Hold address (PDA):** seeds `["hold", sender, id as 8 little-endian bytes]`. The app can use `Date.now()` as `id`.
- **Instant payments** to trusted people don't need the program: they're a normal SOL transfer.
- **Auto-return isn't automatic on-chain.** Nothing runs on a timer, so the app calls `reclaim` for the sender's expired holds when it opens, or a small background job can call it for everyone.
- **For live demos**, pass short windows, e.g. `hold_seconds = 30` and `expiry_seconds = 90`. The demo panel's fast-forward can't move the real clock.
- **Finding a user's holds:** `getProgramAccounts` on the program, filtered on the `sender` field (byte offset 8) or the `recipient` field (offset 40).

## Not built yet

- Wiring the web app to this program (a Demo / Devnet switch, with Phantom signing each transaction)
- The safety guards stay in the app; the program only enforces the hold rules.
