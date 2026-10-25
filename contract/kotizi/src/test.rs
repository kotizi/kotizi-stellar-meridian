extern crate std;

use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Ledger, MockAuth, MockAuthInvoke,
    },
    Address, Env, IntoVal, String,
};
use stellar_tokens::non_fungible::NonFungibleTokenClient;
use test_usdc::{TestUsdc, TestUsdcClient};

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
