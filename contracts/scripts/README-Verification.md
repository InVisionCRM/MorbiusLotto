# Contract verification (PulseScan & Sourcify)

## Why PulseScan verification fails for Instant Lottery and Keno

**PulseScan** is built on **Blockscout**. Blockscout [cannot verify contracts compiled with the Solidity `via_ir` option](https://github.com/blockscout/blockscout-rs/issues/631). This repo uses **`viaIR: true`** in `hardhat.config.cjs` (required for other contracts like BlackjackV2 that hit “stack too deep” without it). So:

- **Instant Lottery** and **Keno** are deployed with the same config → bytecode is built with `via_ir`.
- PulseScan recompiles source **without** `via_ir` → bytecode does not match → verification fails (often reported as “bytecode mismatch” or “Fail - Unable to generate Contract ByteCode”).

So the failure is a **Blockscout/PulseScan limitation**, not wrong constructor args or wrong source.

## What you can do

### 1. Verify on Sourcify (recommended)

The verify scripts try **Sourcify** after PulseScan fails. Sourcify uses the same build artifacts (including compiler settings), so verification there can succeed.

- Run the same verify commands; when PulseScan fails, the script will attempt Sourcify.
- If Sourcify succeeds, the contract is verified at **https://repo.sourcify.dev** (chain 369 – PulseChain). Many tools and UIs can use Sourcify as the source of truth.

### 2. Wait for PulseScan to support `via_ir`

Once Blockscout/PulseScan adds support for the `via_ir` compiler option, the same Hardhat verify commands (or the manual command printed by the script) should work on PulseScan without any change to this repo.

### 3. Manual / flattened verification

If you need PulseScan specifically and they add `via_ir` later, you can use the manual command printed by the verify script when it fails. The constructor arguments are read from the deployed contract, so the printed command is correct for the current deployment.

---

**Verify commands (from `contracts/`):**

```bash
# Instant Lottery
npx hardhat run scripts/lottery/verify/verify-instant-lottery.js --network pulsechain

# Keno (CryptoKeno)
npx hardhat run scripts/keno/verify/verify-keno.js --network pulsechain
```

Optional env overrides: `INSTANT_LOTTERY_INSTANT_ADDRESS`, `KENO_ADDRESS`.
