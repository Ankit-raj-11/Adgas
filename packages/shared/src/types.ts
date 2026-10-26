/**
 * Core Shared Data Models & Schemas
 */

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
  chainId: 5042,
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
