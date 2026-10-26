/**
 * Transaction Pre-Broadcast Persistence & Crash Recovery Manager
 * 
 * Ensures every transaction attempt is persisted BEFORE network transmission.
 * On server restart or recovery loops, reconciles uncertain broadcast outcomes,
 * recovers confirmed receipts, settles gas for reverted transactions, and
 * releases reservations for dropped transactions.
 */

import { randomUUID } from 'node:crypto';

export type TransactionStatus =
  | 'pending_broadcast'
  | 'broadcasting'
  | 'submitted'
  | 'confirmed'
  | 'failed_onchain'
  | 'dropped';

export interface TransactionRecord {
  id: string;
  attestationNonce: string;
  campaignId: string;
  userAddress: string;
  recipientAddress: string;
  amountUsdc: bigint;
  relayerAddress: string;
  relayerNonce: number;
  status: TransactionStatus;
  txHash?: string;
  gasUsedNativeWei?: bigint;
  gasPriceNativeWei?: bigint;
  actualCostUsdc?: bigint;
  reservedCostUsdc: bigint;
  blockNumber?: bigint;
  failureReason?: string;
}

export interface RecoveryManagerDependencies {
  rpc: {
    getTransactionReceipt: (params: { hash: `0x${string}` }) => Promise<any>;
    getTransactionCount: (params: { address: `0x${string}` }) => Promise<bigint>;
  };
  db: {
    persistAttempt: (record: TransactionRecord) => Promise<TransactionRecord>;
    updateAttempt: (id: string, updates: Partial<TransactionRecord>) => Promise<void>;
    getPendingAttempts: () => Promise<TransactionRecord[]>;
  };
  accounting: {
    settleGas: (params: {
      campaignId: string;
      reservationId: string;
      reservedCostUsdc: bigint;
      gasUsed: bigint;
      effectiveGasPrice: bigint;
    }) => Promise<any>;
    releaseReservation: (params: {
      campaignId: string;
      reservationId: string;
      reservedCostUsdc: bigint;
    }) => Promise<void>;
  };
}

export class TransactionRecoveryManager {
  constructor(private deps: RecoveryManagerDependencies) {}

  /**
   * Persists attempt before dispatching to the network
   */
  async createPreBroadcastAttempt(params: Omit<TransactionRecord, 'id' | 'status'>): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      ...params,
      id: `tx_${randomUUID()}`,
      status: 'pending_broadcast',
    };

    return await this.deps.db.persistAttempt(record);
  }

  /**
   * Updates transaction attempt with returned broadcast hash
   */
  async recordBroadcast(id: string, txHash: string): Promise<void> {
    await this.deps.db.updateAttempt(id, {
      status: 'submitted',
      txHash,
    });
  }

  /**
   * Scans and resolves pending or crashed transactions
   */
  async reconcilePendingTransactions() {
    const pendingTxs = await this.deps.db.getPendingAttempts();

    let confirmedCount = 0;
    let failedOnChainCount = 0;
    let droppedCount = 0;
    let pendingCount = 0;

    for (const tx of pendingTxs) {
      if (tx.txHash) {
        // Query receipt
        const receipt = await this.deps.rpc.getTransactionReceipt({ hash: tx.txHash as `0x${string}` });

        if (receipt) {
          const gasUsed = BigInt(receipt.gasUsed);
          const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
          const blockNumber = BigInt(receipt.blockNumber);

          if (receipt.status === 'success' || receipt.status === '0x1' || receipt.status === 1) {
            // Settled successfully
            const settlement = await this.deps.accounting.settleGas({
              campaignId: tx.campaignId,
              reservationId: tx.attestationNonce,
              reservedCostUsdc: tx.reservedCostUsdc,
              gasUsed,
              effectiveGasPrice,
            });

            await this.deps.db.updateAttempt(tx.id, {
              status: 'confirmed',
              blockNumber,
              gasUsedNativeWei: settlement.nativeGasCostWei,
              actualCostUsdc: settlement.actualCostUsdc,
            });

            confirmedCount++;
          } else {
            // Reverted on-chain: Still burns gas! Settle actual gas burned to protect relayer
            const settlement = await this.deps.accounting.settleGas({
              campaignId: tx.campaignId,
              reservationId: tx.attestationNonce,
              reservedCostUsdc: tx.reservedCostUsdc,
              gasUsed,
              effectiveGasPrice,
            });

            await this.deps.db.updateAttempt(tx.id, {
              status: 'failed_onchain',
              blockNumber,
              failureReason: 'Transaction reverted on-chain during execution',
              gasUsedNativeWei: settlement.nativeGasCostWei,
              actualCostUsdc: settlement.actualCostUsdc,
            });

            failedOnChainCount++;
          }
        } else {
          // Still in mempool / pending confirmation
          pendingCount++;
        }
      } else {
        // No hash recorded: crashed before broadcast or during submission
        const currentNonce = await this.deps.rpc.getTransactionCount({
          address: tx.relayerAddress as `0x${string}`,
        });

        if (currentNonce > BigInt(tx.relayerNonce)) {
          // The relayer's on-chain nonce has already passed this transaction's nonce!
          // This means this transaction was never mined or was replaced/dropped.
          await this.deps.accounting.releaseReservation({
            campaignId: tx.campaignId,
            reservationId: tx.attestationNonce,
            reservedCostUsdc: tx.reservedCostUsdc,
          });

          await this.deps.db.updateAttempt(tx.id, {
            status: 'dropped',
            failureReason: 'Transaction dropped before broadcast; nonce superseded on-chain',
          });

          droppedCount++;
        } else {
          pendingCount++;
        }
      }
    }

    return {
      confirmedCount,
      failedOnChainCount,
      droppedCount,
      pendingCount,
    };
  }
}
