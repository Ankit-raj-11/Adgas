# Product Guidelines: Adgas

## 1. Brand Voice & Tone
* **Fintech Approachable & Intuitive:** Use warm, clear, and reassuring language that removes Web3 intimidation. Frame technical mechanisms simply: users are "sending USDC with sponsored gas," not "executing an off-chain meta-transaction via EIP-3009."
* **Clarity Over Jargon:** Avoid confusing crypto slang. Keep copy concise, helpful, and transparent.
* **Developer Precision:** When exposing developer hooks or API docs, maintain exact, unambiguous technical descriptions without sacrificing readability.

## 2. Visual Identity & Aesthetic

### 2.1 Color Palette & Semantics
* **Base Background:** Deep Navy (`#0B0F19` / `#0A1128`) providing depth, sophistication, and contrast.
* **Typography & Surfaces:** Crisp white (`#F9FAFB`) for primary headings, light slate (`#94A3B8`) for secondary copy, and slate-navy container surfaces with subtle borders (`#1E293B`).
* **Brand Accent:** Restrained Electric Blue (`#2563EB` / `#3B82F6`) used purposefully for primary actions, focus rings, and sponsored highlights.
* **Semantic States:**
  * **Success:** Accessible Emerald Green (`#10B981`) for confirmed transactions and completed steps.
  * **Pending / In-Progress:** Balanced Amber (`#F59E0B`) for video progress, relaying, and confirmations.
  * **Error / Rejection:** Clean Coral Red (`#EF4444`) for validation errors, timeouts, or depleted budgets.
* **Aesthetic Guardrails:** Avoid heavy neon glows, distracting gradients, visual clutter, and frosted glassmorphism. Maintain the calm, reliable look and feel of a premier global fintech platform.

### 2.2 Typography Hierarchy
* **Primary Font:** Clean, modern sans-serif (e.g., Inter or system font stack) for all headings, body text, buttons, and form labels.
* **Technical Monospace:** Monospace font (e.g., JetBrains Mono or Fira Code) reserved strictly for wallet addresses, contract addresses, transaction hashes, and attestation nonces.

## 3. UX & Payment Flow Principles

### 3.1 Zero-Surprise Transparency
* **Prominent "$0 Gas" Badge:** Clearly highlight the sponsored gas savings at the top of the payment card so users instantly understand the value proposition.
* **Explicit Review Before Signing:** Before prompting wallet authorization, present an explicit confirmation card displaying:
  * Recipient address
  * USDC transfer amount
  * Sponsor name & gas subsidy coverage
  * Notice that transfer is covered by the completed ad attestation

### 3.2 Deterministic Video Ad UX
* Unambiguous progress bar and countdown indicator showing remaining view time.
* Clear visual status when attestation is signed and generated.
* Instant feedback if playback is interrupted, with clear resumption instructions.

### 3.3 Responsive & Accessible Design
* Fully responsive layout optimized for mobile touch targets (min 44px) and clean desktop layouts.
* Strict WCAG AA contrast compliance across all text and interactive elements.

## 4. Trust, Accounting & Receipts

### 4.1 Cryptographic Sponsorship Receipt
Upon successful transaction submission and confirmation, display a comprehensive receipt card containing:
* **Status:** Confirmed on Arc Mainnet (with direct block explorer link).
* **Transfer Details:** Amount sent and recipient address.
* **Sponsorship Breakdown:**
  * Gas fee covered: `$0.00` to user.
  * Relayer gas consumed (Arc native denomination).
  * Campaign debited (with campaign ID and sponsor attribution).
  * Attestation nonce and signature verification timestamp.
