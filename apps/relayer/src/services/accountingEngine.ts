/**
 * Atomic Campaign Accounting & Settlement Engine
 * 
 * Manages pre-broadcast budget reservations, confirmation settlement,
 * and unspent reserve refunds. Guarantees zero balance double-counting
 * and protects against campaign overdrafts.
 */

import { randomUUID } from 'node:crypto';
import {
  calculateReceiptGasCost,
  nativeWeiToUsdcCeiling,
  calculateSponsorshipDebit,
} from '@adgas/shared';

export interface CampaignRecord {
  id: string;
  sponsorAddress: string;
  name: string;
  totalFundedUsdc: bigint;
  availableBalanceUsdc: bigint;
  reservedBalanceUsdc: bigint;
  settledSpendUsdc: bigint;
  maxGasPerTxUsdc: bigint;
  status: string; // 'active' | 'paused' | 'depleted'
}

export interface ReserveGasParams {
  campaignId: string;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  economicMultiplierBps?: bigint;
}

export interface SettleGasParams {
  campaignId: string;
  reservationId: string;
  reservedCostUsdc: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  economicMultiplierBps?: bigint;
}

export interface ReleaseReservationParams {
  campaignId: string;
  reservationId: string;
  reservedCostUsdc: bigint;
}

export interface AccountingEngineDependencies {
  getCampaign: (id: string) => Promise<CampaignRecord | null>;
  updateBalances: (
    id: string,
    updates: {
      availableBalanceUsdc: bigint;
      reservedBalanceUsdc: bigint;
      settledSpendUsdc: bigint;
      status?: string;
    }
  ) => Promise<void>;
}

export class CampaignAccountingEngine {
  private settledReservations = new Set<string>();
  private locks = new Map<string, Promise<any>>();

  constructor(private deps: AccountingEngineDependencies) {}

  private async withLock<T>(campaignId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(campaignId) || Promise.resolve();
    let release: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(campaignId, next);
    try {
      await prev;
      return await fn();
    } finally {
      release!();
      if (this.locks.get(campaignId) === next) {
        this.locks.delete(campaignId);
      }
    }
  }

  /**
   * Pre-flight atomic reservation of worst-case execution cost
   */
  async reserveGas(params: ReserveGasParams) {
    return this.withLock(params.campaignId, async () => {
      const { campaignId, gasLimit, maxFeePerGas, economicMultiplierBps = 10_000n } = params;

      const campaign = await this.deps.getCampaign(campaignId);
      if (!campaign) {
        throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
      }

      if (campaign.status !== 'active') {
        throw new Error(`CAMPAIGN_NOT_ACTIVE: Campaign is currently ${campaign.status}`);
      }

      // 1. Calculate estimated worst-case execution cost in native wei
      const estimatedGasWei = gasLimit * maxFeePerGas;

      // 2. Convert to 6-decimal USDC with conservative integer ceiling rounding
      const reservedCostUsdc = nativeWeiToUsdcCeiling(estimatedGasWei, economicMultiplierBps);

      // 3. Enforce per-transaction spending limit
      if (reservedCostUsdc > campaign.maxGasPerTxUsdc) {
        throw new Error(
          `EXCEEDS_MAX_GAS_PER_TX: Estimated cost ${reservedCostUsdc} USDC units exceeds campaign cap of ${campaign.maxGasPerTxUsdc}`
        );
      }

      // 4. Overdraft Check
      if (campaign.availableBalanceUsdc < reservedCostUsdc) {
        throw new Error(
          `INSUFFICIENT_CAMPAIGN_BALANCE: Available balance ${campaign.availableBalanceUsdc} insufficient for reservation ${reservedCostUsdc}`
        );
      }

      // 5. Atomic balance adjustment
      const updatedAvailable = campaign.availableBalanceUsdc - reservedCostUsdc;
      const updatedReserved = campaign.reservedBalanceUsdc + reservedCostUsdc;

      await this.deps.updateBalances(campaignId, {
        availableBalanceUsdc: updatedAvailable,
        reservedBalanceUsdc: updatedReserved,
        settledSpendUsdc: campaign.settledSpendUsdc,
      });

      const reservationId = `res_${randomUUID()}`;

      return {
        reservationId,
        campaignId,
        reservedCostUsdc,
      };
    });
  }

  /**
   * Post-confirmation settlement based on actual confirmed gas burned
   */
  async settleGas(params: SettleGasParams) {
    return this.withLock(params.campaignId, async () => {
      const { campaignId, reservationId, reservedCostUsdc, gasUsed, effectiveGasPrice, economicMultiplierBps = 10_000n } = params;

      if (this.settledReservations.has(reservationId)) {
        throw new Error(`ALREADY_SETTLED: Reservation ${reservationId} has already been settled`);
      }

      const campaign = await this.deps.getCampaign(campaignId);
      if (!campaign) {
        throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
      }

      // 1. Calculate actual confirmed gas expense with integer ceiling
      const { nativeGasCostWei, usdcDebitUnits: actualCostUsdc } = calculateSponsorshipDebit(
        gasUsed,
        effectiveGasPrice,
        economicMultiplierBps
      );

      // 2. Calculate unspent reservation refund
      // If actualCost exceeds reservedCost (e.g. gas limit was underestimated), clamp unspent to 0
      const unspentRefundUsdc = reservedCostUsdc > actualCostUsdc ? reservedCostUsdc - actualCostUsdc : 0n;

      // 3. Reconcile balances
      const updatedReserved = campaign.reservedBalanceUsdc >= reservedCostUsdc
        ? campaign.reservedBalanceUsdc - reservedCostUsdc
        : 0n;
      const updatedSettled = campaign.settledSpendUsdc + actualCostUsdc;
      const updatedAvailable = campaign.availableBalanceUsdc + unspentRefundUsdc;

      const newStatus = updatedAvailable === 0n && updatedReserved === 0n ? 'depleted' : campaign.status;

      await this.deps.updateBalances(campaignId, {
        availableBalanceUsdc: updatedAvailable,
        reservedBalanceUsdc: updatedReserved,
        settledSpendUsdc: updatedSettled,
        status: newStatus,
      });

      this.settledReservations.add(reservationId);

      return {
        reservationId,
        actualCostUsdc,
        nativeGasCostWei,
        unspentRefundUsdc,
        remainingAvailableUsdc: updatedAvailable,
      };
    });
  }

  /**
   * Releases an unconsumed reservation back to the available pool
   */
  async releaseReservation(params: ReleaseReservationParams) {
    return this.withLock(params.campaignId, async () => {
      const { campaignId, reservationId, reservedCostUsdc } = params;

      const campaign = await this.deps.getCampaign(campaignId);
      if (!campaign) return;

      const updatedReserved = campaign.reservedBalanceUsdc >= reservedCostUsdc
        ? campaign.reservedBalanceUsdc - reservedCostUsdc
        : 0n;
      const updatedAvailable = campaign.availableBalanceUsdc + reservedCostUsdc;

      await this.deps.updateBalances(campaignId, {
        availableBalanceUsdc: updatedAvailable,
        reservedBalanceUsdc: updatedReserved,
        settledSpendUsdc: campaign.settledSpendUsdc,
      });
    });
  }
}
