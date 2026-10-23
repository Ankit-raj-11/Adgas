# Product Definition: Adgas

## 1. Executive Summary
**Adgas** is an advertising-sponsored gas abstraction platform built for Arc mainnet. It enables advertisers to sponsor transaction gas fees for users' USDC transfers. In exchange for completing a sponsored video ad flow, users receive a short-lived, single-use, server-signed attestation enabling them to execute a USDC transfer without holding or spending native Arc gas tokens. The advertiser's funded campaign pool covers the relayer's gas costs. Adgas delivers a rock-solid, verifiable end-to-end payment flow, transparent campaign accounting, and a developer-ready architecture.

## 2. Problem Statement & Value Proposition
* **Web3 Friction:** Requiring end users to acquire, bridge, and hold native gas tokens solely to transfer stablecoins (USDC) introduces severe onboarding friction and drop-off.
* **Advertiser ROI:** Traditional Web3 advertising suffers from low engagement and unverified attention. Adgas aligns incentives: advertisers fund real utility (gas subsidies) in exchange for verified ad completions.

## 3. Target Audience
* **Web3 Developers & Builders:** Teams needing gasless, drop-in USDC payment flows with clear APIs and battle-tested relayer mechanics.
* **Advertisers & Sponsors:** Protocols, brands, and ecosystems seeking high-intent user attention with guaranteed campaign caps and transparent spend accounting.
* **End Consumers (Demo Interface):** Users seeking zero-gas USDC transfers on Arc via an intuitive sponsored video ad experience.

## 4. Technical Architecture & Mechanics

### 4.1 Smart Contract & Relayer Architecture
* **Transfer Authorization:** Uses **EIP-3009** (`transferWithAuthorization` / `receiveWithAuthorization`) for off-chain user transfer approvals. Because EIP-3009 authorizes token movement without automatically reimbursing the gas submitter, the system incorporates a dedicated gas-accounting contract/relayer settlement model:
  * The relayer pays Arc native gas upfront to submit the user's authorized transaction.
  * The campaign contract settles or reimburses the relayer from the sponsor’s pre-funded campaign balance upon verified submission.
* **Strict Attack Surface Defense:** The relayer and sponsorship contracts are strictly locked to standard USDC transfers. **Zero arbitrary contract calls** or generic delegatecalls are permitted.
* **Replay Protection & Spending Limits:** User transfer nonces and server attestation identifiers are tracked on-chain/in-relayer to prevent double-spending or replay attacks. Strict per-transfer and per-user gas sponsorship caps are enforced.

### 4.2 Ad Verification & Anti-Fraud Boundaries
* **Server-Issued Attestations:** Upon verified ad completion, the backend issues a short-lived, cryptographically signed, single-use attestation bound strictly to:
  * Specific campaign ID
  * User session / client address
  * Recipient and transfer parameters
  * Strict expiration timestamp (e.g., 5-minute TTL)
* **Replay & Rate Limiting:** Each attestation contains a unique nonce marked as consumed upon submission. IP and session rate limits prevent automated abuse.
* **Honest Threat Modeling:** The product explicitly acknowledges that client-side playback tracking cannot definitively guarantee that a physical human viewed the screen. Verification enforces verified playback events and time thresholds, bounding economic risk via strict per-user rate limits and campaign caps.

### 4.3 Campaign Budgeting & Token Decimal Separation
* **Decimal Architecture:** 
  * **Arc Native Gas:** Accounted in **18 decimals** (native token denomination used for execution fees on Arc).
  * **USDC Token:** Accounted strictly in **6 decimals** (ERC-20 standard).
  * Accounting layers maintain strict mathematical separation to prevent precision loss and calculation errors.
* **Campaign Fund States:** Funded -> Active -> Paused / Depleted. Supports reserve-and-settle mechanics where gas cost is reserved during transfer processing and settled to actual gas consumed upon confirmation, preventing campaign balance overspending.
* **Lifecycle Rules:** Sponsors can pause campaigns or withdraw uncommitted balances.

## 5. Mainnet Feasibility Gate (Pre-Implementation Verification)
Before building full UI features, the implementation must pass an initial mainnet feasibility check:
1. Verify the Arc Studio workflow and supported deployment toolchains.
2. Verify the official Arc mainnet USDC contract address and confirm EIP-3009 support (`transferWithAuthorization`).
3. Verify Arc mainnet RPC endpoint connectivity, gas oracle behavior, and transaction propagation.
4. Execute and verify a real, basic USDC transfer on Arc mainnet before proceeding to peripheral features.
5. Clearly flag any unverified or missing infrastructure. No testnet substitutions will be made for mainnet validation.

## 6. MVP Sequential Critical Path
The initial implementation strictly prioritizes the single, end-to-end working flow:
1. **Sponsor Funds Campaign:** Sponsor deposits funds into a campaign with defined gas subsidy limits.
2. **User Completes Ad Flow:** User engages with the video ad interface; backend issues a signed, single-use attestation upon completion.
3. **User Signs Authorization:** User signs an EIP-3009 transfer authorization for their USDC payment.
4. **Relayer Submits Transfer:** Relayer validates the attestation and authorization, verifies campaign balance, and submits the transaction to Arc mainnet.
5. **On-Chain Settlement & Accounting:** Transaction confirms on Arc mainnet; relayer gas is settled from the campaign; sponsorship receipt and transaction hash are recorded.
6. *(Post-MVP)* Advanced analytics dashboards, programmatic bidding, and multi-asset support.

## 7. Scope Boundaries
* **In Scope (MVP):** Single working Arc mainnet USDC sponsored payment flow, server attestation signing and verification, relayer execution with budget checks, automated contract tests, and basic campaign funding/receipt views.
* **Out of Scope (MVP):** Arbitrary smart contract execution, multi-token swaps, real-time bidding exchanges, complex cosmetic dashboard animations.
