//! Verification of a drand beacon (League of Entropy "quicknet") inside the contract.
//!
//! quicknet is chain `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, scheme
//! `bls-unchained-g1-rfc9380`: signatures are points of G1, the public key a point of G2, and round `r`
//! signs `sha256(r as 8 big-endian bytes)`. Round `r` is published at `GENESIS + (r - 1) * PERIOD`.
//! Nobody (including the drand operators acting alone) can know a round's signature before then, and
//! the signature of a round is unique, so a draw tied to a future round cannot be steered or retried.
//!
//! The host only takes uncompressed points, so the public key below is the uncompressed form of the
//! 96-byte compressed key published by drand and the backend decompresses signatures before sending.

use soroban_sdk::{
    bytesn,
    crypto::bls12_381::{Bls12381G1Affine, Bls12381G2Affine},
    vec, Bytes, BytesN, Env,
};

pub const GENESIS: u64 = 1_692_803_367;
pub const PERIOD: u64 = 3;
const DST: &[u8] = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

/// Moment the beacon of `round` is published. `round` must be at least 1.
pub fn round_time(round: u64) -> u64 {
    GENESIS + (round - 1) * PERIOD
}

/// The first round published at least `delay` rounds after `timestamp`: a round that did not exist
/// yet when the draw was requested. `None` if `timestamp` predates the chain.
pub fn round_after(timestamp: u64, delay: u64) -> Option<u64> {
    let since = timestamp.checked_sub(GENESIS)?;
    (since / PERIOD).checked_add(1)?.checked_add(delay)
}

fn public_key(e: &Env) -> Bls12381G2Affine {
    Bls12381G2Affine::from_bytes(bytesn!(
        e,
        0x03cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a01a714f2edb74119a2f2b0d5a7c75ba902d163700a61bc224ededd8e63aef7be1aaf8e93d7a9718b047ccddb3eb5d68b0e5db2b6bfbb01c867749cadffca88b36c24f3012ba09fc4d3022c5c37dce0f977d3adb5d183c7477c442b1f04515273
    ))
}

fn g2_generator(e: &Env) -> Bls12381G2Affine {
    Bls12381G2Affine::from_bytes(bytesn!(
        e,
        0x13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801
    ))
}

/// The host checks that every point is on the curve and in its subgroup. `true` when `signature` is the quicknet signature of `round`. Checks
/// `e(signature, -g2) * e(H(message), public_key) == 1`. The host traps on malformed points.
pub fn verify(e: &Env, round: u64, signature: &BytesN<96>) -> bool {
    let bls = e.crypto().bls12_381();
    let sig = Bls12381G1Affine::from_bytes(signature.clone());
    let message = e
        .crypto()
        .sha256(&Bytes::from_array(e, &round.to_be_bytes()));
    let point = bls.hash_to_g1(&Bytes::from(message.to_bytes()), &Bytes::from_slice(e, DST));
    bls.pairing_check(
        vec![e, sig, point],
        vec![e, -g2_generator(e), public_key(e)],
    )
}
