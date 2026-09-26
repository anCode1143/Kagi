//! Kagi escrow: the on-chain version of `app/src/ledger.js`.
//!
//! A protected payment is a `Hold` account (a PDA) that owns the SOL until one of four things happens:
//!   create_hold — the sender moves SOL into a new hold for a recipient.
//!   cancel      — the sender takes it back, only before `claimable_at` (the "Undo" button).
//!   claim       — the recipient collects it, between `claimable_at` and `expires_at`.
//!   reclaim     — after `expires_at`, anyone can return it to the sender (auto-return; a program
//!                 can't run on a timer, so the app or a small background job calls this).
//!
//! Written for Anchor in Solana Playground (beta.solpg.io): paste this file, Build, then Deploy to devnet.
//! Playground fills in `declare_id!` with the deployed program's address on the first build.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod kagi_escrow {
    use super::*;

    /// `id` lets one sender have many holds open at once (the app uses a timestamp).
    /// `hold_seconds` is the undo window; `expiry_seconds` is when an unclaimed payment returns.
    pub fn create_hold(
        ctx: Context<CreateHold>,
        id: u64,
        amount: u64,
        hold_seconds: i64,
        expiry_seconds: i64,
    ) -> Result<()> {
        require!(amount > 0, KagiError::ZeroAmount);
        require!(hold_seconds >= 0 && expiry_seconds > hold_seconds, KagiError::BadWindow);

        let now = Clock::get()?.unix_timestamp;
        let hold = &mut ctx.accounts.hold;
        hold.sender = ctx.accounts.sender.key();
        hold.recipient = ctx.accounts.recipient.key();
        hold.id = id;
        hold.amount = amount;
        hold.created_at = now;
        hold.claimable_at = now + hold_seconds;
        hold.expires_at = now + expiry_seconds;
        hold.bump = ctx.bumps.hold;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sender.to_account_info(),
                    to: ctx.accounts.hold.to_account_info(),
                },
            ),
            amount,
        )
    }

    /// Undo: the whole account (payment + rent) goes back to the sender.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(now < ctx.accounts.hold.claimable_at, KagiError::UndoWindowClosed);
        Ok(())
    }

    /// The recipient takes the payment; the leftover rent goes back to the sender when the account closes.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let amount = ctx.accounts.hold.amount;
        require!(now >= ctx.accounts.hold.claimable_at, KagiError::NotClaimableYet);
        require!(now < ctx.accounts.hold.expires_at, KagiError::Expired);

        **ctx.accounts.hold.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += amount;
        Ok(())
    }

    /// Auto-return: after expiry, anyone may trigger it, and the money only ever goes to the sender.
    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.hold.expires_at, KagiError::NotExpired);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateHold<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: any address can be paid; it is only recorded, and must sign to claim.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        init,
        payer = sender,
        space = 8 + Hold::INIT_SPACE,
        seeds = [b"hold", sender.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub hold: Account<'info, Hold>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        mut,
        has_one = sender,
        close = sender,
        seeds = [b"hold", sender.key().as_ref(), &hold.id.to_le_bytes()],
        bump = hold.bump
    )]
    pub hold: Account<'info, Hold>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,
    /// CHECK: only receives the rent back; `has_one` ties it to the hold.
    #[account(mut)]
    pub sender: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = sender,
        has_one = recipient,
        close = sender,
        seeds = [b"hold", sender.key().as_ref(), &hold.id.to_le_bytes()],
        bump = hold.bump
    )]
    pub hold: Account<'info, Hold>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    pub caller: Signer<'info>,
    /// CHECK: receives everything back; `has_one` ties it to the hold.
    #[account(mut)]
    pub sender: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = sender,
        close = sender,
        seeds = [b"hold", sender.key().as_ref(), &hold.id.to_le_bytes()],
        bump = hold.bump
    )]
    pub hold: Account<'info, Hold>,
}

#[account]
#[derive(InitSpace)]
pub struct Hold {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub id: u64,
    pub amount: u64,
    pub created_at: i64,
    pub claimable_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum KagiError {
    #[msg("Amount must be more than zero.")]
    ZeroAmount,
    #[msg("The undo window must end before the payment expires.")]
    BadWindow,
    #[msg("The undo window has closed.")]
    UndoWindowClosed,
    #[msg("This payment can't be collected yet.")]
    NotClaimableYet,
    #[msg("This payment has expired and can only be returned to the sender.")]
    Expired,
    #[msg("This payment hasn't expired yet.")]
    NotExpired,
}
