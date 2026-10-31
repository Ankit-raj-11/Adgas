import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { ADGAS_VAULT_ABI } from '@adgas/shared';

describe('POST /api/relay/transfer - Architecture A Vault Execution', () => {
  const mockVaultAddress = '0x1000000000000000000000000000000000000001' as const;
  const userAddress = '0x1111111111111111111111111111111111111111' as const;
  const recipientAddress = '0x2222222222222222222222222222222222222222' as const;
  const relayerAddress = '0x9999999999999999999999999999999999999999' as const;

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

    const nowSec = Math.floor(Date.now() / 1000);
    const userNonce = ('0x' + '1'.repeat(64)) as `0x${string}`;
    const attestationNonce = ('0x' + '2'.repeat(64)) as `0x${string}`;
    const campaignIdBytes32 = ('0x' + '3'.repeat(64)) as `0x${string}`;

    storedAttestations.set('att-valid-1', {
      nonce: 'att-valid-1',
      attestationNonce,
      campaignId: 'camp-123',
      campaignIdBytes32,
      user: userAddress,
      userAddress,
      recipient: recipientAddress,
      recipientAddress,
      amountUsdc: '1000000',
      amountUsdcUnits: '1000000',
      userNonce,
      validAfter: nowSec - 60,
      validBefore: nowSec + 3600,
      maxGasReimbursementUsdc: '50000',
      expiry: nowSec + 300,
      expiryTimestamp: nowSec + 300,
      relayer: relayerAddress,
      v: 27,
      r: ('0x' + 'c'.repeat(64)) as `0x${string}`,
      s: ('0x' + 'd'.repeat(64)) as `0x${string}`,
      signature: ('0x' + 'c'.repeat(64) + 'd'.repeat(64) + '1b') as `0x${string}`,
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
        address: relayerAddress,
      },
    };
  });

  const getTestApp = (overrideOptions: any = {}) => {
    return buildApp({
      arcClient: mockArcClient as any,
      vaultAddress: mockVaultAddress,
      db: mockDb,
      ...overrideOptions,
    } as any);
  };

  it('validates ReceiveWithAuthorization, reserves gas, simulates executeSponsoredTransfer on vault, and submits transaction', async () => {
    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: userAddress,
          to: mockVaultAddress, // In Architecture A, auth.to must be the vault!
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

    // Verify simulateContract called executeSponsoredTransfer on the Vault contract
    expect(mockArcClient.publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockVaultAddress,
        functionName: 'executeSponsoredTransfer',
      })
    );

    // Verify writeContract dispatched executeSponsoredTransfer on the Vault contract
    expect(mockArcClient.walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockVaultAddress,
        functionName: 'executeSponsoredTransfer',
      })
    );

    // Attestation must be marked consumed
    expect(mockDb.consumeAttestation).toHaveBeenCalledWith('att-valid-1');
  });

  it('rejects if authorization recipient is not the configured vault address', async () => {
    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: userAddress,
          to: recipientAddress, // Wrong: directly sending to recipient instead of vault
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
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('recipient must be AdgasSponsorVault');
  });

  it('rejects if attestation does not exist or is already consumed', async () => {
    const app = getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-nonexistent',
        authorization: {
          from: userAddress,
          to: mockVaultAddress,
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
    const app = getTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: '0x3333333333333333333333333333333333333333', // Mismatch authorizer!
          to: mockVaultAddress,
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
    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: userAddress,
          to: mockVaultAddress,
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

  it('handles on-chain revert by settling burned gas and returning status failed_onchain', async () => {
    mockArcClient.publicClient.waitForTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      blockNumber: 102n,
      gasUsed: 45_000n,
      effectiveGasPrice: 20_000_000_000n,
    });

    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: userAddress,
          to: mockVaultAddress,
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

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.status).toBe('failed_onchain');
    expect(body.error).toBe('ExecutionReverted');
    expect(body.message).toContain('TRANSACTION_REVERTED');
    expect(body.actualCostUsdc).toBeDefined();
  });

  it('rejects expired authorization when current time exceeds validBefore', async () => {
    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: userAddress,
          to: mockVaultAddress,
          value: '1000000',
          validAfter: nowSec - 3600,
          validBefore: nowSec - 10, // Expired
          nonce: '0x' + '1'.repeat(64),
          v: 27,
          r: '0x' + 'a'.repeat(64),
          s: '0x' + 'b'.repeat(64),
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('AuthorizationError');
    expect(body.message).toContain('AUTHORIZATION_EXPIRED');
  });

  it('rejects if campaign available balance is insufficient to cover gas reservation', async () => {
    mockCampaign.availableBalanceUsdc = 100n; // Less than gas reservation
    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: 'att-valid-1',
        authorization: {
          from: userAddress,
          to: mockVaultAddress,
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
    expect(body.error).toBe('AccountingError');
    expect(body.message).toContain('INSUFFICIENT_CAMPAIGN_BALANCE');
  });

  it('rejects duplicate requests reusing the same attestation nonce', async () => {
    const app = getTestApp();
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      attestationNonce: 'att-valid-1',
      authorization: {
        from: userAddress,
        to: mockVaultAddress,
        value: '1000000',
        validAfter: nowSec - 60,
        validBefore: nowSec + 3600,
        nonce: ('0x' + '1'.repeat(64)) as `0x${string}`,
        v: 27,
        r: ('0x' + 'a'.repeat(64)) as `0x${string}`,
        s: ('0x' + 'b'.repeat(64)) as `0x${string}`,
      },
    };

    // First request succeeds
    const res1 = await app.inject({ method: 'POST', url: '/api/relay/transfer', payload });
    expect(res1.statusCode).toBe(200);

    // Second request with exact same attestationNonce fails
    const res2 = await app.inject({ method: 'POST', url: '/api/relay/transfer', payload });
    expect(res2.statusCode).toBe(400);
    const body2 = res2.json();
    expect(body2.message).toContain('INVALID_ATTESTATION');
  });
});
