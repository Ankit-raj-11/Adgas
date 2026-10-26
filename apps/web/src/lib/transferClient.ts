import { parseUnits, formatUnits, parseSignature } from 'viem';
import {
  EIP3009_DOMAIN,
  EIP3009_TYPES,
  USDC_TOKEN_DECIMALS,
} from '@adgas/shared';

export interface Eip3009AuthorizationParams {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
}

export interface SplitSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

/**
 * Parses user input USDC decimal string into 6-decimal BigInt units
 */
export function parseUsdcUnits(amountStr: string): bigint {
  const trimmed = amountStr.trim();
  if (!trimmed || isNaN(Number(trimmed)) || Number(trimmed) <= 0) {
    throw new Error('Invalid USDC transfer amount');
  }
  return parseUnits(trimmed, USDC_TOKEN_DECIMALS);
}

/**
 * Formats 6-decimal BigInt units to standard human readable string
 */
export function formatUsdcUnits(amountUnits: bigint): string {
  return formatUnits(amountUnits, USDC_TOKEN_DECIMALS);
}

/**
 * Generates a cryptographically random 32-byte nonce for EIP-3009 authorization
 */
export function generateEip3009Nonce(): `0x${string}` {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `0x${hex}`;
  }

  // Fallback for non-browser/test environments
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('');
  return `0x${hex}`;
}

/**
 * Constructs EIP-712 Typed Data structure for Wagmi/Viem signTypedData
 */
export function buildEip3009TypedData(params: Eip3009AuthorizationParams) {
  return {
    domain: EIP3009_DOMAIN,
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization' as const,
    message: {
      from: params.from,
      to: params.to,
      value: params.value,
      validAfter: BigInt(params.validAfter),
      validBefore: BigInt(params.validBefore),
      nonce: params.nonce,
    },
  };
}

/**
 * Splits a 65-byte serialized signature hex into r, s, v components
 */
export function splitSignatureBytes(signatureHex: `0x${string}`): SplitSignature {
  const parsed = parseSignature(signatureHex);
  return {
    r: parsed.r,
    s: parsed.s,
    v: Number(parsed.v ?? (parsed.yParity === 0 ? 27 : 28)),
  };
}

/**
 * Requests an ad-sponsored gas attestation from the relayer backend
 */
export async function requestGasAttestation(params: {
  relayerUrl?: string;
  campaignId: string;
  userAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountUsdcUnits: string;
  adSessionToken: string;
}): Promise<{
  attestationNonce: string;
  signature: `0x${string}`;
  expiryTimestamp: number;
  maxGasCoverageWei: string;
}> {
  const baseUrl = params.relayerUrl || process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${baseUrl}/api/attestation/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId,
      userAddress: params.userAddress,
      recipientAddress: params.recipientAddress,
      amountUsdcUnits: params.amountUsdcUnits,
      adSessionToken: params.adSessionToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Attestation failed with HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Submits signed EIP-3009 authorization and attestation to relayer for broadcast
 */
export async function submitRelayTransfer(params: {
  relayerUrl?: string;
  attestationNonce: string;
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
}): Promise<{
  success: boolean;
  txHash: `0x${string}`;
  blockNumber: number;
  explorerUrl: string;
  gasBreakdown: {
    gasUsed: string;
    effectiveGasPriceWei: string;
    actualGasCostWei: string;
    actualGasCostUsdcUnits: string;
  };
}> {
  const baseUrl = params.relayerUrl || process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
  const response = await fetch(`${baseUrl}/api/relay/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attestationNonce: params.attestationNonce,
      authorization: params.authorization,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Relay transfer failed with HTTP ${response.status}`);
  }

  return response.json();
}
