# Testnet deployments

Stellar testnet only. Public addresses only; secret seeds live in `keypairs/` (gitignored).
Redeploying the contract changes the Kotizi ID: update `CONTRACT_ID` in `backend/.env` and this file.

## Contracts

| Contract | ID |
|---|---|
| kotizi (**current**: drand randomness, typed errors, several tokens; branch `feat/multi-token`) | `CDLG5PWRFTSLQNCWGFEBU4AEHKPMQCI5O4KXB3RGINP4Q2AY5BTQVFCR` |
| test token, 6 decimals (demo faucet token) | `CADKFUPE2RCG4RUD5C4JHIE5DBZ27AT7KFAIZSLMTJO4NNHWTITLIGHK` |
| test token, 7 decimals (stands in for USDC / USDT0 precision) | `CAT65NQ3OYCX6EOAZRNU5JM6IMXQ5I6KJMNJRDIOF5WQKOYVNJ43MD5G` |
| Circle testnet USDC (SAC of `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, 7 decimals; needs a trustline) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| earlier kotizi deployments (obsolete) | `CAJMDP3KW22MHPDYM22JOUNDKXO34RG6PLI4325JY6QFQP37JGZJWJZ7`, `CA3LSTPIZWLX3DXRZMZMQPS63OWJ3FR3ZUW4VVH3J5ZR4YWKEAUBIZJV`, `CC4VXKV4PXLGJDKFXPRHSO527JSWWRPBWRYTO3UBIXXVGVF67MD5ZXUB` |

Constructor: kotizi `(admin = deployer, kyc_authority = kyc)`; tokens are enabled afterwards with `add_token` (all three above are).
Test tokens: `(admin = deployer, decimals)`.

**Cost:** each `kotizi` deploy burned ~51 XLM (wasm upload and rent). The deployer key ran out, so the last deploy was paid by
the sponsor key (the payer is independent of the contract admin). Budget ~50 XLM per redeploy.

## Accounts

| Role | Address | Key file |
|---|---|---|
| sponsor (tx source, fees, account activation) | `GCUX6WIX4TGI3ABH4EHL72EZ34KYRH6KESR7KG6QGEIZKJ5ZQTQ7MLLW` | `keypairs/sponsor.key` |
| deployer (admin of both contracts; also the faucet minter) | `GBG2Y3PQC4HI4WGFJPRIOLN7DF7PVEFXKTCQV3SZ7CB4E3JZGUDGCIRP` | `keypairs/deployer.key` |
| keeper (request_draw / settle_draw) | `GAQKPNEK7CBUK2V5S2QCUF7HLGXTEOHQ7XKQNTM3Z5SRWRSWGXD5N5MV` | `keypairs/keeper.key` |
| kyc (kyc_authority) | `GCZDM42GVKWTNDMO3QG6W7H4PQEUYG2XQI7KL7UVBJ4K6X7BM747I4GS` | `keypairs/kyc.key` |
| mint (unused: test-usdc `mint` is admin-only, so the faucet uses deployer) | `GDKKKBUQBWFFJ3FWDYXE7ZCVLDJ6UQACQS7KO6FAIMDS5K7HTZB7BJDM` | `keypairs/mint.key` |

## Demo groups (current contract)

| id | name | token | cotas | quota | period |
|---|---|---|---|---|---|
| 0 | Duo6 | test token, 6 decimals | 2 | 10 | 30 s (journey run: drand draw settled, prize claimed) |
| 1 | Duo7 | test token, 7 decimals | 2 | 10 | 30 s (journey run: drand draw settled, prize claimed) |

Create more with the CLI as the deployer, e.g. `stellar contract invoke --id <kotizi> --network testnet -- create_group --name '"X"'
--uri '"u"' --token <token> --quota <base units> --max_members 2 --period 30 --admin_fee_bps 200`.

## Journey

`backend/scripts/journey.ts` runs onboarding, gasless join and pay, draw and claim against a local API
started with `AUTH_MODE=dev`, `KYC_MODE=auto`, `FAUCET_ENABLED=true` and `MINT_KEYFILE=../keypairs/deployer.key` and `FAUCET_TOKEN=<the test token of the group>` (one per run).
