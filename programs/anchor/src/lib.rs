use anchor_lang::prelude::*;

declare_id!("6bPVQ5vhpHNUgCWR7Fgc6F5Uf4JgNS2GUsq6nsUTcWuv");

#[program]
pub mod anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
