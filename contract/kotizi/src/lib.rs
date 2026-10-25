#![no_std]
//! Kotizi: tokenized consórcio (ROSCA). One contract: groups, KYC, the SEP-50 membership NFT
//! (OpenZeppelin `Base`), quota payments, draws and prizes. State is key-value (see `DataKey`);
//! per-cota data lives in per-index entries so each call touches a handful of entries.

mod draw_lib;
mod errors;
mod events;
mod ttl;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, token::TokenClient, Address, Bytes, BytesN, Env,
    String,
};
use stellar_tokens::non_fungible::{Base, Compose, NonFungibleToken};

pub use errors::Error;
use events::{
    DrawRequested, DrawSettled, GroupCreated, KycApproved, MemberJoined, PrizeClaimed, QuotaPaid,
};
use types::*;
pub use types::{Config, DataKey, Group, Prize, Status, Winner};

#[contract]
pub struct Kotizi;

// ------------------------------------------------------------------ storage helpers

fn config(e: &Env) -> Config {
    ttl::extend_instance(e);
    e.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("constructor ran")
}

fn load_group(e: &Env, group_id: u32) -> Group {
    let key = DataKey::Group(group_id);
    let group = e
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(e, Error::GroupNotFound));
    ttl::extend_persistent(e, &key);
    group
}

fn save_group(e: &Env, group_id: u32, group: &Group) {
    let key = DataKey::Group(group_id);
    e.storage().persistent().set(&key, group);
    ttl::extend_persistent(e, &key);
}

fn require_kyc(e: &Env, wallet: &Address) {
    let key = DataKey::Kyc(wallet.clone());
    if !e.storage().persistent().has(&key) {
        panic_with_error!(e, Error::NotKyc);
    }
    ttl::extend_persistent(e, &key);
}

fn checked<T>(e: &Env, v: Option<T>) -> T {
    v.unwrap_or_else(|| panic_with_error!(e, Error::MathOverflow))
}

// ------------------------------------------------------------------ contract

#[contractimpl]
impl Kotizi {
    pub fn __constructor(e: &Env, admin: Address, kyc_authority: Address, token: Address) {
        if TokenClient::new(e, &token).decimals() != TOKEN_DECIMALS {
            panic_with_error!(e, Error::InvalidTokenDecimals);
        }
        e.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                kyc_authority,
                token,
            },
        );
        e.storage().instance().set(&DataKey::GroupCount, &0u32);
        Base::set_metadata(
            e,
            String::from_str(e, ""),
            String::from_str(e, "Kotizi Cota"),
            String::from_str(e, "COTA"),
        );
        ttl::extend_instance(e);
    }

    // -------------------------------------------------------------- admin

    /// KYC authority only. No revocation (accepted, see PLAN.md).
    pub fn approve_kyc(e: &Env, wallet: Address) {
        config(e).kyc_authority.require_auth();
        let key = DataKey::Kyc(wallet.clone());
        if e.storage().persistent().has(&key) {
            panic_with_error!(e, Error::AlreadyApproved);
        }
        e.storage().persistent().set(&key, &e.ledger().timestamp());
        ttl::extend_persistent(e, &key);
        KycApproved { wallet }.publish(e);
    }

    /// Admin only. Returns the new group id.
    pub fn create_group(
        e: &Env,
        name: String,
        uri: String,
        quota: i128,
        max_members: u32,
        period: u64,
        admin_fee_bps: u32,
    ) -> u32 {
        config(e).admin.require_auth();
        if name.len() > MAX_NAME_LEN {
            panic_with_error!(e, Error::NameTooLong);
        }
        if uri.len() > MAX_URI_LEN {
            panic_with_error!(e, Error::UriTooLong);
        }
        if quota <= 0 {
            panic_with_error!(e, Error::InvalidQuota);
        }
        if !(MIN_MEMBERS..=MAX_MEMBERS).contains(&max_members) {
            panic_with_error!(e, Error::InvalidMaxMembers);
        }
        if period == 0 {
            panic_with_error!(e, Error::InvalidPeriod);
        }
        if admin_fee_bps > MAX_FEE_BPS {
            panic_with_error!(e, Error::FeeTooHigh);
        }

        let group_id: u32 = e
            .storage()
            .instance()
            .get(&DataKey::GroupCount)
            .unwrap_or(0);
        if group_id > MAX_GROUP_ID {
            panic_with_error!(e, Error::TooManyGroups);
        }
        e.storage()
            .instance()
            .set(&DataKey::GroupCount, &(group_id + 1));

        let next_draw_ts = checked(e, e.ledger().timestamp().checked_add(period));
        let group = Group {
            name: name.clone(),
            uri,
            quota,
            period,
            next_draw_ts,
            admin_fee_bps,
            max_members,
            members_joined: 0,
            round: 0,
            status: Status::Open,
            paid_bitmap: 0,
            won_bitmap: 0,
            unclaimed_bitmap: 0,
            unclaimed_total: 0,
            vault: 0,
            last_winner_index: 0,
            commitment: BytesN::from_array(e, &[0u8; 32]),
            commit_ledger: 0,
            committer: None,
        };
        save_group(e, group_id, &group);
        GroupCreated {
            group_id,
            name,
            quota,
            max_members,
            period,
            admin_fee_bps,
        }
        .publish(e);
        group_id
    }

    // -------------------------------------------------------------- members

    /// Mints the next cota of the group to `member` (who must be KYC-approved and sign). Allowed in
    /// any status until the group is full. Returns the cota index.
    pub fn join_group(e: &Env, group_id: u32, member: Address) -> u32 {
        member.require_auth();
        require_kyc(e, &member);
        let mut group = load_group(e, group_id);
        let index = group.members_joined;
        if index >= group.max_members {
            panic_with_error!(e, Error::GroupFull);
        }
        group.members_joined = index + 1; // index < max_members <= 64
        save_group(e, group_id, &group);

        Base::mint_with_id(e, &member, token_id(group_id, index));
        MemberJoined {
            group_id,
            member,
            index,
            members_joined: group.members_joined,
        }
        .publish(e);
        index
    }

    /// The current owner of the cota pays this round's quota, once, while the group is Open.
    pub fn pay_quota(e: &Env, group_id: u32, index: u32) {
        let mut group = load_group(e, group_id);
        if index >= group.members_joined {
            panic_with_error!(e, Error::CotaNotFound);
        }
        let owner = Base::owner_of(e, token_id(group_id, index));
        owner.require_auth();
        if group.status != Status::Open {
            panic_with_error!(e, Error::GroupNotOpen);
        }
        let bit = 1u64 << index;
        if group.paid_bitmap & bit != 0 {
            panic_with_error!(e, Error::AlreadyPaid);
        }

        // State first, then the external call (Soroban has no re-entry anyway).
        group.paid_bitmap |= bit;
        group.vault = checked(e, group.vault.checked_add(group.quota));
        let paid_key = DataKey::Paid(group_id, index);
        let total: i128 = e.storage().persistent().get(&paid_key).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&paid_key, &checked(e, total.checked_add(group.quota)));
        ttl::extend_persistent(e, &paid_key);
        save_group(e, group_id, &group);

        let token = TokenClient::new(e, &config(e).token);
        let this = e.current_contract_address();
        let before = token.balance(&this);
        token.transfer(&owner, &this, &group.quota);
        // Fee-on-transfer and rebasing tokens would break the vault accounting.
        let after = token.balance(&this);
        if checked(e, after.checked_sub(before)) != group.quota {
            panic_with_error!(e, Error::UnsupportedToken);
        }
        QuotaPaid {
            group_id,
            payer: owner,
            index,
            round: group.round,
            amount: group.quota,
        }
        .publish(e);
    }

    // -------------------------------------------------------------- draw

    /// Commit step. `committer` (normally the backend keeper) commits to `sha256(secret)`; payments freeze
    /// and the eligible set is fixed until `settle_draw`. A pending draw can be requested again (by anyone,
    /// with a new commitment) once its commit has expired, so a silent committer cannot stall a group.
    // TODO(vrf): the committer knows the outcome before revealing and can withhold it (bounded by the expiry
    // window); `env.prng()` mixed in at settle keeps it from choosing the winner. Testnet demo only.
    pub fn request_draw(e: &Env, group_id: u32, committer: Address, commitment: BytesN<32>) {
        committer.require_auth();
        let mut group = load_group(e, group_id);
        if e.ledger().timestamp() < group.next_draw_ts {
            panic_with_error!(e, Error::DrawNotDue);
        }
        let seq = e.ledger().sequence();
        match group.status {
            Status::Completed => panic_with_error!(e, Error::GroupNotOpen),
            Status::DrawPending if seq <= group.commit_ledger.saturating_add(COMMIT_EXPIRY) => {
                panic_with_error!(e, Error::DrawNotExpired)
            }
            _ => {}
        }
        if group.paid_bitmap & !group.won_bitmap == 0 {
            panic_with_error!(e, Error::NoEligibleMembers);
        }
        group.status = Status::DrawPending;
        group.commitment = commitment;
        group.commit_ledger = checked(e, seq.checked_add(COMMIT_DELAY));
        group.committer = Some(committer);
        save_group(e, group_id, &group);
        DrawRequested {
            group_id,
            round: group.round,
            commit_ledger: group.commit_ledger,
        }
        .publish(e);
    }

    /// Reveal step, signed by the committer. Picks the winner among the cotas that paid and have not won
    /// and records the prize. Nothing here moves tokens: the winner pulls it with `claim_prize`.
    pub fn settle_draw(e: &Env, group_id: u32, secret: BytesN<32>) {
        let mut group = load_group(e, group_id);
        if group.status != Status::DrawPending {
            panic_with_error!(e, Error::NoDrawPending);
        }
        group
            .committer
            .clone()
            .expect("pending draw has a committer")
            .require_auth();
        if e.ledger().sequence() <= group.commit_ledger {
            panic_with_error!(e, Error::DrawTooEarly);
        }
        if e.crypto().sha256(&Bytes::from(secret.clone())).to_bytes() != group.commitment {
            panic_with_error!(e, Error::InvalidSecret);
        }
        let eligible = group.paid_bitmap & !group.won_bitmap;
        if eligible == 0 {
            panic_with_error!(e, Error::NoEligibleMembers);
        }

        // random = sha256(secret || group_id || round || prng): the secret was fixed at commit time, the
        // prng term only exists in this transaction. Binding group and round stops replays elsewhere.
        let round = group.round;
        let mut seed = Bytes::from(secret);
        seed.append(&Bytes::from_array(e, &group_id.to_be_bytes()));
        seed.append(&Bytes::from_array(e, &round.to_be_bytes()));
        seed.append(&Bytes::from_array(e, &e.prng().gen::<u64>().to_be_bytes()));
        let random = e.crypto().sha256(&seed).to_bytes();
        let winner = draw_lib::pick_winner(&random, eligible);

        let paid = i128::from(draw_lib::popcount(group.paid_bitmap));
        let pool = checked(e, group.quota.checked_mul(paid));
        // The vault holds every prize still waiting plus this round's collection.
        let owed = checked(e, group.unclaimed_total.checked_add(pool));
        if group.vault < owed {
            panic_with_error!(e, Error::InsufficientVault);
        }

        let bit = 1u64 << winner;
        group.won_bitmap |= bit;
        group.unclaimed_bitmap |= bit;
        group.unclaimed_total = owed;
        group.last_winner_index = winner;
        group.paid_bitmap = 0;
        group.round = checked(e, round.checked_add(1));
        group.next_draw_ts = checked(e, e.ledger().timestamp().checked_add(group.period));
        let completed = group.round >= group.max_members;
        group.status = if completed {
            Status::Completed
        } else {
            Status::Open
        };
        group.commitment = BytesN::from_array(e, &[0u8; 32]);
        group.committer = None;

        let prize_key = DataKey::Prize(group_id, winner);
        e.storage().persistent().set(
            &prize_key,
            &Prize {
                gross: pool,
                won_round: round,
            },
        );
        ttl::extend_persistent(e, &prize_key);
        save_group(e, group_id, &group);
        DrawSettled {
            group_id,
            round,
            winner_index: winner,
            prize_pool: pool,
            completed,
        }
        .publish(e);
    }

    /// Pays a cota that has won, in any round and at any time, also after the group completed: the current
    /// owner of the NFT gets `prize - fee`, the admin gets `fee`. One prize per cota, so claims never
    /// depend on each other.
    pub fn claim_prize(e: &Env, group_id: u32, index: u32) {
        let mut group = load_group(e, group_id);
        if index >= group.members_joined {
            panic_with_error!(e, Error::CotaNotFound);
        }
        let owner = Base::owner_of(e, token_id(group_id, index));
        owner.require_auth();
        let bit = 1u64 << index;
        if group.won_bitmap & bit == 0 {
            panic_with_error!(e, Error::NotWinner);
        }
        if group.unclaimed_bitmap & bit == 0 {
            panic_with_error!(e, Error::AlreadyClaimed);
        }
        let prize_key = DataKey::Prize(group_id, index);
        let prize: Prize = e
            .storage()
            .persistent()
            .get(&prize_key)
            .expect("a winner has a prize");
        ttl::extend_persistent(e, &prize_key);

        let fee = checked(
            e,
            checked(e, prize.gross.checked_mul(i128::from(group.admin_fee_bps)))
                .checked_div(BPS_DENOMINATOR),
        );
        let net = checked(e, prize.gross.checked_sub(fee));

        group.unclaimed_bitmap &= !bit;
        group.unclaimed_total = checked(e, group.unclaimed_total.checked_sub(prize.gross));
        group.vault = checked(e, group.vault.checked_sub(prize.gross));
        save_group(e, group_id, &group);

        let cfg = config(e);
        let token = TokenClient::new(e, &cfg.token);
        let this = e.current_contract_address();
        if token.balance(&this) < prize.gross {
            panic_with_error!(e, Error::InsufficientVault);
        }
        token.transfer(&this, &owner, &net);
        if fee > 0 {
            token.transfer(&this, &cfg.admin, &fee);
        }
        PrizeClaimed {
            group_id,
            winner: owner,
            round: prize.won_round,
            index,
            prize: net,
            fee,
        }
        .publish(e);
    }

    // -------------------------------------------------------------- views

    pub fn get_group(e: &Env, group_id: u32) -> Group {
        load_group(e, group_id)
    }

    /// The prize a cota won (None until it wins; kept after the claim).
    pub fn get_prize(e: &Env, group_id: u32, index: u32) -> Option<Prize> {
        e.storage()
            .persistent()
            .get(&DataKey::Prize(group_id, index))
    }

    /// Every cota that has won with its prize, by cota index: one call instead of one per cota.
    pub fn winners(e: &Env, group_id: u32) -> soroban_sdk::Vec<Winner> {
        let group = load_group(e, group_id);
        let mut out = soroban_sdk::Vec::new(e);
        for index in 0..group.members_joined {
            if group.won_bitmap & (1u64 << index) != 0 {
                let prize: Prize = e
                    .storage()
                    .persistent()
                    .get(&DataKey::Prize(group_id, index))
                    .expect("a winner has a prize");
                out.push_back(Winner {
                    index,
                    gross: prize.gross,
                    won_round: prize.won_round,
                });
            }
        }
        out
    }

    pub fn group_count(e: &Env) -> u32 {
        ttl::extend_instance(e);
        e.storage()
            .instance()
            .get(&DataKey::GroupCount)
            .unwrap_or(0)
    }

    pub fn config(e: &Env) -> Config {
        config(e)
    }

    pub fn is_kyc(e: &Env, wallet: Address) -> bool {
        e.storage().persistent().has(&DataKey::Kyc(wallet))
    }

    pub fn total_paid(e: &Env, group_id: u32, index: u32) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::Paid(group_id, index))
            .unwrap_or(0)
    }

    pub fn token_id_of(_e: &Env, group_id: u32, index: u32) -> u32 {
        token_id(group_id, index)
    }

    /// Current owner of every cota joined so far, by cota index. One call instead of one per cota.
    pub fn cota_owners(e: &Env, group_id: u32) -> soroban_sdk::Vec<Address> {
        let group = load_group(e, group_id);
        let mut owners = soroban_sdk::Vec::new(e);
        for i in 0..group.members_joined {
            owners.push_back(Base::owner_of(e, token_id(group_id, i)));
        }
        owners
    }
}

// ------------------------------------------------------------------ membership NFT (SEP-50)

#[contractimpl(contracttrait)]
impl NonFungibleToken for Kotizi {
    type ContractType = Compose<(Base,)>;

    /// Whoever receives a cota, by join or by transfer, must be KYC-approved.
    fn transfer(e: &Env, from: Address, to: Address, token_id: u32) {
        require_kyc(e, &to);
        Self::ContractType::transfer(e, &from, &to, token_id);
    }

    fn transfer_from(e: &Env, spender: Address, from: Address, to: Address, token_id: u32) {
        require_kyc(e, &to);
        Self::ContractType::transfer_from(e, &spender, &from, &to, token_id);
    }

    /// Every cota of a group shares the group's metadata JSON.
    fn token_uri(e: &Env, token_id: u32) -> String {
        let _ = Self::ContractType::owner_of(e, token_id);
        load_group(e, token_id >> 8).uri
    }
}
