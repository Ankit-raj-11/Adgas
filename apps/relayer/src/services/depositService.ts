/**
 * On-Chain Sponsor Deposit Verification Service
 * 
 * Guarantees that campaign balances are ONLY credited upon verification
 * of an on-chain transfer receipt on Arc mainnet. Prevents phantom balances
 * and duplicate credit replay attacks.
 */

import { ARC_USDC_ADDRESS, ADGAS_VAULT_ADDRESS } from '@adgas/shared';

const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface VerifyDepositParams {
  campaignId: string;
  txHash: string;
  expectedSponsorAddress: string;
  escrowAddress: string;
}

export interface DepositVerifierDependencies {
  rpc: {
    getTransactionReceipt: (params: { hash: `0x${string}` }) => Promise<any>;
  };
  db: {
    isTxHashProcessed: (txHash: string) => Promise<boolean>;
    recordDepositAndCreditCampaign: (params: {
      campaignId: string;
      txHash: string;
      sponsorAddress: string;
      amountUsdc: bigint;
      blockNumber: bigint;
    }) => Promise<any>;
  };
}

export async function verifyAndCreditDeposit(
  params: VerifyDepositParams,
  deps: DepositVerifierDependencies
) {
  const { campaignId, txHash, expectedSponsorAddress, escrowAddress } = params;

  // 1. Idempotency Check (prevent duplicate crediting)
  const alreadyProcessed = await deps.db.isTxHashProcessed(txHash);
  if (alreadyProcessed) {
    throw new Error('DUPLICATE_DEPOSIT: This transaction hash has already been credited');
  }

  // 2. Query On-Chain Receipt
  const receipt = await deps.rpc.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (!receipt) {
    throw new Error('TRANSACTION_NOT_FOUND: Receipt not found on Arc mainnet');
  }

  if (receipt.status === 'reverted' || receipt.status === '0x0' || receipt.status === 0) {
    throw new Error('TRANSACTION_REVERTED: Deposit transaction reverted on-chain');
  }

  const expectedSenderTopic = '0x' + expectedSponsorAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const expectedEscrowTopic = '0x' + escrowAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const expectedVaultTopic = ADGAS_VAULT_ADDRESS && ADGAS_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000'
    ? '0x' + ADGAS_VAULT_ADDRESS.toLowerCase().replace('0x', '').padStart(64, '0')
    : null;

  const transferLog = receipt.logs.find((log: any) => {
    const isUsdc = log.address.toLowerCase() === ARC_USDC_ADDRESS.toLowerCase();
    const isTransfer = log.topics?.[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase();
    return isUsdc && isTransfer;
  });

  if (!transferLog) {
    throw new Error('NO_USDC_TRANSFER_LOG: Transaction does not contain a valid USDC Transfer event');
  }

  const logSenderTopic = transferLog.topics[1]?.toLowerCase();
  const logRecipientTopic = transferLog.topics[2]?.toLowerCase();

  if (logSenderTopic !== expectedSenderTopic) {
    throw new Error('SPONSOR_MISMATCH: Transfer sender does not match registered campaign sponsor');
  }

  const matchesEscrow = logRecipientTopic === expectedEscrowTopic;
  const matchesVault = expectedVaultTopic ? logRecipientTopic === expectedVaultTopic : false;

  if (!matchesEscrow && !matchesVault) {
    throw new Error('ESCROW_MISMATCH: Transfer recipient is not the designated Adgas escrow or vault contract address');
  }

  const amountUsdc = BigInt(transferLog.data);
  if (amountUsdc <= 0n) {
    throw new Error('ZERO_AMOUNT: Deposit amount must be greater than zero');
  }

  const blockNumber = BigInt(receipt.blockNumber);

  // 4. Atomic Database Crediting
  const record = await deps.db.recordDepositAndCreditCampaign({
    campaignId,
    txHash,
    sponsorAddress: expectedSponsorAddress,
    amountUsdc,
    blockNumber,
  });

  return {
    status: 'CONFIRMED',
    depositId: record.id,
    amountUsdc,
    blockNumber,
    txHash,
  };
}
