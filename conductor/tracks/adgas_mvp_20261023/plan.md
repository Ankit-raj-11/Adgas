# Implementation Plan: Adgas MVP

## Phase 0: Arc Mainnet Feasibility Gate & Valuation Verification
*Goal: Autonomously verify live Arc mainnet infrastructure, EIP-3009 compatibility, and gas economic valuation before starting any application development.*
- [x] Task: Automated non-destructive Arc mainnet probe script a9824b8
  - [x] Write script checking RPC latency, head block, and Arc mainnet Chain ID
  - [x] Query and inspect official Arc mainnet USDC bytecode and `DOMAIN_SEPARATOR`
  - [x] Verify EIP-3009 function selectors (`transferWithAuthorization`, `receiveWithAuthorization`, `authorizationState`)
  - [x] Query relayer EOA native Arc gas balance and report headroom
- [x] Task: Arc gas valuation research & verification ddc69c4
  - [x] Verify how Arc native gas is economically valued against USDC (confirming whether 1:1 parity or an exchange rate applies)
  - [x] Keep unit conversion separate from economic valuation, documenting the exact formula mapping native gas receipt cost to 6-decimal USDC
- [x] Task: Guarded micro-transfer probe cb57341
  - [x] Implement interactive CLI prompt requiring explicit manual user confirmation of recipient and micro-amount (e.g., 0.01 USDC)
  - [x] Execute single probe transfer on Arc mainnet; record explorer receipt (strictly omitted from automated CI)
  - [x] Enforce stop-the-line criterion: halt and revise architecture immediately if any critical check fails
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 1: Workspace Scaffolding & Verified Conversion Utilities (TDD)
*Goal: Initialize workspace and build unit-tested conversion math separating unit scaling from economic valuation.*
- [x] Task: Initialize pnpm/Turborepo workspace 4fa5ab7
  - [x] Scaffold `apps/web`, `apps/relayer`, `contracts/`, and `packages/shared`
  - [x] Configure root `tsconfig.json`, `pnpm-workspace.yaml`, and build scripts
- [x] Task: TDD - Decimal conversion & economic valuation library (`packages/shared`) fd94f51
  - [x] Write failing unit tests testing $10^{12}$ unit conversion and economic valuation math independently
  - [x] Implement integer ceiling division for fractional gas costs and overflow protections
  - [x] Verify test suite passes with 100% boundary test coverage
- [x] Task: Shared contracts & schemas (`packages/shared`) c4b994e
  - [x] Export verified USDC contract ABI and EIP-3009 typed data structures
  - [x] Define shared TypeScript interfaces for campaigns, attestations, receipts, and EIP-712 schemas
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Verified Campaign Ingestion, Atomic Accounting & Crash Recovery (TDD)
*Goal: Build the cloud PostgreSQL persistence layer with verified on-chain deposit ingestion, robust crash recovery, and failure-safe settlement.*
- [x] Task: Drizzle ORM schema configuration (`apps/relayer`) 68a2d6f
  - [x] Define schemas for `campaigns`, `deposits`, `attestations`, and `transactions`
  - [x] Configure database connection string handling via `DATABASE_URL`
- [ ] Task: TDD - On-chain sponsor deposit verification
  - [ ] Write failing tests for deposit verification logic (verifying on-chain transaction receipt before crediting spendable campaign balance)
  - [ ] Implement deposit ingestion service preventing phantom database-only balances
- [ ] Task: TDD - Atomic reservation & receipt-based settlement engine
  - [ ] Write failing tests for pre-broadcast budget reservation, overdraft prevention, and settlement math
  - [ ] Reserve sufficient budget before broadcasting based on worst-case gas allowance
  - [ ] Implement confirmation settlement: reconcile reserved budget against confirmed receipt gas cost, release unspent reserve, and prevent duplicate settlement
- [ ] Task: TDD - Pre-broadcast persistence, crash recovery & edge-case settlement
  - [ ] Write failing tests for pre-broadcast persistence, uncertain broadcast recovery, on-chain reverted tx gas accounting, dropped/replaced transactions, and RPC timeouts
  - [ ] Implement pre-broadcast persistence of a unique transaction attempt before transmitting
  - [ ] Implement startup reconciliation scanning pending transactions against Arc mainnet to resolve uncertain broadcast outcomes
  - [ ] Account for reverted transactions that still consume on-chain gas, settling actual gas burned up to the capped limit
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Core Vertical Slice - Relayer Execution & End-to-End Flow (TDD)
*Goal: Prioritize and verify the single critical flow (wallet EIP-3009 authorization -> backend validation -> relayer submission -> confirmed Arc mainnet USDC transfer -> accurate accounting) before building dashboard polish.*
- [ ] Task: Fastify relayer service scaffolding (`apps/relayer`)
  - [ ] Initialize Fastify server with health checks, error handlers, and Viem Arc client
  - [ ] Configure primary and fallback RPC endpoints with automatic failover
- [ ] Task: TDD - Attestation issuance endpoint
  - [ ] Write failing tests for session verification, rate limits, and 5-minute TTL EIP-712 signatures
  - [ ] Implement `POST /api/attestation/issue` signing typed data with relayer key
- [ ] Task: TDD - Transaction relaying endpoint
  - [ ] Write failing tests for authorization validation, contract state checks, simulation, persistence, raw broadcast, and receipt polling
  - [ ] Implement `POST /api/relay/transfer` executing pre-broadcast persistence, broadcast, receipt derivation, and settlement
- [ ] Task: Vertical slice mainnet verification
  - [ ] Execute the complete critical path: wallet EIP-3009 authorization $\rightarrow$ backend validation $\rightarrow$ relayer submission $\rightarrow$ confirmed Arc mainnet USDC transfer $\rightarrow$ accurate accounting
  - [ ] Verify transaction hash on Arc block explorer and confirm zero ledger double-counting
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Consumer Payment Demo & Sponsored Video Ad UX
*Goal: Build the responsive user-facing payment interface and video ad experience.*
- [ ] Task: Next.js frontend scaffolding (`apps/web`)
  - [ ] Setup Next.js 15 App Router with Tailwind CSS following the Deep Navy fintech visual guidelines
  - [ ] Configure Wagmi / Viem provider with Arc mainnet parameters
- [ ] Task: Sponsored video ad player component
  - [ ] Build video player with deterministic progress tracking, view completion hooks, and replay guards
- [ ] Task: Payment transfer flow & client signing
  - [ ] Implement transfer input card with prominent "$0 Gas Sponsored" badge
  - [ ] Build explicit payment review card with fee coverage disclosure
  - [ ] Implement client-side EIP-3009 typed data signing (`transferWithAuthorization`)
- [ ] Task: Relaying status & cryptographic receipt card
  - [ ] Display real-time relaying progress (simulating $\rightarrow$ broadcasting $\rightarrow$ confirmed)
  - [ ] Render receipt card with Arc mainnet explorer link, actual gas cost, and attestation nonce
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Advertiser Controls & System Finalization
*Goal: Build advertiser campaign controls and run full integration verification after the core vertical slice is proven.*
- [ ] Task: Advertiser campaign management views (`apps/web`)
  - [ ] Build campaign overview card showing balance, spend, and sponsored transfer counts
  - [ ] Implement campaign creation flow with verified deposit tracking and pause/resume toggle
- [ ] Task: Full system end-to-end regression validation
  - [ ] Run full regression suite across user payment and advertiser management flows
  - [ ] Verify all documentation, style guide conformance, and test coverage targets (>80%)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
