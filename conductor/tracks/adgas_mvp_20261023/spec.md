# Track Specification: Adgas MVP

## 1. Overview & Core Objective
Build an achievable, verified MVP for **Adgas**: an advertising-sponsored gas abstraction platform on Arc mainnet. Enable users with zero native Arc gas tokens to transfer USDC without paying gas fees by completing a verified sponsored video ad flow. 

The MVP strictly prioritizes one reliable, end-to-end verified Arc mainnet flow:
$$\text{Sponsor Funds Campaign} \rightarrow \text{User Completes Ad} \rightarrow \text{Backend Issues Attestation} \rightarrow \text{User Signs EIP-3009 Authorization} \rightarrow \text{Relayer Broadcasts} \rightarrow \text{Receipt Verified \& Campaign Debited}$$
All dashboard polish is secondary and will not block this critical path.

## 2. Phase 0: Safe Arc Mainnet Feasibility Gate
The feasibility gate verifies live infrastructure without risk of accidental fund loss:
* **Automated Non-Destructive Probes:**
  * **RPC Connectivity:** Measure latency, check head block, and validate Arc Mainnet Chain ID.
  * **EIP-3009 Contract Verification:** From authoritative sources, verify the official Arc mainnet USDC address, extract deployed bytecode, check the `DOMAIN_SEPARATOR`, and verify supported authorization signatures (`transferWithAuthorization`, `receiveWithAuthorization`, `authorizationState`). *Do not rely solely on function selector presence.*
  * **Relayer Balance Probe:** Query the relayer EOA native Arc gas balance and report remaining headroom.
* **Guarded Live Transfer Probe:**
  * Any real on-chain USDC transfer probe **requires explicit manual user confirmation** detailing the exact recipient address and micro-amount (e.g., 0.01 USDC).
  * **Strict Constraint:** Real token transfers will **never** execute automatically during setup, CI, or automated script runs.
* **Stop-the-Line Criterion:** If RPC connectivity, chain ID, or USDC authorization methods fail inspection, halt execution immediately to address architecture before developing application layers.

## 3. Relayer Execution Architecture & Authorization Validation
* **User Authorization (EIP-3009):** User signs typed data (`transferWithAuthorization`) specifying `from`, `to`, `value`, `validAfter`, `validBefore`, and a unique client `nonce`.
* **Attestation Verification:** Server verifies the single-use attestation signature, 5-minute TTL, and binding to the exact transfer parameters before queuing.
* **Relayer Submission Pipeline:**
  1. **Pre-flight Validation:** Check that current block timestamp falls strictly between `validAfter` and `validBefore`.
  2. **Contract State Check:** Call `authorizationState(from, nonce)` on the USDC contract to ensure the nonce is unconsumed.
  3. **Atomic Reservation:** Reserve estimated gas from the campaign budget in PostgreSQL using `SELECT FOR UPDATE`.
  4. **Simulation:** Run Viem `simulateContract` as an initial sanity check (noting that simulation alone does not guarantee mineability).
  5. **Persistence Before Broadcast:** Record an in-flight transaction record with status `broadcasting` and target nonce prior to network transmission.
  6. **Broadcast & Hash Tracking:** Relayer submits raw signed transaction and immediately writes the returned transaction hash.

## 4. Gas Cost Derivation, Valuation & Conservative Rounding
* **Native Receipt Derivation:** Actual execution cost in native 18-decimal Arc gas is derived strictly from confirmed transaction receipts:
  $$\text{Native Gas Cost (18-dec)} = \text{receipt.gasUsed} \times \text{receipt.effectiveGasPrice}$$
* **Economic Valuation & Unit Conversion:**
  * On Arc, native gas fee is denominated in 18-decimal units. 
  * The actual economic conversion between native Arc gas cost and ERC-20 USDC (6 decimals) must be verified against Arc's documented valuation model (whether native gas is fixed at $1:1$ parity with USDC or governed by an exchange rate).
  * Unit scaling from 18-decimal to 6-decimal units applies a base factor of $10^{12}$ adjusted by any verified exchange rate factor.
* **Integer Ceiling Rounding:** Fractional gas costs are strictly rounded up using integer ceiling math:
  $$\text{USDC Debit} = \left\lceil \frac{\text{Native Gas Cost}}{\text{Conversion Divisor}} \right\rceil$$
  This guarantees that the sponsor's campaign absorbs all fractional micro-costs, protecting the relayer from fractional economic erosion.

## 5. Campaign Funding, Accounting & Relayer Settlement Model
* **Deposit Ingestion:** Advertisers deposit funds to create/fund campaigns. For the MVP, campaign deposits are recorded in the system database via verified sponsor transactions.
* **Atomic Reserve & Settle Flow:**
  * **Reservation:** An estimated worst-case gas cost ($\text{gasLimit} \times \text{maxFeePerGas}$, converted to 6-decimal USDC) is atomically moved from `available_balance` to `reserved_balance`.
  * **Settlement:** Upon receipt confirmation, the calculated actual cost is moved to `settled_spend`, and unspent reserved funds are returned to `available_balance`.
* **Honest Reimbursement Boundaries:**
  * Internal database ledger debits **do not constitute on-chain value transfers**.
  * For the MVP, the relayer is pre-funded with an operational native gas reserve. Campaign balance accounting is tracked transparently in the database.
  * Automatic on-chain reimbursement from sponsor escrow will only be enabled if an audited, tested on-chain settlement contract is deployed. Otherwise, settlement is documented as an operational batch reconciliation backed by database audit logs.

## 6. Failure-Safe Accounting, Crash Recovery & Idempotency
* **Crash After Broadcast (Pending Hash Recovery):** If the relayer server crashes after broadcasting but before saving the receipt, the startup recovery process checks pending nonces on Arc mainnet, matches transactions by authorizer/nonce, and updates database records.
* **Reverted Transactions:** If an on-chain transaction reverts due to an unexpected contract condition, **gas is still consumed**. The system settles the actual consumed gas from the campaign's reserved balance (up to the capped limit) and marks the transfer status as `failed_onchain`, preventing unrecovered relayer gas loss.
* **Duplicate Submissions:** Relayer enforces unique database constraints on `(authorizer_address, authorization_nonce)` and attestation UUIDs. Duplicate incoming requests return the existing transaction record rather than rebroadcasting.
* **RPC Timeouts & Retries:** Receipt polling uses exponential backoff. If a transaction remains unconfirmed after a configurable threshold, the relayer checks for replacement/speed-up conditions before marking it dropped.

## 7. MVP Scope & Acceptance Criteria
* **In Scope for MVP:**
  1. Safe automated Phase 0 feasibility check script.
  2. One verified end-to-end payment: sponsor campaign funded $\rightarrow$ user watches video ad $\rightarrow$ backend issues attestation $\rightarrow$ user signs EIP-3009 authorization $\rightarrow$ relayer submits on Arc mainnet $\rightarrow$ transaction confirmed on block explorer $\rightarrow$ campaign accounting settled.
  3. Advertiser campaign creation, funding tracking, and pause/resume toggle.
  4. Unit and failure tests for decimal ceiling rounding, duplicate rejection, and crash recovery.
* **Out of Scope for MVP:**
  * Real-time programmatic ad bidding (RTB).
  * Multi-token or DEX swaps.
  * Complex animated dashboards (kept clean and functional).
