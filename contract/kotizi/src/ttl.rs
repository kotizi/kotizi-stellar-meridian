//! TTL policy (PLAN.md, "TTL policy"). Entries are extended to the network maximum when they are
//! created and whenever they are touched with less than half of it left, so one paid extension
//! buys the longest life and untouched entries are not re-extended on every call.

use soroban_sdk::{Env, IntoVal, Val};

fn threshold(e: &Env) -> u32 {
    e.storage().max_ttl() / 2
}

pub fn extend_instance(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(threshold(e), e.storage().max_ttl());
}

pub fn extend_persistent<K: IntoVal<Env, Val>>(e: &Env, key: &K) {
    e.storage()
        .persistent()
        .extend_ttl(key, threshold(e), e.storage().max_ttl());
}
