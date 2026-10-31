/**
 * Arc Mainnet Contract Constants and ABIs
 */

declare const process: any;

export const ARC_MAINNET_CHAIN_ID = (typeof process !== 'undefined' && process?.env && (process.env.ARC_CHAIN_ID || process.env.NEXT_PUBLIC_ARC_CHAIN_ID))
  ? Number(process.env.ARC_CHAIN_ID || process.env.NEXT_PUBLIC_ARC_CHAIN_ID)
  : 5042002;

export const ARC_MAINNET_RPC = (typeof process !== 'undefined' && process?.env && (process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL))
  ? (process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL)
  : 'https://rpc.testnet.arc.network';

export const ARC_MAINNET_EXPLORER = (typeof process !== 'undefined' && process?.env && (process.env.ARC_EXPLORER_URL || process.env.NEXT_PUBLIC_ARC_EXPLORER_URL))
  ? (process.env.ARC_EXPLORER_URL || process.env.NEXT_PUBLIC_ARC_EXPLORER_URL)
  : 'https://testnet.arcscan.app';

export const ARC_USDC_ADDRESS = ((typeof process !== 'undefined' && process?.env && (process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS))
  ? (process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS)
  : '0x3600000000000000000000000000000000000000') as `0x${string}`;

/**
 * Deployed AdgasSponsorVault on Arc Testnet
 */
export const ADGAS_VAULT_ADDRESS = (typeof process !== 'undefined' && process?.env && (process.env.ADGAS_VAULT_ADDRESS || process.env.NEXT_PUBLIC_ADGAS_VAULT_ADDRESS)
  ? (process.env.ADGAS_VAULT_ADDRESS || process.env.NEXT_PUBLIC_ADGAS_VAULT_ADDRESS)
  : '0x2068372b91fa992ac01277f27835244530a46299') as `0x${string}`;

export const USDC_EIP3009_ABI = [
  // EIP-3009 Methods
  {
    type: 'function',
    name: 'transferWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'receiveWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'authorizationState',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  // Standard ERC-20 Methods
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

/**
 * AdgasSponsorVault Contract ABI
 */
export const ADGAS_VAULT_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_usdc', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createCampaign',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'maxGasPerTxUsdc', type: 'uint256' },
      { name: 'cumulativeSpendLimitUsdc', type: 'uint256' },
      { name: 'initialAttester', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCampaignAttester',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'attester', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isAttesterAuthorizedForCampaign',
    stateMutability: 'view',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'attester', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'depositBudget',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'amountUsdc', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'depositBudgetWithReceiveAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      {
        name: 'auth',
        type: 'tuple',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeSponsoredTransfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      {
        name: 'auth',
        type: 'tuple',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
      {
        name: 'attestation',
        type: 'tuple',
        components: [
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
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'computeSettlementId',
    stateMutability: 'pure',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'totalEscrowBalanceUsdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'calculateUsdcGasCeiling',
    stateMutability: 'pure',
    inputs: [{ name: 'nativeWeiGasCost', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'executedSettlements',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'executedAttestations',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'withdrawRemaining',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'amountUsdc', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCampaignStatus',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'isActive', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCampaignMaxGas',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'newMaxGasPerTxUsdc', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getCampaign',
    stateMutability: 'view',
    inputs: [{ name: 'campaignId', type: 'bytes32' }],
    outputs: [
      { name: 'sponsor', type: 'address' },
      { name: 'availableBalanceUsdc', type: 'uint256' },
      { name: 'totalFundedUsdc', type: 'uint256' },
      { name: 'settledGasUsdc', type: 'uint256' },
      { name: 'maxGasPerTxUsdc', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'authorizedRelayers',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'sweepUnallocatedTokens',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

/**
 * EIP-712 Attestation Domain Typehash (matches EIP-712 standard and AdgasSponsorVault.sol)
 */
export const DOMAIN_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f' as const;

/**
 * EIP-3009 ReceiveWithAuthorization Typehash (matches AdgasSponsorVault.sol & Arc USDC)
 */
export const RECEIVE_WITH_AUTHORIZATION_TYPEHASH = '0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8' as const;

/**
 * EIP-3009 TransferWithAuthorization Typehash
 */
export const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = '0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267' as const;

/**
 * EIP-712 SponsorshipAttestation Typehash (matches AdgasSponsorVault.sol SPONSORSHIP_ATTESTATION_TYPEHASH)
 */
export const SPONSORSHIP_ATTESTATION_TYPEHASH = '0x4aeb3ffa3c9952cb8395da3bb98fc1a633c52d044cb1ebd151818b55ca4c1667' as const;

/**
 * EIP-712 Domain and Type Schemas for USDC EIP-3009 (both ReceiveWithAuthorization and TransferWithAuthorization)
 */
export const EIP3009_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: ARC_MAINNET_CHAIN_ID,
  verifyingContract: ARC_USDC_ADDRESS,
} as const;

export const EIP3009_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;
