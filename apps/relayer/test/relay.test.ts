import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { ARC_USDC_ADDRESS } from '@adgas/shared';

describe('POST /api/relay/transfer', () => {
  let mockDb: any;
  let mockArcClient: any;
  let storedAttestations: Map<string, any>;
  let mockCampaign: any;

  beforeEach(() => {
    storedAttestations = new Map();

    mockCampaign = {
      id: 'camp-123',
      name: 'Adgas Demo Campaign',
      status: 'active',
      totalFundedUsdc: 10_000_000n,
      availableBalanceUsdc: 10_000_000n,
      reservedBalanceUsdc: 0n,
      settledSpendUsdc: 0n,
      maxGasPerTxUsdc: 50_000n,
    };

    // Stored valid attestation
    const nowSec = Math.floor(Date.now() / 1000);
    storedAttestations.set('att-valid-1', {
      nonce: 'att-valid-1',
      campaignId: 'camp-123',
      userAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amountUsdcUnits: '1000000',
      expiryTimestamp: nowSec + 300,
      status: 'issued',
    });

    mockDb = {
      getAttestation: vi.fn().mockImplementation(async (nonce: string) => storedAttestations.get(nonce) || null),
      consumeAttestation: vi.fn().mockImplementation(async (nonce: string) => {
        const att = storedAttestations.get(nonce);
        if (att) att.status = 'consumed';
      }),
      getCampaign: vi.fn().mockResolvedValue(mockCampaign),
      updateBalances: vi.fn().mockResolvedValue(undefined),
      persistAttempt: vi.fn().mockImplementation(async (rec: any) => rec),
      updateAttempt: vi.fn().mockResolvedValue(undefined),
      getPendingAttempts: vi.fn().mockResolvedValue([]),
    };

    mockArcClient = {
      publicClient: {
        getBlockNumber: vi.fn().mockResolvedValue(100n),
        getBalance: vi.fn().mockResolvedValue(10n ** 18n),
        readContract: vi.fn().mockResolvedValue(0), // authorizationState == 0 (Unused)
        simulateContract: vi.fn().mockResolvedValue({ request: {} }),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'success',
          blockNumber: 101n,
          gasUsed: 75_000n,
          effectiveGasPrice: 20_000_000_000n,
        }),
      },
      walletClient: {
        writeContract: vi.fn().mockResolvedValue('0xrelayedtxhash123'),
      },
      relayerAccount: {
        address: '0x9999999999999999999999999999999999999999',
      },
    };
  });

  it('validates attestation, reserves gas, simulates, submits, and settles on-chain transfer', async () => {
    const app = buildApp({
      arcClient: mockArcClient as any,
      db: mockDb,
    } as any);

    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '1000000',
          validAfter: nowSec - 60,
          validBefore: nowSec + 3600,
          nonce: '0x' + '1'.repeat(64),
          v: 27,
          r: '0x' + 'a'.repeat(64),
          s: '0x' + 'b'.repeat(64),
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.status).toBe('confirmed');
    expect(body.txHash).toBe('0xrelayedtxhash123');
    expect(body.blockNumber).toBe('101');
    expect(body.actualCostUsdc).toBe('1500'); // 75,000 gas * 20 Gwei / 10^12 = 1,500 USDC units
    expect(body.explorerUrl).toContain('0xrelayedtxhash123');

    // Attestation must be marked consumed
    expect(mockDb.consumeAttestation).toHaveBeenCalledWith('att-valid-1');
  });

  it('rejects if attestation does not exist or is already consumed', async () => {
    const app = buildApp({
      arcClient: mockArcClient as any,
      db: mockDb,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-nonexistent',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '1000000',
          validAfter: 0,
          validBefore: 9999999999,
          nonce: '0x' + '1'.repeat(64),
          v: 27,
          r: '0x' + 'a'.repeat(64),
          s: '0x' + 'b'.repeat(64),
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('INVALID_ATTESTATION');
  });

  it('rejects if transfer parameters do not match signed attestation', async () => {
    const app = buildApp({
      arcClient: mockArcClient as any,
      db: mockDb,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x3333333333333333333333333333333333333333', // Mismatch recipient!
          value: '1000000',
          validAfter: 0,
          validBefore: 9999999999,
          nonce: '0x' + '1'.repeat(64),
          v: 27,
          r: '0x' + 'a'.repeat(64),
          s: '0x' + 'b'.repeat(64),
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('ATTESTATION_PARAMETER_MISMATCH');
  });

  it('rejects if on-chain authorization nonce is already used', async () => {
    mockArcClient.publicClient.readContract.mockResolvedValue(1); // authorizationState == 1 (Used)

    const app = buildApp({
      arcClient: mockArcClient as any,
      db: mockDb,
    } as any);

    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '1000000',
          validAfter: nowSec - 60,
          validBefore: nowSec + 3600,
          nonce: '0x' + '1'.repeat(64),
          v: 27,
          r: '0x' + 'a'.repeat(64),
          s: '0x' + 'b'.repeat(64),
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('AUTHORIZATION_ALREADY_USED');
  });
});
