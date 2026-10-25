extern crate std;

use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Ledger, MockAuth, MockAuthInvoke,
    },
    Address, Bytes, BytesN, Env, IntoVal, String,
};
use stellar_tokens::non_fungible::NonFungibleTokenClient;
use test_usdc::{TestUsdc, TestUsdcClient};

use crate::types::{COMMIT_DELAY, COMMIT_EXPIRY};
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
    e.ledger().set_timestamp(1_000);
    let admin = Address::generate(&e);
    let kyc = Address::generate(&e);
    let token = e.register(TestUsdc, (&admin, 6u32));
    let id = e.register(Kotizi, (&admin, &kyc, &token));
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
        self.kotizi.create_group(
            &String::from_str(&self.e, "Casa Demo"),
            &String::from_str(&self.e, "https://example.com/meta.json"),
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
fn constructor_rejects_wrong_decimals() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let token = e.register(TestUsdc, (&admin, 18u32));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        e.register(Kotizi, (&admin, &admin, &token));
    }));
    assert!(r.is_err());
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
        Err(Ok(Error::AlreadyApproved.into()))
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
    assert_eq!(
        k.try_create_group(&name, &uri, &0, &5, &60, &0),
        Err(Ok(Error::InvalidQuota.into()))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &QUOTA, &1, &60, &0),
        Err(Ok(Error::InvalidMaxMembers.into()))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &QUOTA, &65, &60, &0),
        Err(Ok(Error::InvalidMaxMembers.into()))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &QUOTA, &5, &0, &0),
        Err(Ok(Error::InvalidPeriod.into()))
    );
    assert_eq!(
        k.try_create_group(&name, &uri, &QUOTA, &5, &60, &1_001),
        Err(Ok(Error::FeeTooHigh.into()))
    );
    let long = String::from_str(&s.e, "0123456789012345678901234567890123");
    assert_eq!(
        k.try_create_group(&long, &uri, &QUOTA, &5, &60, &0),
        Err(Ok(Error::NameTooLong.into()))
    );

    assert_eq!(s.group(5), 0);
    assert_eq!(s.group(5), 1);
    assert_eq!(k.group_count(), 2);
    let g = k.get_group(&0);
    assert_eq!(g.status, Status::Open);
    assert_eq!(g.next_draw_ts, 1_060);
    assert_eq!(k.try_get_group(&9), Err(Ok(Error::GroupNotFound.into())));

    // a non-admin signature is not enough
    let stranger = Address::generate(&s.e);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &k.address,
            fn_name: "create_group",
            args: (&name, &uri, QUOTA, 5u32, 60u64, 0u32).into_val(&s.e),
            sub_invokes: &[],
        },
    }]);
    assert!(k
        .try_create_group(&name, &uri, &QUOTA, &5, &60, &0)
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
        Err(Ok(Error::NotKyc.into()))
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
    assert_eq!(
        s.kotizi.try_join_group(&id, &m),
        Err(Ok(Error::GroupFull.into()))
    );
    assert_eq!(
        s.kotizi.try_join_group(&7, &m),
        Err(Ok(Error::GroupNotFound.into()))
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
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &0),
        Err(Ok(Error::AlreadyPaid.into()))
    );
    assert_eq!(s.usdc.balance(&m), QUOTA);
    // a cota that was never minted
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &1),
        Err(Ok(Error::CotaNotFound.into()))
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

fn secret(e: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(e, &[n; 32])
}

fn commitment(e: &Env, secret: &BytesN<32>) -> BytesN<32> {
    e.crypto().sha256(&Bytes::from(secret.clone())).to_bytes()
}

impl Setup<'_> {
    fn advance(&self, ledgers: u32, secs: u64) {
        self.e.ledger().with_mut(|l| {
            l.sequence_number += ledgers;
            l.timestamp += secs;
        });
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

    /// Commit, wait out the delay, reveal. Returns the winner's index.
    fn draw(&self, id: u32, committer: &Address, n: u8) -> u32 {
        let sec = secret(&self.e, n);
        self.kotizi
            .request_draw(&id, committer, &commitment(&self.e, &sec));
        self.advance(COMMIT_DELAY + 1, 0);
        self.kotizi.settle_draw(&id, &sec);
        self.kotizi.get_group(&id).last_winner_index
    }
}

#[test]
fn draw_cannot_be_requested_before_it_is_due_or_without_payments() {
    let s = setup();
    let id = s.group(3);
    let keeper = Address::generate(&s.e);
    let c = commitment(&s.e, &secret(&s.e, 1));
    let m = s.member(QUOTA);
    s.kotizi.join_group(&id, &m);
    s.kotizi.pay_quota(&id, &0);
    // paid, but the date has not come
    assert_eq!(
        s.kotizi.try_request_draw(&id, &keeper, &c),
        Err(Ok(Error::DrawNotDue.into()))
    );
    s.advance(1, 61);
    // due, but nobody eligible in another group
    let empty = s.group(3);
    s.advance(1, 61);
    assert_eq!(
        s.kotizi.try_request_draw(&empty, &keeper, &c),
        Err(Ok(Error::NoEligibleMembers.into()))
    );
    assert_eq!(s.kotizi.get_group(&empty).status, Status::Open);
    s.kotizi.request_draw(&id, &keeper, &c);
    assert_eq!(s.kotizi.get_group(&id).status, Status::DrawPending);
}

#[test]
fn settle_needs_the_commit_delay_the_right_secret_and_the_committer() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    let keeper = Address::generate(&s.e);
    let sec = secret(&s.e, 7);
    s.kotizi.request_draw(&id, &keeper, &commitment(&s.e, &sec));

    // same ledger as the request: too early
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &sec),
        Err(Ok(Error::DrawTooEarly.into()))
    );
    s.advance(COMMIT_DELAY, 0);
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &sec),
        Err(Ok(Error::DrawTooEarly.into()))
    ); // sequence == commit_ledger
    s.advance(1, 0);

    // wrong secret
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &secret(&s.e, 8)),
        Err(Ok(Error::InvalidSecret.into()))
    );
    // right secret, signed by someone else
    let other = Address::generate(&s.e);
    s.e.set_auths(&[]);
    s.e.mock_auths(&[MockAuth {
        address: &other,
        invoke: &MockAuthInvoke {
            contract: &s.kotizi.address,
            fn_name: "settle_draw",
            args: (id, &sec).into_val(&s.e),
            sub_invokes: &[],
        },
    }]);
    assert!(s.kotizi.try_settle_draw(&id, &sec).is_err());
    assert_eq!(s.kotizi.get_group(&id).status, Status::DrawPending);

    s.e.mock_all_auths();
    s.kotizi.settle_draw(&id, &sec);
    assert_eq!(s.kotizi.get_group(&id).status, Status::Open);
}

#[test]
fn settle_cannot_be_replayed() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    let keeper = Address::generate(&s.e);
    let winner = s.draw(id, &keeper, 1);
    let before = s.kotizi.get_group(&id);
    assert_eq!(before.round, 1);
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &secret(&s.e, 1)),
        Err(Ok(Error::NoDrawPending.into()))
    );
    assert_eq!(s.kotizi.get_group(&id), before);
    assert_eq!(s.kotizi.get_prize(&id, &winner).unwrap().gross, QUOTA * 3);
}

#[test]
fn payments_freeze_while_a_draw_is_pending() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.kotizi.pay_quota(&id, &0);
    let keeper = Address::generate(&s.e);
    s.kotizi
        .request_draw(&id, &keeper, &commitment(&s.e, &secret(&s.e, 1)));
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &1),
        Err(Ok(Error::GroupNotOpen.into()))
    );
}

#[test]
fn a_stalled_commit_can_be_replaced_only_after_it_expires() {
    let s = setup();
    let (id, _) = s.full_group(3);
    s.pay_all(id, 3);
    let (silent, backup) = (Address::generate(&s.e), Address::generate(&s.e));
    let old = secret(&s.e, 1);
    s.kotizi.request_draw(&id, &silent, &commitment(&s.e, &old));
    let commit_ledger = s.kotizi.get_group(&id).commit_ledger;

    let new = secret(&s.e, 2);
    let c2 = commitment(&s.e, &new);
    s.advance(COMMIT_EXPIRY, 0); // sequence == commit_ledger + EXPIRY - DELAY, still inside the window
    assert_eq!(
        s.kotizi.try_request_draw(&id, &backup, &c2),
        Err(Ok(Error::DrawNotExpired.into()))
    );
    s.e.ledger()
        .with_mut(|l| l.sequence_number = commit_ledger + COMMIT_EXPIRY);
    assert_eq!(
        s.kotizi.try_request_draw(&id, &backup, &c2),
        Err(Ok(Error::DrawNotExpired.into()))
    );
    s.advance(1, 0);
    s.kotizi.request_draw(&id, &backup, &c2);

    // the replaced secret no longer works; the new committer settles
    s.advance(COMMIT_DELAY + 1, 0);
    assert_eq!(
        s.kotizi.try_settle_draw(&id, &old),
        Err(Ok(Error::InvalidSecret.into()))
    );
    s.kotizi.settle_draw(&id, &new);
    assert_eq!(s.kotizi.get_group(&id).round, 1);
}

#[test]
fn only_paying_cotas_can_win_and_a_cota_wins_once() {
    let s = setup();
    let (id, _) = s.full_group(3);
    let keeper = Address::generate(&s.e);
    s.kotizi.pay_quota(&id, &1); // only cota 1 paid
    assert_eq!(s.draw(id, &keeper, 1), 1);
    assert_eq!(s.kotizi.get_prize(&id, &1).unwrap().gross, QUOTA);

    // round 2: cota 1 pays again but has already won, so nobody is eligible
    s.advance(1, 61);
    s.kotizi.pay_quota(&id, &1);
    let c = commitment(&s.e, &secret(&s.e, 2));
    assert_eq!(
        s.kotizi.try_request_draw(&id, &keeper, &c),
        Err(Ok(Error::NoEligibleMembers.into()))
    );
    // once another cota pays, the draw proceeds and it is the only candidate
    s.kotizi.pay_quota(&id, &2);
    assert_eq!(s.draw(id, &keeper, 2), 2);
    assert_eq!(s.kotizi.get_prize(&id, &2).unwrap().gross, QUOTA * 2);
}

#[test]
fn full_group_runs_to_completion_and_every_prize_is_paid_out() {
    let s = setup();
    let (id, members) = s.full_group(3);
    let keeper = Address::generate(&s.e);
    let mut winners = std::vec::Vec::new();
    for round in 0..3u32 {
        s.pay_all(id, 3);
        winners.push(s.draw(id, &keeper, round as u8 + 1));
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
    let c = commitment(&s.e, &secret(&s.e, 9));
    assert_eq!(
        s.kotizi.try_request_draw(&id, &keeper, &c),
        Err(Ok(Error::GroupNotOpen.into()))
    );
    assert_eq!(
        s.kotizi.try_pay_quota(&id, &0),
        Err(Ok(Error::GroupNotOpen.into()))
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
    let keeper = Address::generate(&s.e);
    s.pay_all(id, 3);
    let first = s.draw(id, &keeper, 1);
    s.advance(1, 61);
    s.pay_all(id, 3);
    let second = s.draw(id, &keeper, 2);
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
    let keeper = Address::generate(&s.e);
    // nobody has won yet
    assert_eq!(
        s.kotizi.try_claim_prize(&id, &0),
        Err(Ok(Error::NotWinner.into()))
    );
    assert_eq!(
        s.kotizi.try_claim_prize(&id, &9),
        Err(Ok(Error::CotaNotFound.into()))
    );
    s.pay_all(id, 3);
    let w = s.draw(id, &keeper, 1);
    let loser = (w + 1) % 3;
    assert_eq!(
        s.kotizi.try_claim_prize(&id, &loser),
        Err(Ok(Error::NotWinner.into()))
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
        Err(Ok(Error::AlreadyClaimed.into()))
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
    let keeper = Address::generate(&s.e);
    s.kotizi.pay_quota(&id, &0);
    assert_eq!(s.draw(id, &keeper, 1), 0);
    s.advance(1, 61);
    s.kotizi.pay_quota(&id, &0);
    let c = commitment(&s.e, &secret(&s.e, 2));
    assert_eq!(
        s.kotizi.try_request_draw(&id, &keeper, &c),
        Err(Ok(Error::NoEligibleMembers.into()))
    );
    // a new member joins, pays, and the draw moves again
    let late = s.member(QUOTA);
    assert_eq!(s.kotizi.join_group(&id, &late), 1);
    s.kotizi.pay_quota(&id, &1);
    assert_eq!(s.draw(id, &keeper, 2), 1);
}
