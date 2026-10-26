import { describe, it, expect } from 'vitest';
import {
  UNIT_SCALE_FACTOR,
  usdcTokenUnitsToNativeWei,
  nativeWeiToUsdcUnitsExact,
  nativeWeiToUsdcCeiling,
  calculateReceiptGasCost,
  calculateSponsorshipDebit,
} from '../src/decimals.js';

describe('Dual-Decimal Scaling & Economic Valuation Math', () => {
  it('defines correct UNIT_SCALE_FACTOR as 10^12', () => {
    expect(UNIT_SCALE_FACTOR).toBe(1_000_000_000_000n);
  });

  describe('usdcTokenUnitsToNativeWei', () => {
    it('scales standard 1.0 USDC (1,000,000 units) to 10^18 native wei', () => {
      expect(usdcTokenUnitsToNativeWei(1_000_000n)).toBe(1_000_000_000_000_000_000n);
    });

    it('scales 1 raw token unit (0.000001 USDC) to 10^12 native wei', () => {
      expect(usdcTokenUnitsToNativeWei(1n)).toBe(1_000_000_000_000n);
    });

    it('handles zero correctly', () => {
      expect(usdcTokenUnitsToNativeWei(0n)).toBe(0n);
    });

    it('throws on negative input', () => {
      expect(() => usdcTokenUnitsToNativeWei(-1n)).toThrow('Negative values not permitted');
    });
  });

  describe('nativeWeiToUsdcUnitsExact', () => {
    it('returns exact token units when divisible by 10^12', () => {
      expect(nativeWeiToUsdcUnitsExact(1_000_000_000_000n)).toBe(1n);
      expect(nativeWeiToUsdcUnitsExact(1_000_000_000_000_000_000n)).toBe(1_000_000n);
    });

    it('returns null when fractional remainder exists', () => {
      expect(nativeWeiToUsdcUnitsExact(1_000_000_000_001n)).toBeNull();
      expect(nativeWeiToUsdcUnitsExact(999_999_999_999n)).toBeNull();
    });
  });

  describe('nativeWeiToUsdcCeiling (Conservative Rounding)', () => {
    it('returns exact units when division has no remainder', () => {
      expect(nativeWeiToUsdcCeiling(1_000_000_000_000n)).toBe(1n);
      expect(nativeWeiToUsdcCeiling(2_000_000_000_000n)).toBe(2n);
    });

    it('rounds up on any fractional wei to protect relayer from erosion', () => {
      // 1 wei above 1 unit rounds to 2 units
      expect(nativeWeiToUsdcCeiling(1_000_000_000_001n)).toBe(2n);
      // Smallest 1 wei dust rounds up to 1 unit
      expect(nativeWeiToUsdcCeiling(1n)).toBe(1n);
      // Just below 2 units rounds up to 2 units
      expect(nativeWeiToUsdcCeiling(1_999_999_999_999n)).toBe(2n);
    });

    it('returns 0 for 0 input', () => {
      expect(nativeWeiToUsdcCeiling(0n)).toBe(0n);
    });

    it('applies economic multiplier correctly (e.g. 5% buffer)', () => {
      // Base: 1,000,000,000,000 wei (1 raw unit) with 105% buffer (10500 bps)
      // 1 * 1.05 = 1.05 units -> ceiling rounds to 2 units
      expect(nativeWeiToUsdcCeiling(1_000_000_000_000n, 10_500n)).toBe(2n);
    });

    it('throws on negative input', () => {
      expect(() => nativeWeiToUsdcCeiling(-100n)).toThrow('Negative values not permitted');
    });
  });

  describe('calculateReceiptGasCost and calculateSponsorshipDebit', () => {
    it('calculates raw native gas cost from receipt values', () => {
      const gasUsed = 80_000n;
      const gasPrice = 20_000_000_000n; // 20 Gwei
      // 80,000 * 20,000,000,000 = 1,600,000,000,000,000 wei (0.0016 USDC)
      expect(calculateReceiptGasCost(gasUsed, gasPrice)).toBe(1_600_000_000_000_000n);
    });

    it('converts confirmed receipt gas cost to exact 6-decimal USDC campaign debit', () => {
      const gasUsed = 80_000n;
      const gasPrice = 20_000_000_000n;
      const debit = calculateSponsorshipDebit(gasUsed, gasPrice);

      expect(debit.nativeGasCostWei).toBe(1_600_000_000_000_000n);
      // 1,600,000,000,000,000 / 10^12 = 1,600 units (0.001600 USDC)
      expect(debit.usdcDebitUnits).toBe(1600n);
    });

    it('correctly rounds up when receipt gas cost contains odd fractional wei', () => {
      const gasUsed = 80_001n;
      const gasPrice = 20_000_000_001n;
      // 80001 * 20000000001 = 1600020000080001 wei
      // Divided by 10^12 = 1600.020000080001 -> ceiling rounds to 1601 raw units
      const debit = calculateSponsorshipDebit(gasUsed, gasPrice);
      expect(debit.usdcDebitUnits).toBe(1601n);
    });
  });
});
