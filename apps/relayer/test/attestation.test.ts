import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import { ADGAS_ATTESTATION_DOMAIN, ADGAS_ATTESTATION_TYPES } from '@adgas/shared';

describe('POST /api/attestation/issue', () => {
  const relayerSigner = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  let mockDb: any;
  let mockCampaign: any;
  let storedAttestations: Map<string, any>;

  beforeEach(() => {
    storedAttestations = new Map();

    mockCampaign = {
      id: 'camp-123',
      name: 'Adgas Demo Campaign',
      status: 'active',
      availableBalanceUsdc: 5_000_000n, // 5.0 USDC
      maxGasPerTxUsdc: 50_000n,
    };

    mockDb = {
      getCampaign: vi.fn().mockImplementation(async (id: string) => {
        return id === mockCampaign.id ? mockCampaign : null;
      }),
      getUserActiveAttestationCount: vi.fn().mockResolvedValue(0),
      saveAttestation: vi.fn().mockImplementation(async (record: any) => {
        storedAttestations.set(record.nonce, record);
        return record;
      }),
    };
  });

  it('issues an EIP-712 signed attestation with 5-minute TTL upon valid ad completion', async () => {
    const app = buildApp({
      arcClient: {
        publicClient: { getBlockNumber: vi.fn().mockResolvedValue(100n), getBalance: vi.fn().mockResolvedValue(10n ** 18n) },
        walletClient: null,
        relayerAccount: relayerSigner,
      } as any,
      db: mockDb,
    } as any);

    const userAddress = '0x1111111111111111111111111111111111111111';
    const recipientAddress = '0x2222222222222222222222222222222222222222';
    const beforeSec = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress,
        recipientAddress,
        amountUsdcUnits: '1000000', // 1.0 USDC
        adSessionToken: 'token_verified_view_123',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();

    expect(data.campaignId).toBe('camp-123');
    expect(data.userAddress).toBe(userAddress);
    expect(data.recipientAddress).toBe(recipientAddress);
    expect(data.amountUsdcUnits).toBe('1000000');
    expect(data.nonce).toBeDefined();
    // Expiry must be ~300 seconds (5 minutes) from now
    expect(data.expiryTimestamp).toBeGreaterThanOrEqual(beforeSec + 295);
    expect(data.expiryTimestamp).toBeLessThanOrEqual(beforeSec + 305);

    // Verify cryptographic signature matches relayer account
    const recovered = await recoverTypedDataAddress({
      domain: ADGAS_ATTESTATION_DOMAIN,
      types: ADGAS_ATTESTATION_TYPES,
      primaryType: 'AdgasAttestation',
      message: {
        campaignId: data.campaignId,
        user: data.userAddress,
        recipient: data.recipientAddress,
        amountUsdcUnits: BigInt(data.amountUsdcUnits),
        nonce: data.nonce,
        expiryTimestamp: BigInt(data.expiryTimestamp),
      },
      signature: data.signature,
    });

    expect(recovered.toLowerCase()).toBe(relayerSigner.address.toLowerCase());
  });

  it('rejects if campaign is not active or balance is depleted', async () => {
    mockCampaign.status = 'paused';

    const app = buildApp({
      arcClient: {
        publicClient: { getBlockNumber: vi.fn().mockResolvedValue(100n), getBalance: vi.fn().mockResolvedValue(10n ** 18n) },
        walletClient: null,
        relayerAccount: relayerSigner,
      } as any,
      db: mockDb,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
        adSessionToken: 'token_123',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('CAMPAIGN_NOT_ACTIVE');
  });

  it('rejects if user exceeds active attestation rate limit', async () => {
    mockDb.getUserActiveAttestationCount.mockResolvedValue(3); // Rate limited

    const app = buildApp({
      arcClient: {
        publicClient: { getBlockNumber: vi.fn().mockResolvedValue(100n), getBalance: vi.fn().mockResolvedValue(10n ** 18n) },
        walletClient: null,
        relayerAccount: relayerSigner,
      } as any,
      db: mockDb,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
        adSessionToken: 'token_123',
      },
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.message).toContain('RATE_LIMIT_EXCEEDED');
  });
});
