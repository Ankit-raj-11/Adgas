# Technology Stack: Adgas

## 1. Architecture & Repository Structure
* **Monorepo (pnpm / Turborepo):**
  * `apps/web`: Next.js 15 (App Router, React 19) user payment demo & advertiser dashboard.
  * `apps/relayer`: Node.js LTS + Fastify low-latency attestation engine and Arc mainnet transaction relayer.
  * `contracts/`: Foundry smart contract project (Solidity 0.8.24+), test suites, invariant tests, and deployment scripts.
  * `packages/shared`: Shared TypeScript types, contract ABIs, typed decimal conversion utilities, and EIP-712 domain schemas.

## 2. Core Languages & Runtime
* **TypeScript (v5.x):** Enforced strict typing across all packages; strict `noImplicitAny` and branded types for token/gas units.
* **Solidity (v0.8.24+):** EVM smart contracts managing campaign escrow, gas settlement, and authorization nonces.
* **Node.js (v20+ LTS):** Server runtime.

## 3. Unified USDC Balance Model & Dual Interface Decimals
* **Single Asset, Dual Interfaces:** On Arc, native USDC and ERC-20 USDC represent two interfaces over the **exact same underlying balance**, not distinct assets.
* **Decimal Disparity:**
  * **Arc Native Gas / Value:** Represented in **18 decimals** ($10^{18}$ raw units) used for transaction execution fees and gas accounting.
  * **ERC-20 USDC Token Interface:** Represented strictly in **6 decimals** ($10^6$ raw units) used for standard token transfers and approvals.
* **Conversion Factor ($10^{12}$) & Rounding Rules:**
  * Ratio between native and ERC-20 representations is exactly $10^{12}$ ($10^{18} / 10^6 = 10^{12}$).
  * Converting ERC-20 (6 decimals) to native units: multiply by $10^{12}$.
  * Converting native gas cost (18 decimals) to ERC-20 campaign ledger units: integer divide by $10^{12}$ using **conservative ceiling rounding** (rounding up fractional units to ensure the sponsor campaign fully covers all fractional gas costs without relayer loss).

## 4. Relayer Gas Funding, Campaign Accounting & Actual Reimbursement
* **Ledger Debit != On-Chain Transfer:** Internal database ledger accounting is explicitly separated from physical on-chain token movement. A database debit does not constitute on-chain value reimbursement.
* **Relayer Upfront Execution Funding:** The relayer EOA is pre-funded with Arc native gas (18-decimal native USDC) to execute user transactions upfront.
* **Reimbursement Architecture & Operational Boundaries:**
  * **Mechanism Verification Gate:** Prior to implementation, verify whether Arc mainnet supports direct on-chain contract-driven relayer reimbursement (e.g., via a campaign escrow contract settling actual receipt gas cost) or whether sponsor deposits are held in a verified vault settled periodically.
  * **Operational Model for MVP:** If single-transaction on-chain reimbursement introduces excessive contract overhead or relies on unverified primitives, relayer upfront gas funding and campaign settlement operate as separate processes:
    1. Relayer broadcasts using its native gas reserve.
    2. Database ledger atomically reserves and settles campaign balances based on confirmed transaction receipts.
    3. Periodic audited settlement / withdrawal batches reconcile relayer balances from sponsor escrow.
  * **Operational Limitation:** Relayer native gas balance is monitored via automated threshold alerts to ensure uninterrupted relaying.

## 5. Gas Cost Derivation & Accounting Lifecycle
* **Receipt-Based Cost Calculation:** Actual gas cost is derived strictly from confirmed Arc transaction receipts:
  $$\text{Actual Gas Cost (18-dec)} = \text{receipt.gasUsed} \times \text{receipt.effectiveGasPrice}$$
* **Atomic Reserve & Settle Flow:**
  1. **Pre-flight Reservation:** Prior to submission, estimated maximum gas allowance ($\text{gasLimit} \times \text{maxFeePerGas}$) converted conservatively to 6-decimal USDC is atomically reserved from the sponsor’s `available_balance`.
  2. **Relayer Broadcast:** Relayer executes the transaction.
  3. **Confirmation Settlement:** Upon receipt confirmation, the actual gas cost is calculated. The reserved excess is released back to `available_balance`, and only the actual cost is moved to `settled_spend`.
  4. **Guarantees:** Eliminates double-counting, prevents campaign overdrafts under concurrent requests, and produces transparent accounting receipts.

## 6. Frontend Application (`apps/web`)
* **Framework:** Next.js (App Router, React 19)
* **Styling & Components:** Tailwind CSS with Lucide Icons, following the premium Deep Navy fintech aesthetic.
* **Web3 Integration:** Wagmi + Viem for wallet connection, chain-ID verification, and client-side typed message signing.
* **Ad UX Component:** HTML5 video component with verified playback event tracking and progress listeners.

## 7. Backend Relayer Service (`apps/relayer`)
* **Framework:** Fastify for high-throughput, low-latency API routes.
* **EVM Client & RPC Resilience:** 
  * Viem client with configurable primary and fallback Arc mainnet RPC endpoints with automatic failover.
  * Strict chain-ID validation checks before transaction broadcast.
  * Mandatory pre-flight transaction simulation (`eth_call` / `simulateContract`) prior to broadcast.
  * Deterministic confirmation/finality tracking.
* **Key & Gas Management:**
  * Dedicated Relayer EOA initialized via `RELAYER_PRIVATE_KEY` environment variable.
  * Sequential local nonce management to eliminate nonce collisions.
  * Automated relayer native balance monitoring with low-gas alerts.
* **Security & Verification:**
  * Cryptographic attestation generation using private key signing (EIP-712).
  * Rate-limiting and session validation.

## 8. Persistence & Data Integrity Layer
* **Database:** Cloud PostgreSQL (Supabase / Neon connection string via `DATABASE_URL`).
* **ORM:** Drizzle ORM for type-safe migrations and queries.
* **Accounting & Idempotency Rules:**
  * **Attestation Nonces:** Unique, server-generated attestation UUID/nonces stored with expiration timestamps.
  * **Atomic Nonce Consumption:** Database-level transaction locks (`SELECT FOR UPDATE`) ensuring each attestation can be consumed exactly once.
  * **Transaction Idempotency:** Relayer submission deduplication based on transfer authorization hashes.

## 9. Smart Contracts & Toolchain (`contracts/`)
* **Framework:** Foundry (`forge`, `cast`) for compilation, comprehensive fuzz testing, and deterministic deployment scripts.
* **Conditional EIP-3009 Support:**
  * EIP-3009 (`transferWithAuthorization`) support is treated as **conditional**, subject to pre-implementation verification of the official Arc mainnet USDC contract bytecode and supported authorization methods.
  * **Separate Gas Settlement:** Because EIP-3009 does not reimburse relayer gas, the sponsor-funded gas reimbursement mechanism is implemented and tested as an independent accounting contract/relayer settlement model.
  * **Zero Arbitrary Execution:** No generic proxies or arbitrary call forwarders.

## 10. Deployment & Arc Studio Reality Check
* **Deployment Workflow:** Arc Studio's documented one-click deployment targets testnets. The implementation verifies the actual Arc mainnet deployment workflow, CLI toolchains, and grant/permission prerequisites before relying on any Studio tooling.
* **Target Network:** Arc Mainnet (with verified RPC, official USDC contract address, and explorer endpoints).

## 11. Testing & Reliability Suite
* **Edge-Case & Failure Testing:**
  * Failed transactions (gas consumed on-chain but transfer execution reverts).
  * Dropped and replaced transactions (nonce speed-up / replacement tracking).
  * RPC receipt timeouts, retries, and exponential backoff.
  * Concurrent duplicate submission attempts (database idempotency locks).
  * Rounding boundary tests ($10^{12}$ conversion precision, fractional gas cost ceiling rounding).
* **Contracts:** Forge unit tests, invariant tests, and fork simulations.
* **Backend & Relayer:** Vitest test suites verifying attestation validity, replay attack prevention, budget locking/settling, and decimal conversion math.
* **Code Standards:** ESLint, Prettier, and Solhint.
