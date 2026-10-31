import { describe, it, expect, beforeEach } from 'vitest';
import {
  CampaignAccountingEngine,
  type CampaignRecord,
} from '../src/services/accountingEngine.js';

describe('Atomic Campaign Accounting & Settlement Engine', () => {
  let engine: CampaignAccountingEngine;
  let campaign: CampaignRecord;

  beforeEach(() => {
    campaign = {
      id: 'camp-1',
      sponsorAddress: '0x1111111111111111111111111111111111111111',
      name: 'Test Sponsor Campaign',
      totalFundedUsdc: 10_000_000n, // 10.0 USDC
      availableBalanceUsdc: 10_000_000n,
      reservedBalanceUsdc: 0n,
      settledSpendUsdc: 0n,
      maxGasPerTxUsdc: 50_000n, // 0.05 USDC cap
      status: 'active',
    };

    engine = new CampaignAccountingEngine({
      getCampaign: async (id) => (id === campaign.id ? { ...campaign } : null),
      updateBalances: async (id, updates) => {
        if (id === campaign.id) {
          Object.assign(campaign, updates);
        }
      },
    });
  });

  describe('reserveGas', () => {
    it('atomically moves estimated max gas from available to reserved balance', async () => {
      // 100,000 gasLimit * 20 Gwei (20,000,000,000 wei) = 2,000,000,000,000,000 wei = 2000 units (0.002 USDC)
      const gasLimit = 100_000n;
      const maxFeePerGas = 20_000_000_000n;

      const reservation = await engine.reserveGas({
        campaignId: 'camp-1',
        gasLimit,
        maxFeePerGas,
      });

      expect(reservation.reservedCostUsdc).toBe(2000n);
      expect(campaign.availableBalanceUsdc).toBe(10_000_000n - 2000n);
      expect(campaign.reservedBalanceUsdc).toBe(2000n);
      expect(campaign.settledSpendUsdc).toBe(0n);
    });

    it('rejects if campaign is paused', async () => {
      campaign.status = 'paused';

      await expect(
        engine.reserveGas({
          campaignId: 'camp-1',
          gasLimit: 100_000n,
          maxFeePerGas: 20_000_000_000n,
        })
      ).rejects.toThrow('CAMPAIGN_NOT_ACTIVE');
    });

    it('rejects if requested gas exceeds per-transaction cap', async () => {
      // 5,000,000 gasLimit * 20 Gwei = 100,000,000,000,000,000 wei = 100,000 units (> 50,000 cap)
      await expect(
        engine.reserveGas({
          campaignId: 'camp-1',
          gasLimit: 5_000_000n,
          maxFeePerGas: 20_000_000_000n,
        })
      ).rejects.toThrow('EXCEEDS_MAX_GAS_PER_TX');
    });

    it('rejects if campaign balance is insufficient to cover reservation (no overdraft)', async () => {
      campaign.availableBalanceUsdc = 500n; // only 0.0005 USDC available

      await expect(
        engine.reserveGas({
          campaignId: 'camp-1',
          gasLimit: 100_000n,
          maxFeePerGas: 20_000_000_000n, // needs 2000 units
        })
      ).rejects.toThrow('INSUFFICIENT_CAMPAIGN_BALANCE');
    });

    it('handles concurrent reservations safely without overdrafting balance', async () => {
      // Campaign has exactly 3000 units available
      campaign.availableBalanceUsdc = 3000n;

      // Two concurrent requests dispatched simultaneously, each needing 2000 units
      const req1 = engine.reserveGas({
        campaignId: 'camp-1',
        gasLimit: 100_000n,
        maxFeePerGas: 20_000_000_000n, // 2000 units
      });
      const req2 = engine.reserveGas({
        campaignId: 'camp-1',
        gasLimit: 100_000n,
        maxFeePerGas: 20_000_000_000n, // 2000 units
      });

      const results = await Promise.allSettled([req1, req2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and ONE must be rejected
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('INSUFFICIENT_CAMPAIGN_BALANCE');
      expect(campaign.availableBalanceUsdc).toBe(1000n);
      expect(campaign.reservedBalanceUsdc).toBe(2000n);
    });
  });

  describe('settleGas', () => {
    it('reconciles confirmed receipt cost, debits settled spend, and releases unspent reserve', async () => {
      // 1. Reserve 2000 units
      const reservation = await engine.reserveGas({
        campaignId: 'camp-1',
        gasLimit: 100_000n,
        maxFeePerGas: 20_000_000_000n,
      });

      // 2. Receipt confirms: 75,000 gasUsed at 20 Gwei
      // 75,000 * 20,000,000,000 = 1,500,000,000,000,000 wei = 1,500 units (0.0015 USDC)
      const settlement = await engine.settleGas({
        campaignId: 'camp-1',
        reservationId: reservation.reservationId,
        reservedCostUsdc: reservation.reservedCostUsdc,
        gasUsed: 75_000n,
        effectiveGasPrice: 20_000_000_000n,
      });

      expect(settlement.actualCostUsdc).toBe(1500n);
      expect(settlement.unspentRefundUsdc).toBe(500n);

      // Verify campaign balance accounting:
      // Available: 10_000_000 - 1500 = 9_998_500
      expect(campaign.availableBalanceUsdc).toBe(9_998_500n);
      expect(campaign.reservedBalanceUsdc).toBe(0n);
      expect(campaign.settledSpendUsdc).toBe(1500n);
      expect(campaign.totalFundedUsdc).toBe(10_000_000n);
    });

    it('rejects duplicate settlement attempt for same reservation (idempotency)', async () => {
      const reservation = await engine.reserveGas({
        campaignId: 'camp-1',
        gasLimit: 100_000n,
        maxFeePerGas: 20_000_000_000n,
      });

      await engine.settleGas({
        campaignId: 'camp-1',
        reservationId: reservation.reservationId,
        reservedCostUsdc: reservation.reservedCostUsdc,
        gasUsed: 75_000n,
        effectiveGasPrice: 20_000_000_000n,
      });

      await expect(
        engine.settleGas({
          campaignId: 'camp-1',
          reservationId: reservation.reservationId,
          reservedCostUsdc: reservation.reservedCostUsdc,
          gasUsed: 75_000n,
          effectiveGasPrice: 20_000_000_000n,
        })
      ).rejects.toThrow('ALREADY_SETTLED');
    });
  });

  describe('releaseReservation', () => {
    it('returns full reserved balance back to available balance when aborted before broadcast', async () => {
      const reservation = await engine.reserveGas({
        campaignId: 'camp-1',
        gasLimit: 100_000n,
        maxFeePerGas: 20_000_000_000n,
      });

      expect(campaign.availableBalanceUsdc).toBe(9_998_000n);
      expect(campaign.reservedBalanceUsdc).toBe(2000n);

      await engine.releaseReservation({
        campaignId: 'camp-1',
        reservationId: reservation.reservationId,
        reservedCostUsdc: reservation.reservedCostUsdc,
      });

      expect(campaign.availableBalanceUsdc).toBe(10_000_000n);
      expect(campaign.reservedBalanceUsdc).toBe(0n);
    });
  });
});
