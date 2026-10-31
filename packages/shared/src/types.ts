/**
 * Core Shared Data Models & Schemas
 */

import {
  ARC_MAINNET_CHAIN_ID,
  EIP3009_DOMAIN,
  EIP3009_TYPES,
} from './contracts.js';

export type CampaignStatus = 'active' | 'paused' | 'depleted';

export interface Campaign {
  id: string;
  sponsorAddress: `0x${string}`;
  name: string;
  totalFundedUsdcUnits: bigint; // 6 decimals
  availableBalanceUsdcUnits: bigint;
  reservedBalanceUsdcUnits: bigint;
  settledSpendUsdcUnits: bigint;
  maxGasPerTxUsdcUnits: bigint;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AttestationStatus = 'issued' | 'consumed' | 'expired';

export interface Attestation {
  nonce: string; // UUID v4
  campaignId: string;
  userAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountUsdcUnits: bigint;
  expiryTimestamp: number; // Unix seconds
  status: AttestationStatus;
  signature: `0x${string}`;
  createdAt: Date;
}

export type TransactionAttemptStatus =
  | 'pending_broadcast'
  | 'broadcasting'
  | 'submitted'
  | 'confirmed'
  | 'failed_onchain'
  | 'dropped';

export interface TransactionAttempt {
  id: string;
  attestationNonce: string;
  campaignId: string;
  userAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountUsdcUnits: bigint;
  relayerAddress: `0x${string}`;
  relayerNonce: number;
  status: TransactionAttemptStatus;
  txHash?: `0x${string}`;
  gasUsedNativeWei?: bigint;
  gasPriceNativeWei?: bigint;
  actualCostUsdcUnits?: bigint;
  blockNumber?: number;
  submittedAt: Date;
  confirmedAt?: Date;
  failureReason?: string;
}

export interface SponsorshipReceipt {
  txHash: `0x${string}`;
  blockNumber: number;
  userAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountUsdc: string;
  sponsorName: string;
  gasCostNativeUsdc: string;
  gasPriceGwei: string;
  campaignDebitedUsdc: string;
  attestationNonce: string;
  explorerUrl: string;
  confirmedAt: string;
}

/**
 * Server EIP-712 Attestation Domain and Types
 */
export const ADGAS_ATTESTATION_DOMAIN = {
  name: 'AdgasProtocol',
  version: '1',
  chainId: ARC_MAINNET_CHAIN_ID,
} as const;

export const ADGAS_ATTESTATION_TYPES = {
  AdgasAttestation: [
    { name: 'campaignId', type: 'string' },
    { name: 'user', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amountUsdcUnits', type: 'uint256' },
    { name: 'nonce', type: 'string' },
    { name: 'expiryTimestamp', type: 'uint256' },
  ],
} as const;

/**
 * On-Chain AdgasSponsorVault EIP-712 SponsorshipAttestation Types and Domain
 */
export const SPONSORSHIP_ATTESTATION_TYPES = {
  SponsorshipAttestation: [
    { name: 'campaignId', type: 'bytes32' },
    { name: 'user', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amountUsdc', type: 'uint256' },
    { name: 'userNonce', type: 'bytes32' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'maxGasReimbursementUsdc', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'attestationNonce', type: 'bytes32' },
    { name: 'relayer', type: 'address' },
  ],
} as const;

export const getAdgasVaultDomain = (verifyingContract: `0x${string}`, chainId: number = ARC_MAINNET_CHAIN_ID) => ({
  name: 'AdgasProtocol',
  version: '1',
  chainId,
  verifyingContract,
} as const);

export interface OnChainAuthorizationParams {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export interface OnChainSponsorshipAttestation {
  campaignId: `0x${string}`;
  user: `0x${string}`;
  recipient: `0x${string}`;
  amountUsdc: bigint;
  userNonce: `0x${string}`;
  validAfter: bigint;
  validBefore: bigint;
  maxGasReimbursementUsdc: bigint;
  expiry: bigint;
  attestationNonce: `0x${string}`;
  relayer: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export interface BuildReceiveWithAuthorizationParams {
  vaultAddress: `0x${string}`;
  from: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
  chainId?: number;
}

export function buildReceiveWithAuthorizationTypedData(params: BuildReceiveWithAuthorizationParams) {
  return {
    domain: {
      ...EIP3009_DOMAIN,
      chainId: params.chainId || EIP3009_DOMAIN.chainId,
    },
    types: {
      ReceiveWithAuthorization: EIP3009_TYPES.ReceiveWithAuthorization,
    },
    primaryType: 'ReceiveWithAuthorization' as const,
    message: {
      from: params.from,
      to: params.vaultAddress,
      value: params.value,
      validAfter: params.validAfter,
      validBefore: params.validBefore,
      nonce: params.nonce,
    },
  };
}

export interface BuildSponsorshipAttestationParams {
  vaultAddress: `0x${string}`;
  chainId?: number;
  campaignId: `0x${string}`;
  user: `0x${string}`;
  recipient: `0x${string}`;
  amountUsdc: bigint;
  userNonce: `0x${string}`;
  validAfter: bigint;
  validBefore: bigint;
  maxGasReimbursementUsdc: bigint;
  expiry: bigint;
  attestationNonce: `0x${string}`;
  relayer: `0x${string}`;
}

export function buildSponsorshipAttestationTypedData(params: BuildSponsorshipAttestationParams) {
  return {
    domain: getAdgasVaultDomain(params.vaultAddress, params.chainId || ARC_MAINNET_CHAIN_ID),
    types: SPONSORSHIP_ATTESTATION_TYPES,
    primaryType: 'SponsorshipAttestation' as const,
    message: {
      campaignId: params.campaignId,
      user: params.user,
      recipient: params.recipient,
      amountUsdc: params.amountUsdc,
      userNonce: params.userNonce,
      validAfter: params.validAfter,
      validBefore: params.validBefore,
      maxGasReimbursementUsdc: params.maxGasReimbursementUsdc,
      expiry: params.expiry,
      attestationNonce: params.attestationNonce,
      relayer: params.relayer,
    },
  };
}
