# Arc Gas Valuation & Unit Scaling Specification

## 1. Executive Summary & Core Principle
On the **Arc Network** (Chain ID: 5042), **USDC is the native execution currency and gas token**. Unlike traditional EVM chains where native gas is paid in a volatile asset (e.g. ETH on Ethereum, POL on Polygon) and distinct from stablecoin balances, Arc natively settles execution fees in USDC.

However, Arc employs a **dual-interface representation**:
1. **Native Execution Balance (State / EVM Layer):** Accounted in **18 decimals** ($10^{18}$ units = 1.000000000000000000 USDC).
2. **ERC-20 Interface (`0x3600000000000000000000000000000000000000`):** Accounted in **6 decimals** ($10^6$ units = 1.000000 USDC) to maintain compatibility with cross-chain ERC-20 smart contracts, dApps, and standards (such as EIP-3009).

Both interfaces represent the **exact same underlying asset and balance**.

---

## 2. Economic Valuation vs. Unit Conversion
To avoid architectural assumptions, Adgas strictly separates **Unit Scaling** from **Economic Valuation**:

### 2.1 Unit Scaling ($10^{12}$ Base Factor)
* $1 \text{ Native Wei} = 10^{-18} \text{ USDC}$.
* $1 \text{ ERC-20 Raw Unit} = 10^{-6} \text{ USDC} = 10^{12} \text{ Native Wei}$.
* Scaling factor:
  $$\text{UNIT\_SCALE\_FACTOR} = 10^{18 - 6} = 10^{12} = 1,000,000,000,000$$

### 2.2 Economic Valuation Model
* **Current Mainnet Model:** 1:1 Parity. Because native gas and ERC-20 tokens are both USDC, the baseline exchange rate is identically $1.00$.
* **Extensible Formula:**
  $$\text{effectiveRate} = \frac{\text{USDC}}{\text{Native Token}} = 1.00$$
  If network governance or custom gas pricing applies a multiplier (e.g., a 5% relayer buffer), it is applied via an explicit rate parameter:
  $$\text{debitBaseWei} = \text{nativeGasCostWei} \times \text{economicMultiplier}$$

---

## 3. Receipt-Derived Gas Cost Calculation Formula
Given a confirmed Arc mainnet transaction receipt:
$$\text{nativeGasCostWei} = \text{receipt.gasUsed} \times \text{receipt.effectiveGasPrice}$$

### Example from Live Arc Mainnet:
* `gasUsed` = ~`80,000` gas units (standard EIP-3009 transfer).
* `effectiveGasPrice` = `20,000,000,000` wei (`20.00 Gwei`).
* $\text{nativeGasCostWei} = 80,000 \times 20,000,000,000 = 1,600,000,000,000,000 \text{ wei}$.
* In human-readable native USDC: $\frac{1,600,000,000,000,000}{10^{18}} = 0.0016 \text{ USDC}$ ($0.16$ cents).

---

## 4. Conservative Ceiling Rounding Algorithm
Converting from 18-decimal integer wei to 6-decimal integer token units incurs potential fractional remainders. To guarantee that the sponsor campaign always covers the complete gas expense without eroding the relayer's gas reserve, the conversion MUST use **Integer Ceiling Division**:

### Mathematical Formula:
$$\text{usdcDebitUnits} = \left\lceil \frac{\text{nativeGasCostWei}}{\text{UNIT\_SCALE\_FACTOR}} \right\rceil = \left\lfloor \frac{\text{nativeGasCostWei} + \text{UNIT\_SCALE\_FACTOR} - 1}{\text{UNIT\_SCALE\_FACTOR}} \right\rfloor$$

### In TypeScript / BigInt:
```typescript
export const UNIT_SCALE_FACTOR = 1_000_000_000_000n; // 10^12

export function nativeWeiToUsdcCeiling(
  nativeGasCostWei: bigint,
  economicMultiplierBasisPoints: bigint = 10_000n // 100.00%
): bigint {
  if (nativeGasCostWei <= 0n) return 0n;

  // Apply economic multiplier if non-standard (e.g. 10_500n for 105% buffer)
  const adjustedWei = (nativeGasCostWei * economicMultiplierBasisPoints + 9_999n) / 10_000n;

  // Integer ceiling division by 10^12
  return (adjustedWei + UNIT_SCALE_FACTOR - 1n) / UNIT_SCALE_FACTOR;
}
```

### Boundary Examples:
1. `1,000,000,000,000 wei` ($10^{12}$) $\rightarrow$ `1` raw unit ($0.000001 USDC). (Exact)
2. `1,000,000,000,001 wei` ($10^{12} + 1$) $\rightarrow$ `2` raw units ($0.000002 USDC). (Ceiling rounded up)
3. `1,600,000,000,000,000 wei` $\rightarrow$ `1,600` raw units ($0.001600 USDC). (Exact)

---

## 5. Architectural Invariants
1. **Never Mix Units:** Variables and database columns must explicitly denote their unit in their identifier (e.g., `gas_used_native_wei`, `actual_cost_usdc_units`).
2. **Zero Floating-Point Math:** All financial and gas accounting must execute using arbitrary-precision integers (`BigInt` / `numeric` in SQL).
3. **Transparent Sponsorship Receipts:** The confirmed receipt must display both the exact native gas burned (wei / Gwei) and the final settled 6-decimal USDC debit.
