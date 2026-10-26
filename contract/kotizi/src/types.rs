use soroban_sdk::{contracttype, Address, String};

pub const MIN_MEMBERS: u32 = 2;
pub const MAX_MEMBERS: u32 = 64;
pub const MAX_FEE_BPS: u32 = 1_000;
pub const MAX_NAME_LEN: u32 = 32;
pub const MAX_URI_LEN: u32 = 200;
/// Tokens an admin can enable (a handful: the allowlist is read as one instance entry).
pub const MAX_TOKENS: u32 = 8;
pub const MAX_TOKEN_DECIMALS: u32 = 18;
/// Group ids share the NFT token id (`u32`) with the cota index: `(group_id << 8) | index`.
/// A draw waits for the drand round `DRAW_ROUND_DELAY` rounds (30 s) after the one running when it was
/// requested, which absorbs the skew between ledger close time and drand's clock.
pub const DRAW_ROUND_DELAY: u64 = 10;
/// A pending draw may be requested again once its round is this many seconds old without a settlement
/// (drand being down is the only way that happens).
pub const DRAW_EXPIRY_SECS: u64 = 3_600;
pub const BPS_DENOMINATOR: i128 = 10_000;
pub const MAX_GROUP_ID: u32 = (1 << 24) - 1;

#[contracttype]
pub enum DataKey {
    /// instance
    Config,
    /// instance
    GroupCount,
    /// instance: `Vec<TokenInfo>`, the tokens groups can be created in
    Tokens,
    /// persistent: ledger timestamp of the approval
    Kyc(Address),
    /// persistent
    Group(u32),
    /// persistent, one entry per cota (never an array inside `Group`): total paid by the cota
    Paid(u32, u32),
    /// persistent, one entry per cota that has won: see `Prize`
    Prize(u32, u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub kyc_authority: Address,
    /// The only account that may call `request_draw` (the draw bot).
    pub keeper: Address,
}

/// A token groups may use, with the decimals it reported when it was enabled (quotas are in its base units).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInfo {
    pub token: Address,
    pub decimals: u32,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Status {
    Open = 0,
    DrawPending = 1,
    Completed = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Group {
    pub name: String,
    pub uri: String,
    /// The SEP-41 token this group collects and pays prizes in (one of `Tokens`).
    pub token: Address,
    pub quota: i128,
    pub period: u64,
    pub next_draw_ts: u64,
    pub admin_fee_bps: u32,
    pub max_members: u32,
    pub members_joined: u32,
    pub round: u32,
    pub status: Status,
    pub paid_bitmap: u64,
    pub won_bitmap: u64,
    pub unclaimed_bitmap: u64,
    /// Sum of the prizes still unclaimed.
    pub unclaimed_total: i128,
    /// This group's share of the contract's token balance; always at least `unclaimed_total`.
    pub vault: i128,
    pub last_winner_index: u32,
    /// The drand round that decides the pending draw (0 when none is pending).
    pub draw_round: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Prize {
    pub gross: i128,
    pub won_round: u32,
}

/// A won cota with its prize, as returned in bulk by `winners`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Winner {
    pub index: u32,
    pub gross: i128,
    pub won_round: u32,
}

pub fn token_id(group_id: u32, index: u32) -> u32 {
    (group_id << 8) | index
}
