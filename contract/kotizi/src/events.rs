use soroban_sdk::{contractevent, Address, String};

#[contractevent]
pub struct KycApproved {
    #[topic]
    pub wallet: Address,
}

#[contractevent]
pub struct GroupCreated {
    #[topic]
    pub group_id: u32,
    pub name: String,
    pub quota: i128,
    pub max_members: u32,
    pub period: u64,
    pub admin_fee_bps: u32,
}

#[contractevent]
pub struct MemberJoined {
    #[topic]
    pub group_id: u32,
    #[topic]
    pub member: Address,
    pub index: u32,
    pub members_joined: u32,
}

#[contractevent]
pub struct QuotaPaid {
    #[topic]
    pub group_id: u32,
    #[topic]
    pub payer: Address,
    pub index: u32,
    pub round: u32,
    pub amount: i128,
}
