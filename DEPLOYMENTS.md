# Testnet deployments

Stellar testnet only. Public addresses only; secret seeds live in `keypairs/` (gitignored).
Redeploying the contract changes the Kotizi ID: update `CONTRACT_ID` in `backend/.env` and this file.

## Contracts

| Contract | ID |
|---|---|
| test-usdc (6 decimals) | `CADKFUPE2RCG4RUD5C4JHIE5DBZ27AT7KFAIZSLMTJO4NNHWTITLIGHK` |
| kotizi | `CC4VXKV4PXLGJDKFXPRHSO527JSWWRPBWRYTO3UBIXXVGVF67MD5ZXUB` |

Constructors: test-usdc `(admin = deployer, decimals = 6)`; kotizi `(admin = deployer, kyc_authority = kyc, token = test-usdc)`.

## Accounts

| Role | Address | Key file |
|---|---|---|
| sponsor (tx source, fees, account activation) | `GCUX6WIX4TGI3ABH4EHL72EZ34KYRH6KESR7KG6QGEIZKJ5ZQTQ7MLLW` | `keypairs/sponsor.key` |
| deployer (admin of both contracts; also the faucet minter) | `GBG2Y3PQC4HI4WGFJPRIOLN7DF7PVEFXKTCQV3SZ7CB4E3JZGUDGCIRP` | `keypairs/deployer.key` |
| keeper (request_draw / settle_draw) | `GAQKPNEK7CBUK2V5S2QCUF7HLGXTEOHQ7XKQNTM3Z5SRWRSWGXD5N5MV` | `keypairs/keeper.key` |
| kyc (kyc_authority) | `GCZDM42GVKWTNDMO3QG6W7H4PQEUYG2XQI7KL7UVBJ4K6X7BM747I4GS` | `keypairs/kyc.key` |
| mint (unused: test-usdc `mint` is admin-only, so the faucet uses deployer) | `GDKKKBUQBWFFJ3FWDYXE7ZCVLDJ6UQACQS7KO6FAIMDS5K7HTZB7BJDM` | `keypairs/mint.key` |

## Demo groups

| id | name | cotas | quota | period |
|---|---|---|---|---|
| 0 | Casa Demo | 3 | 10 USDC | 60 s |
| 1 | Duo | 2 | 10 USDC | 30 s (journey run to completion of round 0) |

## Journey

`backend/scripts/journey.ts` runs onboarding, gasless join and pay, draw and claim against a local API
started with `AUTH_MODE=dev`, `KYC_MODE=auto`, `FAUCET_ENABLED=true` and `MINT_KEYFILE=../keypairs/deployer.key`.
