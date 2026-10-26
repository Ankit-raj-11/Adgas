import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TransactionRecoveryManager,
  type TransactionRecord,
} from '../src/services/recoveryManager.js';

describe('Transaction Pre-Broadcast Persistence & Crash Recovery Manager', () => {
  let recoveryManager: TransactionRecoveryManager;
  let mockRpc: any;
  let mockDb: any;
  let mockAccounting: any;
  let inFlightTxs: Map<string, TransactionRecord>;

  beforeEach(() => {
    inFlightTxs = new Map();

    mockRpc = {
      getTransactionReceipt: vi.fn(),
      getTransactionCount: vi.fn().mockResolvedValue(10n),
    };

    mockDb = {
      persistAttempt: vi.fn().mockImplementation(async (record: TransactionRecord) => {
        inFlightTxs.set(record.id, { ...record });
        return record;
      }),
      updateAttempt: vi.fn().mockImplementation(async (id: string, updates: Partial<TransactionRecord>) => {
        const existing = inFlightTxs.get(id);
        if (existing) {
          Object.assign(existing, updates);
        }
      }),
      getPendingAttempts: vi.fn().mockImplementation(async () => {
        return Array.from(inFlightTxs.values()).filter((tx) =>
          ['pending_broadcast', 'broadcasting', 'submitted'].includes(tx.status)
        );
      }),
    };

    mockAccounting = {
      settleGas: vi.fn().mockResolvedValue({ actualCostUsdc: 1500n, unspentRefundUsdc: 500n }),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
    };

    recoveryManager = new TransactionRecoveryManager({
      rpc: mockRpc,
      db: mockDb,
      accounting: mockAccounting,
    });
  });

  it('persists transaction attempt before broadcasting', async () => {
    const attempt = await recoveryManager.createPreBroadcastAttempt({
      attestationNonce: 'att-123',
      campaignId: 'camp-1',
      userAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amountUsdc: 50_000_000n,
      relayerAddress: '0x9999999999999999999999999999999999999999',
      relayerNonce: 5,
      reservedCostUsdc: 2000n,
    });

    expect(attempt.status).toBe('pending_broadcast');
    expect(mockDb.persistAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attestationNonce: 'att-123',
      status: 'pending_broadcast',
      reservedCostUsdc: 2000n,
    }));
  });

  it('reconciles submitted transaction that confirmed on-chain during crash', async () => {
    // Transaction was broadcast, hash saved, but server crashed before receipt processing
    inFlightTxs.set('tx-1', {
      id: 'tx-1',
      attestationNonce: 'att-1',
      campaignId: 'camp-1',
      userAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amountUsdc: 10_000_000n,
      relayerAddress: '0x9999999999999999999999999999999999999999',
      relayerNonce: 5,
      status: 'submitted',
      txHash: '0xconfirmedhash',
      reservedCostUsdc: 2000n,
    });

    mockRpc.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 5000n,
      gasUsed: 75_000n,
      effectiveGasPrice: 20_000_000_000n,
    });

    const reconciled = await recoveryManager.reconcilePendingTransactions();
    expect(reconciled.confirmedCount).toBe(1);

    const updated = inFlightTxs.get('tx-1');
    expect(updated?.status).toBe('confirmed');
    expect(mockAccounting.settleGas).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'camp-1',
      reservationId: 'att-1',
      gasUsed: 75_000n,
    }));
  });

  it('settles actual burned gas when transaction reverted on-chain (preventing unrecovered relayer loss)', async () => {
    inFlightTxs.set('tx-reverted', {
      id: 'tx-reverted',
      attestationNonce: 'att-rev',
      campaignId: 'camp-1',
      userAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amountUsdc: 10_000_000n,
      relayerAddress: '0x9999999999999999999999999999999999999999',
      relayerNonce: 6,
      status: 'submitted',
      txHash: '0xrevertedhash',
      reservedCostUsdc: 2000n,
    });

    mockRpc.getTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      blockNumber: 5001n,
      gasUsed: 40_000n, // gas was still consumed on-chain!
      effectiveGasPrice: 20_000_000_000n,
    });

    const reconciled = await recoveryManager.reconcilePendingTransactions();
    expect(reconciled.failedOnChainCount).toBe(1);

    const updated = inFlightTxs.get('tx-reverted');
    expect(updated?.status).toBe('failed_onchain');
    // Gas burned on-chain must be settled from the campaign reservation!
    expect(mockAccounting.settleGas).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'camp-1',
      reservationId: 'att-rev',
      gasUsed: 40_000n,
    }));
  });

  it('releases reservation if transaction was dropped and relayer nonce surpassed', async () => {
    inFlightTxs.set('tx-dropped', {
      id: 'tx-dropped',
      attestationNonce: 'att-drop',
      campaignId: 'camp-1',
      userAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amountUsdc: 10_000_000n,
      relayerAddress: '0x9999999999999999999999999999999999999999',
      relayerNonce: 4, // current nonce is 10n, meaning nonce 4 was skipped or dropped
      status: 'pending_broadcast',
      reservedCostUsdc: 2000n,
    });

    mockRpc.getTransactionReceipt.mockResolvedValue(null);

    const reconciled = await recoveryManager.reconcilePendingTransactions();
    expect(reconciled.droppedCount).toBe(1);

    const updated = inFlightTxs.get('tx-dropped');
    expect(updated?.status).toBe('dropped');
    expect(mockAccounting.releaseReservation).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'camp-1',
      reservationId: 'att-drop',
      reservedCostUsdc: 2000n,
    }));
  });
});
