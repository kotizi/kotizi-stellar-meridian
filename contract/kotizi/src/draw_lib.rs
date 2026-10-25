//! Winner selection over a 64-bit eligibility bitmap. Pure, so it is tested on its own.

use soroban_sdk::BytesN;

pub fn popcount(x: u64) -> u32 {
    x.count_ones()
}

/// Position of the `k`-th (0-based, from the least significant bit) set bit. Requires `k < popcount(bits)`.
pub fn nth_set_bit(mut bits: u64, k: u32) -> u32 {
    for _ in 0..k {
        bits &= bits - 1; // clear the lowest set bit
    }
    bits.trailing_zeros()
}

/// `k = random % popcount(eligible)`; the winner is the k-th eligible cota. `random` already binds the
/// group and the round (see `settle_draw`), so one value cannot be replayed elsewhere. The first 16 bytes
/// give a 128-bit number: the modulo bias is below 2^-120.
pub fn pick_winner(random: &BytesN<32>, eligible: u64) -> u32 {
    let n = popcount(eligible);
    assert!(n > 0, "no eligible cota");
    let bytes = random.to_array();
    let mut head = [0u8; 16];
    head.copy_from_slice(&bytes[..16]);
    let k = (u128::from_be_bytes(head) % n as u128) as u32;
    nth_set_bit(eligible, k)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn nth_set_bit_walks_the_set_bits_in_order() {
        let bits = 0b1010_0110u64; // bits 1, 2, 5, 7
        assert_eq!(popcount(bits), 4);
        assert_eq!([0, 1, 2, 3].map(|k| nth_set_bit(bits, k)), [1, 2, 5, 7]);
        assert_eq!(nth_set_bit(1 << 63, 0), 63);
        assert_eq!(nth_set_bit(u64::MAX, 63), 63);
    }

    #[test]
    fn pick_winner_is_always_an_eligible_cota_and_covers_all_of_them() {
        let e = Env::default();
        let eligible = 0b1001_0100u64; // 2, 4, 7
        let mut seen = 0u64;
        for i in 0..200u32 {
            let mut raw = [0u8; 32];
            raw[..4].copy_from_slice(&i.to_be_bytes());
            raw[4..8].copy_from_slice(&i.wrapping_mul(2_654_435_761).to_be_bytes());
            let w = pick_winner(&BytesN::from_array(&e, &raw), eligible);
            assert!(eligible & (1 << w) != 0);
            seen |= 1 << w;
        }
        assert_eq!(seen, eligible);
    }

    #[test]
    fn single_eligible_cota_always_wins() {
        let e = Env::default();
        assert_eq!(pick_winner(&BytesN::from_array(&e, &[0xAB; 32]), 1 << 9), 9);
    }
}
