import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import {
  SPONSORSHIP_ATTESTATION_TYPES,
  getAdgasVaultDomain,
  ARC_MAINNET_CHAIN_ID,
} from '@adgas/shared';

describe('POST /api/attestation/issue - Architecture A On-Chain Alignment', () => {
  const relayerSigner = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const mockVaultAddress = '0x1000000000000000000000000000000000000001' as `0x${string}`;
  const zeroVaultAddress = '0x0000000000000000000000000000000000000000' as `0x${string}`;

  let mockDb: any;
  let mockCampaign: any;
  let storedAttestations: Map<string, any>;

  beforeEach(() => {
    storedAttestations = new Map();

    mockCampaign = {
      id: 'camp-123',
      name: 'Adgas Demo Campaign',
      status: 'active',
      availableBalanceUsdcUnits: 5_000_000n, // 5.0 USDC
      availableBalanceUsdc: 5_000_000n,
      maxGasPerTxUsdcUnits: 50_000n,
      maxGasPerTxUsdc: 50_000n,
    };

    mockDb = {
      getCampaign: vi.fn().mockImplementation(async (id: string) => {
        return id === mockCampaign.id ? mockCampaign : null;
      }),
      getUserActiveAttestationCount: vi.fn().mockResolvedValue(0),
      saveAttestation: vi.fn().mockImplementation(async (record: any) => {
        storedAttestations.set(record.attestationNonce || record.nonce, record);
        return record;
      }),
    };
  });

  const getTestApp = (overrideOptions: any = {}) => {
    return buildApp({
      arcClient: {
        publicClient: {
          getBlockNumber: vi.fn().mockResolvedValue(100n),
          getBalance: vi.fn().mockResolvedValue(10n ** 18n),
        },
        walletClient: null,
        relayerAccount: relayerSigner,
      } as any,
      vaultAddress: mockVaultAddress,
      db: mockDb,
      ...overrideOptions,
    } as any);
  };

  it('generates an attestation with 32-byte random hex attestationNonce, valid bytes32 campaignId and userNonce', async () => {
    const app = getTestApp();
    const userAddress = '0x1111111111111111111111111111111111111111';
    const recipientAddress = '0x2222222222222222222222222222222222222222';

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress,
        recipientAddress,
        amountUsdcUnits: '1000000',
        adSessionToken: 'token_1',
      },
    });

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress,
        recipientAddress,
        amountUsdcUnits: '1000000',
        adSessionToken: 'token_2',
      },
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const data1 = res1.json();
    const data2 = res2.json();

    // 1. attestationNonce must be 32 bytes hex (66 chars with 0x), non-zero, and cryptographically random
    const bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
    expect(data1.attestationNonce).toMatch(bytes32Regex);
    expect(data2.attestationNonce).toMatch(bytes32Regex);
    expect(data1.attestationNonce).not.toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    expect(data1.attestationNonce).not.toBe(data2.attestationNonce);

    // 2. campaignId and userNonce must be valid bytes32 values
    expect(data1.campaignId).toMatch(bytes32Regex);
    expect(data1.userNonce).toMatch(bytes32Regex);
    expect(data1.userNonce).not.toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('binds executing relayer to arcClient.relayerAccount.address', async () => {
    const app = getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.relayer.toLowerCase()).toBe(relayerSigner.address.toLowerCase());
  });

  it('contains EIP-712 domain with configured vault verifyingContract and Arc chain ID 5042', async () => {
    const app = getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();

    expect(data.domain).toEqual({
      name: 'AdgasProtocol',
      version: '1',
      chainId: ARC_MAINNET_CHAIN_ID,
      verifyingContract: mockVaultAddress,
    });
  });

  it('matches Solidity SponsorshipAttestation struct and successfully recovers relayer address with Viem', async () => {
    const app = getTestApp();
    const userAddress = '0x1111111111111111111111111111111111111111';
    const recipientAddress = '0x2222222222222222222222222222222222222222';

    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress,
        recipientAddress,
        amountUsdcUnits: '1000000',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();

    // Verify signature components
    expect(data.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
    expect(data.v === 27 || data.v === 28).toBe(true);
    expect(data.r).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(data.s).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Cryptographic recovery over SPONSORSHIP_ATTESTATION_TYPES
    const domain = getAdgasVaultDomain(mockVaultAddress, ARC_MAINNET_CHAIN_ID);
    const message = {
      campaignId: data.campaignId,
      user: data.user,
      recipient: data.recipient,
      amountUsdc: BigInt(data.amountUsdc),
      userNonce: data.userNonce,
      validAfter: BigInt(data.validAfter),
      validBefore: BigInt(data.validBefore),
      maxGasReimbursementUsdc: BigInt(data.maxGasReimbursementUsdc),
      expiry: BigInt(data.expiry),
      attestationNonce: data.attestationNonce,
      relayer: data.relayer,
    };

    const recovered = await recoverTypedDataAddress({
      domain,
      types: SPONSORSHIP_ATTESTATION_TYPES,
      primaryType: 'SponsorshipAttestation',
      message,
      signature: data.signature,
    });

    expect(recovered.toLowerCase()).toBe(relayerSigner.address.toLowerCase());
  });

  it('fails verification if chainId, vault, campaignId, userNonce, or relayer are altered', async () => {
    const app = getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
      },
    });

    const data = res.json();
    const correctDomain = getAdgasVaultDomain(mockVaultAddress, ARC_MAINNET_CHAIN_ID);
    const correctMessage = {
      campaignId: data.campaignId,
      user: data.user,
      recipient: data.recipient,
      amountUsdc: BigInt(data.amountUsdc),
      userNonce: data.userNonce,
      validAfter: BigInt(data.validAfter),
      validBefore: BigInt(data.validBefore),
      maxGasReimbursementUsdc: BigInt(data.maxGasReimbursementUsdc),
      expiry: BigInt(data.expiry),
      attestationNonce: data.attestationNonce,
      relayer: data.relayer,
    };

    // 1. Wrong chainId fails verification
    const wrongChainDomain = getAdgasVaultDomain(mockVaultAddress, 1);
    const recoveredWrongChain = await recoverTypedDataAddress({
      domain: wrongChainDomain,
      types: SPONSORSHIP_ATTESTATION_TYPES,
      primaryType: 'SponsorshipAttestation',
      message: correctMessage,
      signature: data.signature,
    });
    expect(recoveredWrongChain.toLowerCase()).not.toBe(relayerSigner.address.toLowerCase());

    // 2. Wrong vault address fails verification
    const wrongVaultDomain = getAdgasVaultDomain('0x2000000000000000000000000000000000000002', ARC_MAINNET_CHAIN_ID);
    const recoveredWrongVault = await recoverTypedDataAddress({
      domain: wrongVaultDomain,
      types: SPONSORSHIP_ATTESTATION_TYPES,
      primaryType: 'SponsorshipAttestation',
      message: correctMessage,
      signature: data.signature,
    });
    expect(recoveredWrongVault.toLowerCase()).not.toBe(relayerSigner.address.toLowerCase());

    // 3. Altered campaignId fails verification
    const alteredCampaignMessage = {
      ...correctMessage,
      campaignId: '0x9999999999999999999999999999999999999999999999999999999999999999' as `0x${string}`,
    };
    const recoveredAlteredCampaign = await recoverTypedDataAddress({
      domain: correctDomain,
      types: SPONSORSHIP_ATTESTATION_TYPES,
      primaryType: 'SponsorshipAttestation',
      message: alteredCampaignMessage,
      signature: data.signature,
    });
    expect(recoveredAlteredCampaign.toLowerCase()).not.toBe(relayerSigner.address.toLowerCase());

    // 4. Altered userNonce fails verification
    const alteredNonceMessage = {
      ...correctMessage,
      userNonce: '0x8888888888888888888888888888888888888888888888888888888888888888' as `0x${string}`,
    };
    const recoveredAlteredNonce = await recoverTypedDataAddress({
      domain: correctDomain,
      types: SPONSORSHIP_ATTESTATION_TYPES,
      primaryType: 'SponsorshipAttestation',
      message: alteredNonceMessage,
      signature: data.signature,
    });
    expect(recoveredAlteredNonce.toLowerCase()).not.toBe(relayerSigner.address.toLowerCase());

    // 5. Altered relayer fails verification
    const alteredRelayerMessage = {
      ...correctMessage,
      relayer: '0x0000000000000000000000000000000000000002' as `0x${string}`,
    };
    const recoveredAlteredRelayer = await recoverTypedDataAddress({
      domain: correctDomain,
      types: SPONSORSHIP_ATTESTATION_TYPES,
      primaryType: 'SponsorshipAttestation',
      message: alteredRelayerMessage,
      signature: data.signature,
    });
    expect(recoveredAlteredRelayer.toLowerCase()).not.toBe(relayerSigner.address.toLowerCase());
  });

  it('fails closed with HTTP 500 ConfigurationError if vault address is missing or zero address', async () => {
    // Zero address configured
    const appZero = getTestApp({ vaultAddress: zeroVaultAddress });
    const resZero = await appZero.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
      },
    });

    expect(resZero.statusCode).toBe(500);
    const bodyZero = resZero.json();
    expect(bodyZero.error).toBe('ConfigurationError');
    expect(bodyZero.message).toContain('ADGAS_VAULT_ADDRESS');

    // Missing / undefined vault address configured
    const appMissing = getTestApp({ vaultAddress: undefined });
    const resMissing = await appMissing.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
      },
    });

    expect(resMissing.statusCode).toBe(500);
    const bodyMissing = resMissing.json();
    expect(bodyMissing.error).toBe('ConfigurationError');
  });

  it('rejects malformed inputs with HTTP 400', async () => {
    const app = getTestApp();

    // 1. Missing required parameters
    const resMissing = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        // missing userAddress, recipientAddress, amountUsdcUnits
      },
    });
    expect(resMissing.statusCode).toBe(400);
    expect(resMissing.json().error).toBe('ValidationError');

    // 2. Invalid EVM address
    const resInvalidAddr = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: 'invalid-address',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '1000000',
      },
    });
    expect(resInvalidAddr.statusCode).toBe(400);
    expect(resInvalidAddr.json().error).toBe('ValidationError');

    // 3. Zero or negative amount
    const resZeroAmount = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-123',
        userAddress: '0x1111111111111111111111111111111111111111',
        recipientAddress: '0x2222222222222222222222222222222222222222',
        amountUsdcUnits: '0',
      },
    });
    expect(resZeroAmount.statusCode).toBe(400);
    expect(resZeroAmount.json().error).toBe('ValidationError');
  });

  it('rejects if campaign is not active or balance is depleted', async () => {
    mockCampaign.status = 'paused';
    const app = getTestApp();

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
    const app = getTestApp();

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
