/**
 * Dual-Decimal Conversion & Valuation Utilities for Arc Network
 * 
 * Strict separation of Unit Scaling (10^12) from Economic Valuation.
 * Implements conservative integer ceiling division to prevent relayer fractional gas loss.
 */

/**
 * 18 decimals (native Arc execution wei) vs 6 decimals (ERC-20 USDC standard).
 * 10^(18 - 6) = 10^12 = 1,000,000,000,000
 */
export const UNIT_SCALE_FACTOR = 1_000_000_000_000n;

/**
 * Converts ERC-20 USDC units (6 decimals) to Arc native wei (18 decimals).
 * Example: 1_000_000 units (1.0 USDC) -> 10^18 wei
 */
export function usdcTokenUnitsToNativeWei(usdcUnits: bigint): bigint {
  if (usdcUnits < 0n) {
    throw new RangeError('Negative values not permitted for token unit scaling');
  }
  return usdcUnits * UNIT_SCALE_FACTOR;
}

/**
 * Converts Arc native wei to ERC-20 USDC units if and only if division has no remainder.
 * Returns null if fractional dust would be lost.
 */
export function nativeWeiToUsdcUnitsExact(nativeWei: bigint): bigint | null {
  if (nativeWei < 0n) {
    throw new RangeError('Negative values not permitted for token unit scaling');
  }
  if (nativeWei % UNIT_SCALE_FACTOR !== 0n) {
    return null;
  }
  return nativeWei / UNIT_SCALE_FACTOR;
}

/**
 * Converts Arc native wei to ERC-20 USDC units using integer ceiling rounding.
 * Any fractional wei strictly rounds up to the next 6-decimal unit, ensuring
 * that the sponsor campaign always covers all execution costs.
 * 
 * @param nativeGasCostWei Raw gas cost in 18-decimal wei
 * @param economicMultiplierBps Optional economic multiplier in basis points (10000 = 100.00% parity)
 */
export function nativeWeiToUsdcCeiling(
  nativeGasCostWei: bigint,
  economicMultiplierBps: bigint = 10_000n
): bigint {
  if (nativeGasCostWei < 0n) {
    throw new RangeError('Negative values not permitted for gas cost calculation');
  }
  if (nativeGasCostWei === 0n) {
    return 0n;
  }

  // 1. Economic Valuation Step (separated from unit scaling)
  // Multiply by multiplier in basis points and round up (add 9999) before dividing by 10000
  let evaluatedWei = nativeGasCostWei;
  if (economicMultiplierBps !== 10_000n) {
    evaluatedWei = (nativeGasCostWei * economicMultiplierBps + 9_999n) / 10_000n;
  }

  // 2. Unit Scaling Step: Integer ceiling division by 10^12
  // Formula: ceil(a / b) = floor((a + b - 1) / b)
  return (evaluatedWei + UNIT_SCALE_FACTOR - 1n) / UNIT_SCALE_FACTOR;
}

/**
 * Calculates raw execution cost in native 18-decimal wei from confirmed transaction receipt parameters.
 */
export function calculateReceiptGasCost(gasUsed: bigint, effectiveGasPrice: bigint): bigint {
  if (gasUsed < 0n || effectiveGasPrice < 0n) {
    throw new RangeError('gasUsed and effectiveGasPrice must be non-negative');
  }
  return gasUsed * effectiveGasPrice;
}

/**
 * Derives the complete sponsorship breakdown from a confirmed Arc mainnet transaction receipt.
 */
export function calculateSponsorshipDebit(
  gasUsed: bigint,
  effectiveGasPrice: bigint,
  economicMultiplierBps: bigint = 10_000n
): {
  nativeGasCostWei: bigint;
  usdcDebitUnits: bigint;
} {
  const nativeGasCostWei = calculateReceiptGasCost(gasUsed, effectiveGasPrice);
  const usdcDebitUnits = nativeWeiToUsdcCeiling(nativeGasCostWei, economicMultiplierBps);

  return {
    nativeGasCostWei,
    usdcDebitUnits,
  };
}
