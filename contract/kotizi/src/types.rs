use soroban_sdk::{contracttype, Address, BytesN, String};

pub const MIN_MEMBERS: u32 = 2;
pub const MAX_MEMBERS: u32 = 64;
pub const MAX_FEE_BPS: u32 = 1_000;
pub const MAX_NAME_LEN: u32 = 32;
pub const MAX_URI_LEN: u32 = 200;
pub const TOKEN_DECIMALS: u32 = 6;
/// Group ids share the NFT token id (`u32`) with the cota index: `(group_id << 8) | index`.
/// `settle_draw` needs `sequence > commit_ledger`, with `commit_ledger = sequence_at_request + COMMIT_DELAY`.
pub const COMMIT_DELAY: u32 = 3;
/// A pending draw may be requested again once `sequence > commit_ledger + COMMIT_EXPIRY` (~1 h at 5 s/ledger).
pub const COMMIT_EXPIRY: u32 = 720;
pub const BPS_DENOMINATOR: i128 = 10_000;
pub const MAX_GROUP_ID: u32 = (1 << 24) - 1;

#[contracttype]
pub enum DataKey {
    /// instance
    Config,
    /// instance
    GroupCount,
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
    pub token: Address,
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
    // Draw commit data (task 4).
    pub commitment: BytesN<32>,
    pub commit_ledger: u32,
    pub committer: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Prize {
    pub gross: i128,
    pub won_round: u32,
}

pub fn token_id(group_id: u32, index: u32) -> u32 {
    (group_id << 8) | index
}
