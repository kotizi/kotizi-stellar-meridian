extern crate std;

use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Ledger, MockAuth, MockAuthInvoke,
    },
    Address, BytesN, Env, IntoVal, String,
};
use stellar_tokens::non_fungible::NonFungibleTokenClient;
use test_usdc::{TestUsdc, TestUsdcClient};

use crate::drand::{round_time, GENESIS, PERIOD};
use crate::test_beacons::BEACONS;
use crate::types::{DRAW_EXPIRY_SECS, DRAW_ROUND_DELAY};
use crate::{Error, Kotizi, KotiziClient, Status};

const QUOTA: i128 = 100_000_000; // 100 USDC

struct Setup<'a> {
    e: Env,
    admin: Address,
    usdc: TestUsdcClient<'a>,
    kotizi: KotiziClient<'a>,
    nft: NonFungibleTokenClient<'a>,
}

fn setup<'a>() -> Setup<'a> {
    let e = Env::default();
    e.mock_all_auths();
    // A few minutes before the first test beacon (round 1_000_000), so draws land on real drand rounds.
    e.ledger().set_timestamp(GENESIS + 2_999_000);
    let admin = Address::generate(&e);
    let kyc = Address::generate(&e);
    let token = e.register(TestUsdc, (&admin, 6u32));
    let id = e.register(Kotizi, (&admin, &kyc));
    KotiziClient::new(&e, &id).add_token(&token);
    Setup {
        usdc: TestUsdcClient::new(&e, &token),
        kotizi: KotiziClient::new(&e, &id),
        nft: NonFungibleTokenClient::new(&e, &id),
        e,
        admin,
    }
}

impl Setup<'_> {
    fn group(&self, max_members: u32) -> u32 {
        self.group_in(&self.usdc.address, max_members)
    }

    /// A group collecting `token` (which must have been added).
    fn group_in(&self, token: &Address, max_members: u32) -> u32 {
        self.kotizi.create_group(
            &String::from_str(&self.e, "Casa Demo"),
            &String::from_str(&self.e, "https://example.com/meta.json"),
            token,
            &QUOTA,
            &max_members,
            &60,
            &200,
        )
    }

    /// A KYC-approved member holding `funds` test USDC.
    fn member(&self, funds: i128) -> Address {
        let m = Address::generate(&self.e);
        self.kotizi.approve_kyc(&m);
        self.usdc.mint(&m, &funds);
        m
    }
}

#[test]
fn kyc_approval_is_once_and_authority_only() {
    let s = setup();
    let w = Address::generate(&s.e);
    assert!(!s.kotizi.is_kyc(&w));
    s.kotizi.approve_kyc(&w);
    assert!(s.kotizi.is_kyc(&w));
    assert_eq!(
        s.kotizi.try_approve_kyc(&w),
        Err(Ok(Error::AlreadyApproved))
    );

    // the admin is not the KYC authority: only the authority's signature is accepted
    let w2 = Address::generate(&s.e);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.kotizi.address,
            fn_name: "approve_kyc",
            args: (&w2,).into_val(&s.e),
            sub_invokes: &[],
        },
    }]);
    assert!(s.kotizi.try_approve_kyc(&w2).is_err());
    assert!(!s.kotizi.is_kyc(&w2));
}

#[test]
fn create_group_validates_and_is_admin_only() {
    let s = setup();
    let name = String::from_str(&s.e, "G");
    let uri = String::from_str(&s.e, "u");
    let k = &s.kotizi;
    let tok = s.usdc.address.clone();
    assert_eq!(
        k.try_create_group(&name, &uri, &tok, &0, &5, &60, &0),
        Err(Ok(Error::InvalidQuota))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &tok, &QUOTA, &1, &60, &0),
        Err(Ok(Error::InvalidMaxMembers))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &tok, &QUOTA, &65, &60, &0),
        Err(Ok(Error::InvalidMaxMembers))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &tok, &QUOTA, &5, &0, &0),
        Err(Ok(Error::InvalidPeriod))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &tok, &QUOTA, &5, &60, &1_001),
        Err(Ok(Error::FeeTooHigh))
    );
    let long = String::from_str(&s.e, "0123456789012345678901234567890123");
    assert_eq!(
        k.try_create_group(&long, &uri, &tok, &QUOTA, &5, &60, &0),
        Err(Ok(Error::NameTooLong))
    );

    assert_eq!(s.group(5), 0);
    assert_eq!(s.group(5), 1);
    assert_eq!(k.group_count(), 2);
    let g = k.get_group(&0);
    assert_eq!(g.status, Status::Open);
    assert_eq!(g.next_draw_ts, GENESIS + 2_999_000 + 60);
    assert_eq!(k.try_get_group(&9), Err(Ok(Error::GroupNotFound)));

    // a non-admin signature is not enough
    let stranger = Address::generate(&s.e);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &k.address,
            fn_name: "create_group",
            args: (&name, &uri, &tok, QUOTA, 5u32, 60u64, 0u32).into_val(&s.e),
            sub_invokes: &[],
        },
    }]);
    assert!(k
        .try_create_group(&name, &uri, &tok, &QUOTA, &5, &60, &0)
        .is_err());
    assert_eq!(k.group_count(), 2);
}

#[test]
fn join_mints_the_nft_in_order_and_needs_kyc() {
    let s = setup();
    let id = s.group(3);
    let outsider = Address::generate(&s.e);
    assert_eq!(
        s.kotizi.try_join_group(&id, &outsider),
        Err(Ok(Error::NotKyc))
    );

    let (a, b) = (s.member(0), s.member(0));
    assert_eq!(s.kotizi.join_group(&id, &a), 0);
    assert_eq!(s.kotizi.join_group(&id, &b), 1);
    // one wallet may hold several cotas
    assert_eq!(s.kotizi.join_group(&id, &a), 2);
    assert_eq!(s.nft.owner_of(&s.kotizi.token_id_of(&id, &1)), b);
    assert_eq!(s.nft.balance(&a), 2);
    assert_eq!(
        s.kotizi.cota_owners(&id),
        soroban_sdk::vec![&s.e, a.clone(), b.clone(), a.clone()]
    );
    assert_eq!(s.kotizi.get_group(&id).members_joined, 3);
    assert_eq!(
        s.nft.token_uri(&s.kotizi.token_id_of(&id, &0)),
        String::from_str(&s.e, "https://example.com/meta.json")
    );
}

#[test]
fn join_rejects_a_full_group_and_unknown_group() {
    let s = setup();
    let id = s.group(2);
    let m = s.member(0);
    s.kotizi.join_group(&id, &m);
    s.kotizi.join_group(&id, &m);
    assert_eq!(s.kotizi.try_join_group(&id, &m), Err(Ok(Error::GroupFull)));
    assert_eq!(
        s.kotizi.try_join_group(&7, &m),
        Err(Ok(Error::GroupNotFound))
    );
}

#[test]
fn pay_quota_moves_tokens_once_per_round() {
    let s = setup();
    let id = s.group(3);
    let m = s.member(QUOTA * 2);
    s.kotizi.join_group(&id, &m);
    s.kotizi.pay_quota(&id, &0);

    assert_eq!(s.usdc.balance(&m), QUOTA);
    assert_eq!(s.usdc.balance(&s.kotizi.address), QUOTA);
    let g = s.kotizi.get_group(&id);
    assert_eq!((g.paid_bitmap, g.vault), (0b1, QUOTA));
    assert_eq!(s.kotizi.total_paid(&id, &0), QUOTA);

    // double pay in the same round
    assert_eq!(s.kotizi.try_pay_quota(&id, &0), Err(Ok(Error::AlreadyPaid)));
    assert_eq!(s.usdc.balance(&m), QUOTA);
    // a cota that was never minted
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &1),
        Err(Ok(Error::CotaNotFound))
    );
}

#[test]
fn pay_quota_fails_without_funds_and_leaves_no_trace() {
    let s = setup();
    let id = s.group(3);
    let m = s.member(QUOTA - 1);
    s.kotizi.join_group(&id, &m);
    assert!(s.kotizi.try_pay_quota(&id, &0).is_err());
    let g = s.kotizi.get_group(&id);
    assert_eq!((g.paid_bitmap, g.vault), (0, 0));
}

#[test]
fn only_the_current_nft_owner_can_pay_and_rights_follow_the_nft() {
    let s = setup();
    let id = s.group(3);
    let owner = s.member(QUOTA);
    s.kotizi.join_group(&id, &owner);
    let tid = s.kotizi.token_id_of(&id, &0);

    // signed by someone else: rejected, nothing moves
    let other = s.member(QUOTA);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &other,
        invoke: &MockAuthInvoke {
            contract: &s.kotizi.address,
            fn_name: "pay_quota",
            args: (id, 0u32).into_val(&s.e),
            sub_invokes: &[MockAuthInvoke {
                contract: &s.usdc.address,
                fn_name: "transfer",
                args: (&other, &s.kotizi.address, QUOTA).into_val(&s.e),
                sub_invokes: &[],
            }],
        },
    }]);
    assert!(s.kotizi.try_pay_quota(&id, &0).is_err());
    assert_eq!(s.kotizi.get_group(&id).paid_bitmap, 0);

    // after a transfer the new owner pays, the old one no longer can
    s.e.mock_all_auths();
    s.nft.transfer(&owner, &other, &tid);
    s.kotizi.pay_quota(&id, &0);
    assert_eq!(s.usdc.balance(&other), 0);
    assert_eq!(s.usdc.balance(&owner), QUOTA);
}

#[test]
fn nft_transfer_requires_a_kyc_recipient() {
    let s = setup();
    let id = s.group(3);
    let owner = s.member(0);
    s.kotizi.join_group(&id, &owner);
    let tid = s.kotizi.token_id_of(&id, &0);
    let outsider = Address::generate(&s.e);
    assert_eq!(
        s.nft.try_transfer(&owner, &outsider, &tid),
        Err(Ok(Error::NotKyc.into()))
    );
    assert_eq!(s.nft.owner_of(&tid), owner);
}

#[test]
fn entries_are_kept_alive_to_the_network_maximum() {
    let s = setup();
    let id = s.group(3);
    let m = s.member(QUOTA);
    s.kotizi.join_group(&id, &m);
    s.kotizi.pay_quota(&id, &0);
    let max = s.e.storage().max_ttl();
    s.e.as_contract(&s.kotizi.address, || {
        for key in [
            crate::DataKey::Group(id),
            crate::DataKey::Paid(id, 0),
            crate::DataKey::Kyc(m.clone()),
        ] {
            assert_eq!(s.e.storage().persistent().get_ttl(&key), max);
        }
        assert_eq!(s.e.storage().instance().get_ttl(), max);
    });
    // drift below half of the maximum, then touch: extended back
    s.e.ledger().with_mut(|l| l.sequence_number += max / 2 + 1);
    s.kotizi.get_group(&id);
    s.e.as_contract(&s.kotizi.address, || {
        assert_eq!(
            s.e.storage()
                .persistent()
                .get_ttl(&crate::DataKey::Group(id)),
            max
        );
    });
}

// ------------------------------------------------------------------ draws and prizes
//
// Draws use real drand quicknet beacons (`BEACONS`): a draw requested when the ledger clock reads
// `request_time(k)` waits for beacon `k`, and the contract verifies its BLS signature for real.

fn request_time(k: usize) -> u64 {
    round_time(BEACONS[k].0 - DRAW_ROUND_DELAY)
}

fn beacon(e: &Env, k: usize) -> BytesN<96> {
    let mut raw = [0u8; 96];
    raw.copy_from_slice(&std::vec::Vec::from_iter(
        (0..96).map(|i| u8::from_str_radix(&BEACONS[k].1[2 * i..2 * i + 2], 16).unwrap()),
    ));
    BytesN::from_array(e, &raw)
}

impl Setup<'_> {
    fn advance(&self, ledgers: u32, secs: u64) {
        self.e.ledger().with_mut(|l| {
            l.sequence_number += ledgers;
            l.timestamp += secs;
        });
    }

    fn set_time(&self, ts: u64) {
        self.e.ledger().set_timestamp(ts);
    }

    /// A full group of `n` members (one cota each) with plenty of funds, already past its first draw date.
    fn full_group(&self, n: u32) -> (u32, std::vec::Vec<Address>) {
        let id = self.group(n);
        let members: std::vec::Vec<Address> = (0..n).map(|_| self.member(QUOTA * 20)).collect();
        for m in &members {
            self.kotizi.join_group(&id, m);
        }
        self.advance(1, 61);
        (id, members)
    }

    fn pay_all(&self, id: u32, n: u32) {
        for i in 0..n {
            self.kotizi.pay_quota(&id, &i);
        }
    }

    /// Requests the draw so that it waits for beacon `k`.
    fn request(&self, id: u32, k: usize) {
        self.set_time(request_time(k));
        self.kotizi.request_draw(&id);
        assert_eq!(self.kotizi.get_group(&id).draw_round, BEACONS[k].0);
    }

    /// Request, wait for the round, settle with its real signature. Returns the winner's index.
    fn draw(&self, id: u32, k: usize) -> u32 {
        self.request(id, k);
        self.set_time(round_time(BEACONS[k].0));
        self.kotizi.settle_draw(&id, &beacon(&self.e, k));
        self.kotizi.get_group(&id).last_winner_index
    }
}

#[test]
fn draw_cannot_be_requested_before_it_is_due_or_without_payments() {
    let s = setup();
    let id = s.group(3);
    let m = s.member(QUOTA);
    s.kotizi.join_group(&id, &m);
    s.kotizi.pay_quota(&id, &0);
    // paid, but the date has not come
    assert_eq!(s.kotizi.try_request_draw(&id), Err(Ok(Error::DrawNotDue)));
    s.advance(1, 61);
    // due, but nobody eligible in another group
    let empty = s.group(3);
    s.advance(1, 61);
    assert_eq!(
        s.kotizi.try_request_draw(&empty),
        Err(Ok(Error::NoEligibleMembers))
    );
    assert_eq!(s.kotizi.get_group(&empty).status, Status::Open);
    s.kotizi.request_draw(&id);
    let g = s.kotizi.get_group(&id);
    assert_eq!(g.status, Status::DrawPending);
    // the round is in the future: DRAW_ROUND_DELAY rounds after the one running now
    let now = s.e.ledger().timestamp();
    assert_eq!(
        g.draw_round,
        (now - GENESIS) / PERIOD + 1 + DRAW_ROUND_DELAY
    );
    assert!(round_time(g.draw_round) > now);
}

#[test]
fn settle_needs_the_round_a_valid_signature_and_no_signer() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    s.request(id, 0);

    // the round has not been published yet
    s.set_time(round_time(BEACONS[0].0) - 1);
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &beacon(&s.e, 0)),
        Err(Ok(Error::DrawTooEarly))
    );
    s.set_time(round_time(BEACONS[0].0));

    // a real beacon, but of another round
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &beacon(&s.e, 1)),
        Err(Ok(Error::InvalidBeacon))
    );
    // not a point on the curve: the host rejects it
    assert!(s
        .kotizi
        .try_settle_draw(&id, &BytesN::from_array(&s.e, &[7u8; 96]))
        .is_err());
    assert_eq!(s.kotizi.get_group(&id).status, Status::DrawPending);

    // anyone can settle: no authorization at all is needed
    s.e.set_auths(&[]);
    s.kotizi.settle_draw(&id, &beacon(&s.e, 0));
    assert_eq!(s.kotizi.get_group(&id).status, Status::Open);
}

#[test]
fn settle_cannot_be_replayed_and_a_beacon_decides_only_its_own_round() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    let winner = s.draw(id, 0);
    let before = s.kotizi.get_group(&id);
    assert_eq!(before.round, 1);
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &beacon(&s.e, 0)),
        Err(Ok(Error::NoDrawPending))
    );
    assert_eq!(s.kotizi.get_group(&id), before);
    assert_eq!(s.kotizi.get_prize(&id, &winner).unwrap().gross, QUOTA * 3);

    // the next draw waits for a later beacon: the old signature does not fit it
    s.advance(1, 61);
    s.pay_all(id, 3);
    s.request(id, 1);
    s.set_time(round_time(BEACONS[1].0));
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &beacon(&s.e, 0)),
        Err(Ok(Error::InvalidBeacon))
    );
}

#[test]
fn the_winner_depends_on_the_beacon_alone() {
    // two fresh environments with different addresses and ledger sequences, same beacon: same winner
    let winners: std::vec::Vec<u32> = [1u32, 500]
        .iter()
        .map(|seq| {
            let s = setup();
            s.e.ledger().with_mut(|l| l.sequence_number = *seq);
            let (id, _) = s.full_group(8);
            s.pay_all(id, 8);
            s.draw(id, 0)
        })
        .collect();
    assert_eq!(winners[0], winners[1]);
}

#[test]
fn groups_drawing_the_same_round_do_not_share_an_outcome() {
    let s = setup();
    let (a, _) = s.full_group(16);
    let (b, _) = s.full_group(16);
    s.pay_all(a, 16);
    s.pay_all(b, 16);
    s.set_time(request_time(0));
    s.kotizi.request_draw(&a);
    s.kotizi.request_draw(&b);
    s.set_time(round_time(BEACONS[0].0));
    s.kotizi.settle_draw(&a, &beacon(&s.e, 0));
    s.kotizi.settle_draw(&b, &beacon(&s.e, 0));
    assert_ne!(
        s.kotizi.get_group(&a).last_winner_index,
        s.kotizi.get_group(&b).last_winner_index
    );
}

#[test]
fn payments_freeze_while_a_draw_is_pending() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.kotizi.pay_quota(&id, &0);
    s.kotizi.request_draw(&id);
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &1),
        Err(Ok(Error::GroupNotOpen))
    );
}

#[test]
fn a_stalled_draw_can_be_requested_again_only_after_it_expires() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    s.request(id, 0);
    let expiry = round_time(BEACONS[0].0) + DRAW_EXPIRY_SECS;

    s.set_time(expiry); // still inside the window
    assert_eq!(
        s.kotizi.try_request_draw(&id),
        Err(Ok(Error::DrawNotExpired))
    );
    s.set_time(expiry + 1);
    s.kotizi.request_draw(&id);
    assert_eq!(s.kotizi.get_group(&id).draw_round, BEACONS[5].0);

    // the old round no longer decides it; the new one does
    s.set_time(round_time(BEACONS[5].0));
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &beacon(&s.e, 0)),
        Err(Ok(Error::InvalidBeacon))
    );
    s.kotizi.settle_draw(&id, &beacon(&s.e, 5));
    assert_eq!(s.kotizi.get_group(&id).round, 1);
}

#[test]
fn only_paying_cotas_can_win_and_a_cota_wins_once() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.kotizi.pay_quota(&id, &1); // only cota 1 paid
    assert_eq!(s.draw(id, 0), 1);
    assert_eq!(s.kotizi.get_prize(&id, &1).unwrap().gross, QUOTA);

    // round 2: cota 1 pays again but has already won, so nobody is eligible
    s.advance(1, 61);
    s.kotizi.pay_quota(&id, &1);
    s.set_time(request_time(1));
    assert_eq!(
        s.kotizi.try_request_draw(&id),
        Err(Ok(Error::NoEligibleMembers))
    );
    // once another cota pays, the draw proceeds and it is the only candidate
    s.kotizi.pay_quota(&id, &2);
    assert_eq!(s.draw(id, 1), 2);
    assert_eq!(s.kotizi.get_prize(&id, &2).unwrap().gross, QUOTA * 2);
}

#[test]
fn full_group_runs_to_completion_and_every_prize_is_paid_out() {
    let s = setup();
    let (id, members) = s.full_group(3);
    let mut winners = std::vec::Vec::new();
    for round in 0..3u32 {
        s.pay_all(id, 3);
        winners.push(s.draw(id, round as usize));
        s.advance(1, 61);
    }
    winners.sort();
    assert_eq!(winners, std::vec![0, 1, 2]); // each cota won exactly once
    let g = s.kotizi.get_group(&id);
    assert_eq!(
        (g.status, g.round, g.won_bitmap),
        (Status::Completed, 3, 0b111)
    );
    assert_eq!(g.unclaimed_total, QUOTA * 9);
    assert_eq!(g.vault, QUOTA * 9);

    // completed: no more draws, no more payments
    assert_eq!(s.kotizi.try_request_draw(&id), Err(Ok(Error::GroupNotOpen)));
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &0),
        Err(Ok(Error::GroupNotOpen))
    );

    // claims after completion; fee is 2% of each 3 x QUOTA prize
    let fee = QUOTA * 3 * 200 / 10_000;
    for (i, m) in members.iter().enumerate() {
        let before = s.usdc.balance(m);
        s.kotizi.claim_prize(&id, &(i as u32));
        assert_eq!(s.usdc.balance(m), before + QUOTA * 3 - fee);
    }
    assert_eq!(s.usdc.balance(&s.admin), 3 * fee);
    assert_eq!(s.usdc.balance(&s.kotizi.address), 0);
    let g = s.kotizi.get_group(&id);
    assert_eq!((g.unclaimed_bitmap, g.unclaimed_total, g.vault), (0, 0, 0));
}

#[test]
fn an_unclaimed_prize_never_blocks_the_next_draw() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    let first = s.draw(id, 0);
    s.advance(1, 61);
    s.pay_all(id, 3);
    let second = s.draw(id, 1);
    assert_ne!(first, second);
    let g = s.kotizi.get_group(&id);
    assert_eq!(g.unclaimed_total, QUOTA * 6);
    assert_eq!(g.vault, QUOTA * 6);
    let w = s.kotizi.winners(&id);
    assert_eq!(w.len(), 2);
    let mut rounds: std::vec::Vec<u32> = w.iter().map(|x| x.won_round).collect();
    rounds.sort();
    assert_eq!(rounds, std::vec![0, 1]);
    assert!(w.iter().all(|x| x.gross == QUOTA * 3));
    let mut expected = std::vec![first, second];
    expected.sort();
    assert_eq!(
        w.iter().map(|x| x.index).collect::<std::vec::Vec<_>>(),
        expected
    ); // by cota index
    s.kotizi.claim_prize(&id, &first); // the old prize is still claimable
    assert_eq!(s.kotizi.winners(&id).len(), 2); // kept after the claim
    assert_eq!(s.kotizi.get_group(&id).vault, QUOTA * 3);
}

#[test]
fn claim_rules_non_winner_double_claim_and_owner_only() {
    let s = setup();
    let (id, members) = s.full_group(3);
    // nobody has won yet
    assert_eq!(s.kotizi.try_claim_prize(&id, &0), Err(Ok(Error::NotWinner)));
    assert_eq!(
        s.kotizi.try_claim_prize(&id, &9),
        Err(Ok(Error::CotaNotFound))
    );
    s.pay_all(id, 3);
    let w = s.draw(id, 0);
    let loser = (w + 1) % 3;
    assert_eq!(
        s.kotizi.try_claim_prize(&id, &loser),
        Err(Ok(Error::NotWinner))
    );

    // signed by someone who does not own the winning cota: rejected, nothing moves
    let thief = Address::generate(&s.e);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &thief,
        invoke: &MockAuthInvoke {
            contract: &s.kotizi.address,
            fn_name: "claim_prize",
            args: (id, w).into_val(&s.e),
            sub_invokes: &[],
        },
    }]);
    assert!(s.kotizi.try_claim_prize(&id, &w).is_err());
    assert_eq!(s.usdc.balance(&thief), 0);
    s.e.mock_all_auths();

    // the prize follows the NFT: the new owner claims
    let buyer = s.member(0);
    s.nft
        .transfer(&members[w as usize], &buyer, &s.kotizi.token_id_of(&id, &w));
    let fee = QUOTA * 3 * 200 / 10_000;
    s.kotizi.claim_prize(&id, &w);
    assert_eq!(s.usdc.balance(&buyer), QUOTA * 3 - fee);
    assert_eq!(
        s.kotizi.try_claim_prize(&id, &w),
        Err(Ok(Error::AlreadyClaimed))
    );
    assert_eq!(s.usdc.balance(&buyer), QUOTA * 3 - fee);
}

#[test]
fn draws_on_a_partial_group_wait_for_new_joiners() {
    let s = setup();
    let id = s.group(3);
    let m = s.member(QUOTA * 10);
    s.kotizi.join_group(&id, &m);
    s.advance(1, 61);
    s.kotizi.pay_quota(&id, &0);
    assert_eq!(s.draw(id, 0), 0);
    s.advance(1, 61);
    s.kotizi.pay_quota(&id, &0);
    s.set_time(request_time(1));
    assert_eq!(
        s.kotizi.try_request_draw(&id),
        Err(Ok(Error::NoEligibleMembers))
    );
    // a new member joins, pays, and the draw moves again
    let late = s.member(QUOTA);
    assert_eq!(s.kotizi.join_group(&id, &late), 1);
    s.kotizi.pay_quota(&id, &1);
    assert_eq!(s.draw(id, 1), 1);
}

// ------------------------------------------------------------------ several tokens

impl Setup<'_> {
    /// A second token with `decimals` decimals, enabled for new groups.
    fn other_token(&self, decimals: u32) -> TestUsdcClient<'_> {
        let id = self.e.register(TestUsdc, (&self.admin, decimals));
        self.kotizi.add_token(&id);
        TestUsdcClient::new(&self.e, &id)
    }
}

#[test]
fn tokens_are_enabled_by_the_admin_only_once_and_with_sane_decimals() {
    let s = setup();
    let k = &s.kotizi;
    assert_eq!(k.tokens().len(), 1);
    assert_eq!(k.tokens().get(0).unwrap().token, s.usdc.address);
    assert_eq!(k.tokens().get(0).unwrap().decimals, 6);

    let seven = s.other_token(7);
    let listed = k.tokens();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed.get(1).unwrap().token, seven.address);
    assert_eq!(listed.get(1).unwrap().decimals, 7);

    assert_eq!(
        k.try_add_token(&seven.address),
        Err(Ok(Error::TokenAlreadyAdded))
    );
    let wild = s.e.register(TestUsdc, (&s.admin, 19u32));
    assert_eq!(k.try_add_token(&wild), Err(Ok(Error::InvalidTokenDecimals)));

    // only the admin
    let fresh = s.e.register(TestUsdc, (&s.admin, 6u32));
    let stranger = Address::generate(&s.e);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &k.address,
            fn_name: "add_token",
            args: (&fresh,).into_val(&s.e),
            sub_invokes: &[],
        },
    }]);
    assert!(k.try_add_token(&fresh).is_err());
    s.e.mock_all_auths();
    assert_eq!(k.tokens().len(), 2);

    // a bounded allowlist
    for _ in 0..6 {
        s.other_token(6);
    }
    assert_eq!(k.tokens().len(), 8);
    assert_eq!(k.try_add_token(&fresh), Err(Ok(Error::TooManyTokens)));
}

#[test]
fn a_group_can_only_be_created_in_an_enabled_token() {
    let s = setup();
    let stranger_token = s.e.register(TestUsdc, (&s.admin, 6u32));
    let r = s.kotizi.try_create_group(
        &String::from_str(&s.e, "G"),
        &String::from_str(&s.e, "u"),
        &stranger_token,
        &QUOTA,
        &3,
        &60,
        &0,
    );
    assert_eq!(r, Err(Ok(Error::TokenNotSupported)));
    assert_eq!(s.kotizi.group_count(), 0);
}

#[test]
fn groups_in_different_tokens_never_touch_each_others_balances() {
    let s = setup();
    let seven = s.other_token(7);
    let a = s.group(2); // usdc, 6 decimals
    let b = s.group_in(&seven.address, 2); // the 7-decimal token
    assert_eq!(s.kotizi.get_group(&a).token, s.usdc.address);
    assert_eq!(s.kotizi.get_group(&b).token, seven.address);

    // member 0 and 1 hold both tokens and join both groups
    let members: std::vec::Vec<Address> = (0..2)
        .map(|_| {
            let m = s.member(QUOTA * 10);
            seven.mint(&m, &(QUOTA * 10));
            m
        })
        .collect();
    for m in &members {
        s.kotizi.join_group(&a, m);
        s.kotizi.join_group(&b, m);
    }
    s.advance(1, 61);

    // paying in group b moves only the 7-decimal token
    let (usdc0, seven0) = (s.usdc.balance(&members[0]), seven.balance(&members[0]));
    s.kotizi.pay_quota(&b, &0);
    assert_eq!(s.usdc.balance(&members[0]), usdc0);
    assert_eq!(seven.balance(&members[0]), seven0 - QUOTA);
    assert_eq!(seven.balance(&s.kotizi.address), QUOTA);
    assert_eq!(s.usdc.balance(&s.kotizi.address), 0);
    assert_eq!(s.kotizi.get_group(&b).vault, QUOTA);
    assert_eq!(s.kotizi.get_group(&a).vault, 0);

    // a member who holds only the other token cannot pay in this group, and nothing changes
    let c = s.group_in(&seven.address, 2);
    let poor = s.member(QUOTA * 10); // test usdc only
    s.kotizi.join_group(&c, &poor);
    s.advance(1, 61);
    let before = s.kotizi.get_group(&c);
    assert!(s.kotizi.try_pay_quota(&c, &0).is_err());
    assert_eq!(s.kotizi.get_group(&c), before);
    assert_eq!(s.usdc.balance(&poor), QUOTA * 10);
}

#[test]
fn prize_and_fee_are_paid_in_the_groups_own_token() {
    let s = setup();
    let seven = s.other_token(7);
    let (a, _) = {
        let id = s.group_in(&seven.address, 2);
        let ms: std::vec::Vec<Address> = (0..2)
            .map(|_| {
                let m = s.member(0);
                seven.mint(&m, &(QUOTA * 5));
                m
            })
            .collect();
        for m in &ms {
            s.kotizi.join_group(&id, m);
        }
        (id, ms)
    };
    s.advance(1, 61);
    s.pay_all(a, 2);
    let winner = s.draw(a, 0);
    let owner = s.kotizi.cota_owners(&a).get(winner).unwrap();
    let before = (
        seven.balance(&owner),
        s.usdc.balance(&owner),
        seven.balance(&s.admin),
    );
    s.kotizi.claim_prize(&a, &winner);
    let fee = QUOTA * 2 * 200 / 10_000;
    assert_eq!(seven.balance(&owner), before.0 + QUOTA * 2 - fee);
    assert_eq!(seven.balance(&s.admin), before.2 + fee);
    assert_eq!(s.usdc.balance(&owner), before.1); // the other token is untouched
    assert_eq!(seven.balance(&s.kotizi.address), 0);
}
