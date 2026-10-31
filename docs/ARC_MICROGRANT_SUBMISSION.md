# Arc Microgrants Submission Guide: Adgas

## 1. Project Overview & Eligibility
- **Hackathon Track:** Escrow & Shared Treasuries / Software-to-Software Payments
- **Smart Contract:** `AdgasSponsorVault` (`contracts/src/AdgasSponsorVault.sol`)
- **Target Network:** Arc Mainnet (Chain ID `5042`)
- **Canonical USDC on Arc:** `0x3600000000000000000000000000000000000000`
- **Arc RPC:** `https://rpc.mainnet.arc.io`
- **Arc Explorer:** `https://explorer.arc.io`

---

## 2. Smart Contract Architecture (`AdgasSponsorVault.sol`)
The contract handles:
1. **Sponsor Escrow Pools:** Advertisers deposit real USDC into the vault escrow (`depositBudget` or gasless `depositBudgetWithAuthorization`).
2. **Atomic Gasless Transfer & Relayer Reimbursement:** Executes user payment via canonical Arc EIP-3009 (`transferWithAuthorization`) and reimburses relayer gas from the sponsor's pool in a single atomic transaction (`executeSponsoredTransfer`).
3. **Non-Custodial Sponsor Custody:** Advertisers can reclaim unspent USDC anytime via `withdrawRemaining`.
4. **Relayer Settlement:** Autonomous relayer gas claims via `reimburseRelayer`.

---

## 3. How to Deploy via Arc Studio (To get your Project URL)
Arc Microgrants strictly requires the project to be built with [Arc Studio](https://studio.arc.io):

1. **Open Arc Studio:**
   - Go to [https://studio.arc.io](https://studio.arc.io) and log in with your wallet or GitHub.
   - Click **New Project** and name it `Adgas - Attention-Powered Gasless USDC`.
   - **Copy your project URL:** e.g. `https://studio.arc.io/app/1a2b3c4d-e6f7g8h`. (Keep this for the submission form).

2. **Add the Contract in Arc Studio:**
   - Copy the Solidity code from [`contracts/src/AdgasSponsorVault.sol`](../contracts/src/AdgasSponsorVault.sol).
   - In Arc Studio's prompt or file editor, paste the contract.
   - Run tests in Arc Studio (or verify using Foundry test suite [`contracts/test/AdgasSponsorVault.t.sol`](../contracts/test/AdgasSponsorVault.t.sol)).

3. **Deploy to Arc Mainnet:**
   - In Arc Studio, select **Deploy to Arc Mainnet** (Chain ID `5042`).
   - Constructor argument `_usdc`: `0x3600000000000000000000000000000000000000`.
   - Confirm the deployment transaction.
   - Copy the deployed contract address (e.g., `0xYourContractAddress`).

4. **Alternative Direct Foundry Deployment (CLI):**
   ```bash
   cd contracts
   forge script script/DeployAdgasSponsorVault.s.sol:DeployAdgasSponsorVault \
     --rpc-url https://rpc.mainnet.arc.io \
     --broadcast \
     --private-key <YOUR_PRIVATE_KEY>
   ```

---

## 4. Setting the Deployed Address in the Web App & Relayer
Once deployed, set the contract address in your environment:
- In `.env` / Vercel environment variables:
  ```env
  NEXT_PUBLIC_ADGAS_VAULT_ADDRESS=0xYourContractAddress
  ADGAS_VAULT_ADDRESS=0xYourContractAddress
  ```
The Advertiser Dashboard will automatically display the verified Arc Mainnet contract with an explorer badge.

---

## 5. Generating the Required Arc Mainnet Transaction
Arc Microgrants requires **at least one transaction that moves real USDC through your contract and app**:
1. Connect wallet with a small amount of USDC on Arc Mainnet (even $0.05 or $1 USDC).
2. Go to the **Advertiser Portal (`/advertiser`)**.
3. Click **Record Deposit** -> Select **1-Click Wallet Deposit** -> Enter `0.1` or `1.0` USDC -> Click **Deposit on Arc**.
4. Confirm the transaction in MetaMask.
5. Copy the transaction hash from the dashboard confirmation or [explorer.arc.io](https://explorer.arc.io).
6. Save the transaction hash URL: `https://explorer.arc.io/tx/<txHash>`.

---

## 6. Submission Checklist (Ready to Submit)
- [ ] **Arc Studio Project URL:** `https://studio.arc.io/app/<your-id>`
- [ ] **Live App Link:** Public deployment link (e.g. Vercel)
- [ ] **Contract Address:** `0x...` on [explorer.arc.io](https://explorer.arc.io)
- [ ] **Example Mainnet TX Hash:** `https://explorer.arc.io/tx/0x...` (showing real USDC moved)
- [ ] **Public GitHub Repo:** Pushed from Arc Studio or Git repository
- [ ] **Video Walkthrough (2 min):** Demonstrating Arc Studio build, smart contract test, and the live deposit/transfer on Arc Mainnet
- [ ] **Builder Profile:** GitHub, X, or Farcaster link
