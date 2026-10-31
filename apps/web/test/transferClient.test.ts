import { describe, it, expect } from 'vitest';
import {
  formatUsdcUnits,
  parseUsdcUnits,
  generateEip3009Nonce,
  buildEip3009TypedData,
  buildReceiveWithAuthorizationTypedData,
  splitSignatureBytes,
} from '../src/lib/transferClient';
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  ADGAS_VAULT_ADDRESS,
  EIP3009_TYPES,
} from '@adgas/shared';

describe('transferClient utilities - Architecture A Front-Running Immune Flow', () => {
  it('parses human USDC input into 6-decimal units', () => {
    expect(parseUsdcUnits('1')).toBe(1_000_000n);
    expect(parseUsdcUnits('10.5')).toBe(10_500_000n);
    expect(parseUsdcUnits('0.000001')).toBe(1n);
    expect(parseUsdcUnits('100.25')).toBe(100_250_000n);
    expect(() => parseUsdcUnits('invalid')).toThrow();
    expect(() => parseUsdcUnits('-5')).toThrow();
  });

  it('formats 6-decimal USDC units into human-readable string', () => {
    expect(formatUsdcUnits(1_000_000n)).toBe('1');
    expect(formatUsdcUnits(10_500_000n)).toBe('10.5');
    expect(formatUsdcUnits(1n)).toBe('0.000001');
  });

  it('generates cryptographically random 32-byte nonces formatted as 0x hex', () => {
    const nonce1 = generateEip3009Nonce();
    const nonce2 = generateEip3009Nonce();

    expect(nonce1).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(nonce2).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(nonce1).not.toBe(nonce2);
  });

  it('builds ReceiveWithAuthorization typed data where recipient "to" is strictly the Vault address', () => {
    const from = '0x1111111111111111111111111111111111111111' as const;
    const customVault = '0x9999999999999999999999999999999999999999' as const;
    const value = 5_000_000n;
    const nonce = generateEip3009Nonce();
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

    const typedData = buildReceiveWithAuthorizationTypedData({
      vaultAddress: customVault,
      from,
      value,
      validAfter,
      validBefore,
      nonce,
    });

    expect(typedData.domain.chainId).toBe(ARC_MAINNET_CHAIN_ID);
    expect(typedData.domain.verifyingContract).toBe(ARC_USDC_ADDRESS);
    expect(typedData.domain.name).toBe('USDC');
    expect(typedData.domain.version).toBe('2');
    expect(typedData.primaryType).toBe('ReceiveWithAuthorization');
    expect(typedData.types.ReceiveWithAuthorization).toEqual(EIP3009_TYPES.ReceiveWithAuthorization);
    expect(typedData.message.from).toBe(from);
    expect(typedData.message.to).toBe(customVault);
    expect(typedData.message.value).toBe(value);
    expect(typedData.message.validAfter).toBe(validAfter);
    expect(typedData.message.validBefore).toBe(validBefore);
    expect(typedData.message.nonce).toBe(nonce);
  });

  it('buildEip3009TypedData defaults to ReceiveWithAuthorization with vault address', () => {
    const from = '0x1111111111111111111111111111111111111111' as const;
    const recipient = '0x2222222222222222222222222222222222222222' as const;
    const value = 5_000_000n;
    const nonce = generateEip3009Nonce();
    const validBefore = Math.floor(Date.now() / 1000) + 300;

    const typedData = buildEip3009TypedData({
      from,
      to: recipient,
      value,
      validAfter: 0,
      validBefore,
      nonce,
      type: 'ReceiveWithAuthorization',
      vaultAddress: '0x9999999999999999999999999999999999999999',
    });

    expect(typedData.primaryType).toBe('ReceiveWithAuthorization');
    expect(typedData.message.to).toBe('0x9999999999999999999999999999999999999999');
    expect(typedData.message.from).toBe(from);
    expect(typedData.message.value).toBe(value);
    expect(typedData.message.nonce).toBe(nonce);
  });

  it('splits 65-byte hex signature into v, r, s', () => {
    // 65 bytes signature = 130 hex chars + 0x = 132 chars
    const dummySig = `0x${'aa'.repeat(32)}${'bb'.repeat(32)}1b` as `0x${string}`;
    const { r, s, v } = splitSignatureBytes(dummySig);

    expect(r).toBe(`0x${'aa'.repeat(32)}`);
    expect(s).toBe(`0x${'bb'.repeat(32)}`);
    expect(v).toBe(27);
  });
});
