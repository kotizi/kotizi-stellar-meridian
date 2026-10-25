use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidTokenDecimals = 1,
    AlreadyApproved = 2,
    NotKyc = 3,
    GroupNotFound = 4,
    InvalidQuota = 5,
    InvalidMaxMembers = 6,
    InvalidPeriod = 7,
    FeeTooHigh = 8,
    NameTooLong = 9,
    UriTooLong = 10,
    GroupFull = 11,
    GroupNotOpen = 12,
    CotaNotFound = 13,
    AlreadyPaid = 14,
    UnsupportedToken = 15,
    TooManyGroups = 16,
    MathOverflow = 17,
}
