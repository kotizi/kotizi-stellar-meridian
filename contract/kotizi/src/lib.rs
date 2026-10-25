#![no_std]
//! Kotizi: tokenized consórcio (ROSCA). One contract: groups, KYC, the SEP-50 membership NFT
//! (OpenZeppelin `Base`), quota payments, draws and prizes. State is key-value (see `DataKey`);
//! per-cota data lives in per-index entries so each call touches a handful of entries.

mod drand;
mod draw_lib;
mod errors;
mod events;
mod ttl;
mod types;

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_beacons;

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

fn load_group(e: &Env, group_id: u32) -> Result<Group, Error> {
    let key = DataKey::Group(group_id);
    let group = e
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::GroupNotFound)?;
    ttl::extend_persistent(e, &key);
    Ok(group)
}

fn save_group(e: &Env, group_id: u32, group: &Group) {
    let key = DataKey::Group(group_id);
    e.storage().persistent().set(&key, group);
    ttl::extend_persistent(e, &key);
}

fn require_kyc(e: &Env, wallet: &Address) -> Result<(), Error> {
    let key = DataKey::Kyc(wallet.clone());
    if !e.storage().persistent().has(&key) {
        return Err(Error::NotKyc);
    }
    ttl::extend_persistent(e, &key);
    Ok(())
}

fn checked<T>(v: Option<T>) -> Result<T, Error> {
    v.ok_or(Error::MathOverflow)
}

/// For the entry points whose signature the SEP-50 trait fixes (no `Result`): fail with the same error.
fn or_panic<T>(e: &Env, r: Result<T, Error>) -> T {
    r.unwrap_or_else(|err| panic_with_error!(e, err))
}

// ------------------------------------------------------------------ contract

#[contractimpl]
impl Kotizi {
    pub fn __constructor(
        e: &Env,
        admin: Address,
        kyc_authority: Address,
        token: Address,
    ) -> Result<(), Error> {
        if TokenClient::new(e, &token).decimals() != TOKEN_DECIMALS {
            return Err(Error::InvalidTokenDecimals);
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
        Ok(())
    }

    // -------------------------------------------------------------- admin

    /// KYC authority only. No revocation (accepted, see PLAN.md).
    pub fn approve_kyc(e: &Env, wallet: Address) -> Result<(), Error> {
        config(e).kyc_authority.require_auth();
        let key = DataKey::Kyc(wallet.clone());
        if e.storage().persistent().has(&key) {
            return Err(Error::AlreadyApproved);
        }
        e.storage().persistent().set(&key, &e.ledger().timestamp());
        ttl::extend_persistent(e, &key);
        KycApproved { wallet }.publish(e);
        Ok(())
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
    ) -> Result<u32, Error> {
        config(e).admin.require_auth();
        if name.len() > MAX_NAME_LEN {
            return Err(Error::NameTooLong);
        }
        if uri.len() > MAX_URI_LEN {
            return Err(Error::UriTooLong);
        }
        if quota <= 0 {
            return Err(Error::InvalidQuota);
        }
        if !(MIN_MEMBERS..=MAX_MEMBERS).contains(&max_members) {
            return Err(Error::InvalidMaxMembers);
        }
        if period == 0 {
            return Err(Error::InvalidPeriod);
        }
        if admin_fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }

        let group_id: u32 = e
            .storage()
            .instance()
            .get(&DataKey::GroupCount)
            .unwrap_or(0);
        if group_id > MAX_GROUP_ID {
            return Err(Error::TooManyGroups);
        }
        e.storage()
            .instance()
            .set(&DataKey::GroupCount, &(group_id + 1));

        let next_draw_ts = checked(e.ledger().timestamp().checked_add(period))?;
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
            draw_round: 0,
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
        Ok(group_id)
    }

    // -------------------------------------------------------------- members

    /// Mints the next cota of the group to `member` (who must be KYC-approved and sign). Allowed in
    /// any status until the group is full. Returns the cota index.
    pub fn join_group(e: &Env, group_id: u32, member: Address) -> Result<u32, Error> {
        member.require_auth();
        require_kyc(e, &member)?;
        let mut group = load_group(e, group_id)?;
        let index = group.members_joined;
        if index >= group.max_members {
            return Err(Error::GroupFull);
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
        Ok(index)
    }

    /// The current owner of the cota pays this round's quota, once, while the group is Open.
    pub fn pay_quota(e: &Env, group_id: u32, index: u32) -> Result<(), Error> {
        let mut group = load_group(e, group_id)?;
        if index >= group.members_joined {
            return Err(Error::CotaNotFound);
        }
        let owner = Base::owner_of(e, token_id(group_id, index));
        owner.require_auth();
        if group.status != Status::Open {
            return Err(Error::GroupNotOpen);
        }
        let bit = 1u64 << index;
        if group.paid_bitmap & bit != 0 {
            return Err(Error::AlreadyPaid);
        }

        // State first, then the external call (Soroban has no re-entry anyway).
        group.paid_bitmap |= bit;
        group.vault = checked(group.vault.checked_add(group.quota))?;
        let paid_key = DataKey::Paid(group_id, index);
        let total: i128 = e.storage().persistent().get(&paid_key).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&paid_key, &checked(total.checked_add(group.quota))?);
        ttl::extend_persistent(e, &paid_key);
        save_group(e, group_id, &group);

        let token = TokenClient::new(e, &config(e).token);
        let this = e.current_contract_address();
        let before = token.balance(&this);
        token.transfer(&owner, &this, &group.quota);
        // Fee-on-transfer and rebasing tokens would break the vault accounting.
        let after = token.balance(&this);
        if checked(after.checked_sub(before))? != group.quota {
            return Err(Error::UnsupportedToken);
        }
        QuotaPaid {
            group_id,
            payer: owner,
            index,
            round: group.round,
            amount: group.quota,
        }
        .publish(e);
        Ok(())
    }

    // -------------------------------------------------------------- draw

    /// Fixes the drand round that will decide this draw and freezes payments and the eligible set until
    /// `settle_draw`. Needs no signature: the round is derived from the ledger time, and anyone may ask
    /// for a due draw. The round is the one published `DRAW_ROUND_DELAY` rounds after the current one, so
    /// nobody knows its randomness yet, and it is fixed here, so nobody can pick another. A pending draw
    /// can be requested again (a new round) only once its round is `DRAW_EXPIRY_SECS` old.
    pub fn request_draw(e: &Env, group_id: u32) -> Result<(), Error> {
        let mut group = load_group(e, group_id)?;
        let now = e.ledger().timestamp();
        if now < group.next_draw_ts {
            return Err(Error::DrawNotDue);
        }
        match group.status {
            Status::Completed => return Err(Error::GroupNotOpen),
            Status::DrawPending
                if now <= drand::round_time(group.draw_round).saturating_add(DRAW_EXPIRY_SECS) =>
            {
                return Err(Error::DrawNotExpired);
            }
            _ => {}
        }
        if group.paid_bitmap & !group.won_bitmap == 0 {
            return Err(Error::NoEligibleMembers);
        }
        group.status = Status::DrawPending;
        group.draw_round = checked(drand::round_after(now, DRAW_ROUND_DELAY))?;
        save_group(e, group_id, &group);
        DrawRequested {
            group_id,
            round: group.round,
            draw_round: group.draw_round,
        }
        .publish(e);
        Ok(())
    }

    /// Settles a pending draw with the drand signature of its round (uncompressed G1, 96 bytes). Anyone
    /// may send it: the contract verifies the BLS signature itself. Picks the winner among the cotas that
    /// paid and have not won and records the prize. Nothing here moves tokens: the winner pulls it with
    /// `claim_prize`.
    pub fn settle_draw(e: &Env, group_id: u32, signature: BytesN<96>) -> Result<(), Error> {
        let mut group = load_group(e, group_id)?;
        if group.status != Status::DrawPending {
            return Err(Error::NoDrawPending);
        }
        if e.ledger().timestamp() < drand::round_time(group.draw_round) {
            return Err(Error::DrawTooEarly);
        }
        if !drand::verify(e, group.draw_round, &signature) {
            return Err(Error::InvalidBeacon);
        }
        let eligible = group.paid_bitmap & !group.won_bitmap;
        if eligible == 0 {
            return Err(Error::NoEligibleMembers);
        }

        // random = sha256(signature || group_id): the signature is unique per drand round and unknowable
        // before it; binding the group keeps groups that draw the same round from sharing an outcome.
        let round = group.round;
        let mut seed = Bytes::from(signature);
        seed.append(&Bytes::from_array(e, &group_id.to_be_bytes()));
        let random = e.crypto().sha256(&seed).to_bytes();
        let winner = draw_lib::pick_winner(&random, eligible);

        let paid = i128::from(draw_lib::popcount(group.paid_bitmap));
        let pool = checked(group.quota.checked_mul(paid))?;
        // The vault holds every prize still waiting plus this round's collection.
        let owed = checked(group.unclaimed_total.checked_add(pool))?;
        if group.vault < owed {
            return Err(Error::InsufficientVault);
        }

        let bit = 1u64 << winner;
        group.won_bitmap |= bit;
        group.unclaimed_bitmap |= bit;
        group.unclaimed_total = owed;
        group.last_winner_index = winner;
        group.paid_bitmap = 0;
        group.round = checked(round.checked_add(1))?;
        group.next_draw_ts = checked(e.ledger().timestamp().checked_add(group.period))?;
        let completed = group.round >= group.max_members;
        group.status = if completed {
            Status::Completed
        } else {
            Status::Open
        };
        group.draw_round = 0;

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
        Ok(())
    }

    /// Pays a cota that has won, in any round and at any time, also after the group completed: the current
    /// owner of the NFT gets `prize - fee`, the admin gets `fee`. One prize per cota, so claims never
    /// depend on each other.
    pub fn claim_prize(e: &Env, group_id: u32, index: u32) -> Result<(), Error> {
        let mut group = load_group(e, group_id)?;
        if index >= group.members_joined {
            return Err(Error::CotaNotFound);
        }
        let owner = Base::owner_of(e, token_id(group_id, index));
        owner.require_auth();
        let bit = 1u64 << index;
        if group.won_bitmap & bit == 0 {
            return Err(Error::NotWinner);
        }
        if group.unclaimed_bitmap & bit == 0 {
            return Err(Error::AlreadyClaimed);
        }
        let prize_key = DataKey::Prize(group_id, index);
        let prize: Prize = e
            .storage()
            .persistent()
            .get(&prize_key)
            .expect("a winner has a prize");
        ttl::extend_persistent(e, &prize_key);

        let fee = checked(
            checked(prize.gross.checked_mul(i128::from(group.admin_fee_bps)))?
                .checked_div(BPS_DENOMINATOR),
        )?;
        let net = checked(prize.gross.checked_sub(fee))?;

        group.unclaimed_bitmap &= !bit;
        group.unclaimed_total = checked(group.unclaimed_total.checked_sub(prize.gross))?;
        group.vault = checked(group.vault.checked_sub(prize.gross))?;
        save_group(e, group_id, &group);

        let cfg = config(e);
        let token = TokenClient::new(e, &cfg.token);
        let this = e.current_contract_address();
        if token.balance(&this) < prize.gross {
            return Err(Error::InsufficientVault);
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
        Ok(())
    }

    // -------------------------------------------------------------- views

    pub fn get_group(e: &Env, group_id: u32) -> Result<Group, Error> {
        load_group(e, group_id)
    }

    /// The prize a cota won (None until it wins; kept after the claim).
    pub fn get_prize(e: &Env, group_id: u32, index: u32) -> Option<Prize> {
        e.storage()
            .persistent()
            .get(&DataKey::Prize(group_id, index))
    }

    /// Every cota that has won with its prize, by cota index: one call instead of one per cota.
    pub fn winners(e: &Env, group_id: u32) -> Result<soroban_sdk::Vec<Winner>, Error> {
        let group = load_group(e, group_id)?;
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
        Ok(out)
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
    pub fn cota_owners(e: &Env, group_id: u32) -> Result<soroban_sdk::Vec<Address>, Error> {
        let group = load_group(e, group_id)?;
        let mut owners = soroban_sdk::Vec::new(e);
        for i in 0..group.members_joined {
            owners.push_back(Base::owner_of(e, token_id(group_id, i)));
        }
        Ok(owners)
    }
}

// ------------------------------------------------------------------ membership NFT (SEP-50)

#[contractimpl(contracttrait)]
impl NonFungibleToken for Kotizi {
    type ContractType = Compose<(Base,)>;

    /// Whoever receives a cota, by join or by transfer, must be KYC-approved.
    fn transfer(e: &Env, from: Address, to: Address, token_id: u32) {
        or_panic(e, require_kyc(e, &to));
        Self::ContractType::transfer(e, &from, &to, token_id);
    }

    fn transfer_from(e: &Env, spender: Address, from: Address, to: Address, token_id: u32) {
        or_panic(e, require_kyc(e, &to));
        Self::ContractType::transfer_from(e, &spender, &from, &to, token_id);
    }

    /// Every cota of a group shares the group's metadata JSON.
    fn token_uri(e: &Env, token_id: u32) -> String {
        let _ = Self::ContractType::owner_of(e, token_id);
        or_panic(e, load_group(e, token_id >> 8)).uri
    }
}
