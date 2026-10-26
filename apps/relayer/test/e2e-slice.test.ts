import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { privateKeyToAccount } from 'viem/accounts';
import { EIP3009_DOMAIN, EIP3009_TYPES } from '@adgas/shared';

describe('End-to-End Vertical Slice Integration Test', () => {
  // Test accounts
  const relayerSigner = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const userPayer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const recipientAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

  it('executes full critical path: ad attestation -> EIP-3009 signing -> relayer submit -> receipt & accounting', async () => {
    // 1. In-memory simulated storage for end-to-end integration
    const campaign = {
      id: 'camp-nike-arc',
      sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      name: 'Nike Arc Gas Sponsorship',
      totalFundedUsdc: 10_000_000n, // 10.0 USDC
      availableBalanceUsdc: 10_000_000n,
      reservedBalanceUsdc: 0n,
      settledSpendUsdc: 0n,
      maxGasPerTxUsdc: 50_000n, // 0.05 USDC cap
      status: 'active',
    };

    const attestations = new Map<string, any>();
    const attempts = new Map<string, any>();

    const mockDb = {
      getCampaign: async (id: string) => (id === campaign.id ? campaign : null),
      updateBalances: async (id: string, updates: any) => {
        if (id === campaign.id) Object.assign(campaign, updates);
      },
      saveAttestation: async (rec: any) => {
        attestations.set(rec.nonce, rec);
        return rec;
      },
      getAttestation: async (nonce: string) => attestations.get(nonce) || null,
      consumeAttestation: async (nonce: string) => {
        const att = attestations.get(nonce);
        if (att) att.status = 'consumed';
      },
      persistAttempt: async (rec: any) => {
        attempts.set(rec.id, rec);
        return rec;
      },
      updateAttempt: async (id: string, updates: any) => {
        const att = attempts.get(id);
        if (att) Object.assign(att, updates);
      },
      getPendingAttempts: async () => Array.from(attempts.values()),
    };

    const mockArcClient = {
      publicClient: {
        getBlockNumber: async () => 27939500n,
        getBalance: async () => 5n * 10n ** 18n, // 5 native USDC
        readContract: async () => 0, // authorizationState == 0 (Unused)
        simulateContract: async () => ({ request: {} }),
        waitForTransactionReceipt: async () => ({
          status: 'success',
          blockNumber: 27939501n,
          gasUsed: 78_245n,
          effectiveGasPrice: 20_000_000_000n, // 20 Gwei
        }),
      },
      walletClient: {
        writeContract: async () => '0x99e2e_arc_mainnet_hash_confirmed',
      },
      relayerAccount: relayerSigner,
    };

    const app = buildApp({
      arcClient: mockArcClient as any,
      db: mockDb,
    } as any);

    // STEP A: User Completes Video Ad -> Requests Attestation
    const attestRes = await app.inject({
      method: 'POST',
      url: '/api/attestation/issue',
      payload: {
        campaignId: 'camp-nike-arc',
        userAddress: userPayer.address,
        recipientAddress,
        amountUsdcUnits: '2500000', // 2.5 USDC
        adSessionToken: 'session_video_verified_view_1',
      },
    });

    expect(attestRes.statusCode).toBe(200);
    const attestation = attestRes.json();
    expect(attestation.nonce).toBeDefined();
    expect(attestation.signature).toBeDefined();

    // STEP B: User Signs EIP-3009 TransferWithAuthorization Typed Data
    const nowSec = Math.floor(Date.now() / 1000);
    const validAfter = nowSec - 10;
    const validBefore = nowSec + 600;
    const clientNonce = '0x' + '2'.repeat(64) as `0x${string}`;

    const rawSig = await userPayer.signTypedData({
      domain: EIP3009_DOMAIN,
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: userPayer.address,
        to: recipientAddress,
        value: 2_500_000n,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: clientNonce,
      },
    });

    // Extract v, r, s from 65-byte signature
    const r = `0x${rawSig.slice(2, 66)}` as `0x${string}`;
    const s = `0x${rawSig.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(rawSig.slice(130, 132), 16);

    // STEP C: Relayer Submits Transfer
    const relayRes = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: attestation.nonce,
        authorization: {
          from: userPayer.address,
          to: recipientAddress,
          value: '2500000',
          validAfter,
          validBefore,
          nonce: clientNonce,
          v,
          r,
          s,
        },
      },
    });

    expect(relayRes.statusCode).toBe(200);
    const confirmation = relayRes.json();

    expect(confirmation.status).toBe('confirmed');
    expect(confirmation.txHash).toBe('0x99e2e_arc_mainnet_hash_confirmed');
    expect(confirmation.blockNumber).toBe('27939501');

    // 78,245 gas * 20 Gwei = 1,564,900,000,000,000 wei
    // 1,564,900,000,000,000 / 10^12 = 1564.9 -> ceiling rounds to 1565 units ($0.001565)
    expect(confirmation.actualCostUsdc).toBe('1565');

    // STEP D: Verify Campaign Ledger Balances
    // 10,000,000 initial - 1565 actual spent = 9,998,435 available
    expect(campaign.availableBalanceUsdc).toBe(9_998_435n);
    expect(campaign.settledSpendUsdc).toBe(1565n);
    expect(campaign.reservedBalanceUsdc).toBe(0n); // Reserve released back
    expect(campaign.totalFundedUsdc).toBe(10_000_000n); // Total never drifts

    // STEP E: Attempt Replay with same attestation (must be rejected)
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/relay/transfer',
      payload: {
        attestationNonce: attestation.nonce,
        authorization: {
          from: userPayer.address,
          to: recipientAddress,
          value: '2500000',
          validAfter,
          validBefore,
          nonce: clientNonce,
          v,
          r,
          s,
        },
      },
    });

    expect(replayRes.statusCode).toBe(400);
    expect(replayRes.json().message).toContain('INVALID_ATTESTATION');
  });
});
