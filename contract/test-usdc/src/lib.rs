#![no_std]
//! Test USDC: a SEP-41 token with 6 decimals whose admin mints (the backend faucet).
//! Testnet only. A plain contract token, not a classic-asset SAC, so wallets need no trustline.

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, MuxedAddress, String};
use stellar_tokens::fungible::{Base, Compose, FungibleToken};

#[contracttype]
enum DataKey {
    Admin,
}

#[contract]
pub struct TestUsdc;

#[contractimpl]
impl TestUsdc {
    /// `decimals` is a parameter only so tests can build a wrong token; deploy with 6.
    pub fn __constructor(e: &Env, admin: Address, decimals: u32) {
        Base::set_metadata(
            e,
            decimals,
            String::from_str(e, "Test USDC"),
            String::from_str(e, "USDC"),
        );
        e.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Admin only.
    pub fn mint(e: &Env, to: Address, amount: i128) {
        let admin: Address = e
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin set");
        admin.require_auth();
        Base::mint(e, &to, amount);
    }
}

#[contractimpl(contracttrait)]
impl FungibleToken for TestUsdc {
    type ContractType = Compose<(Base,)>;
}
