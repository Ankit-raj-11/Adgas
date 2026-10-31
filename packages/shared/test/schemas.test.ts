import { describe, it, expect } from 'vitest';
import { keccak256, toHex, stringToBytes } from 'viem';
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  EIP3009_DOMAIN,
  EIP3009_TYPES,
  RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
  TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
  SPONSORSHIP_ATTESTATION_TYPEHASH,
  DOMAIN_TYPEHASH,
  getAdgasVaultDomain,
  SPONSORSHIP_ATTESTATION_TYPES,
  buildReceiveWithAuthorizationTypedData,
  buildSponsorshipAttestationTypedData,
} from '../src/index.js';

describe('Architecture A: EIP-712 & EIP-3009 Schemas and Typehash Synchronization', () => {
  it('verifies DOMAIN_TYPEHASH matches EIP-712 standard specification', () => {
    const expected = keccak256(
      stringToBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    );
    expect(DOMAIN_TYPEHASH).toBe(expected);
    expect(DOMAIN_TYPEHASH).toBe('0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f');
  });

  it('verifies RECEIVE_WITH_AUTHORIZATION_TYPEHASH matches AdgasSponsorVault & Arc USDC', () => {
    const expected = keccak256(
      stringToBytes(
        'ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)'
      )
    );
    expect(RECEIVE_WITH_AUTHORIZATION_TYPEHASH).toBe(expected);
    expect(RECEIVE_WITH_AUTHORIZATION_TYPEHASH).toBe(
      '0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8'
    );
  });

  it('verifies TRANSFER_WITH_AUTHORIZATION_TYPEHASH matches EIP-3009 standard', () => {
    const expected = keccak256(
      stringToBytes(
        'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)'
      )
    );
    expect(TRANSFER_WITH_AUTHORIZATION_TYPEHASH).toBe(expected);
    expect(TRANSFER_WITH_AUTHORIZATION_TYPEHASH).toBe(
      '0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267'
    );
  });

  it('verifies SPONSORSHIP_ATTESTATION_TYPEHASH matches AdgasSponsorVault.sol exactly', () => {
    const expected = keccak256(
      stringToBytes(
        'SponsorshipAttestation(bytes32 campaignId,address user,address recipient,uint256 amountUsdc,bytes32 userNonce,uint256 validAfter,uint256 validBefore,uint256 maxGasReimbursementUsdc,uint256 expiry,bytes32 attestationNonce,address relayer)'
      )
    );
    expect(SPONSORSHIP_ATTESTATION_TYPEHASH).toBe(expected);
    expect(SPONSORSHIP_ATTESTATION_TYPEHASH).toBe(
      '0x4aeb3ffa3c9952cb8395da3bb98fc1a633c52d044cb1ebd151818b55ca4c1667'
    );
  });

  it('verifies EIP3009_TYPES contains both ReceiveWithAuthorization and TransferWithAuthorization', () => {
    expect(EIP3009_TYPES.ReceiveWithAuthorization).toBeDefined();
    expect(EIP3009_TYPES.ReceiveWithAuthorization).toEqual([
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ]);

    expect(EIP3009_TYPES.TransferWithAuthorization).toBeDefined();
  });

  it('verifies SPONSORSHIP_ATTESTATION_TYPES fields align with AdgasSponsorVault struct', () => {
    expect(SPONSORSHIP_ATTESTATION_TYPES.SponsorshipAttestation).toEqual([
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
    ]);
  });

  it('verifies buildReceiveWithAuthorizationTypedData binds to vault address and parameters', () => {
    const vaultAddress = '0x1234567890123456789012345678901234567890' as const;
    const userAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
    const nonce = ('0x' + '1'.repeat(64)) as `0x${string}`;

    const typedData = buildReceiveWithAuthorizationTypedData({
      vaultAddress,
      from: userAddress,
      value: 1_000_000n,
      validAfter: 0n,
      validBefore: 1800000000n,
      nonce,
    });

    expect(typedData.primaryType).toBe('ReceiveWithAuthorization');
    expect(typedData.domain.verifyingContract).toBe(ARC_USDC_ADDRESS);
    expect(typedData.domain.chainId).toBe(ARC_MAINNET_CHAIN_ID);
    expect(typedData.domain.name).toBe('USDC');
    expect(typedData.domain.version).toBe('2');
    expect(typedData.message.to).toBe(vaultAddress);
    expect(typedData.message.from).toBe(userAddress);
    expect(typedData.message.value).toBe(1_000_000n);
    expect(typedData.message.nonce).toBe(nonce);
  });

  it('verifies buildSponsorshipAttestationTypedData binds to vault address, chainId and types', () => {
    const vaultAddress = '0x1234567890123456789012345678901234567890' as const;
    const campaignId = ('0x' + 'c'.repeat(64)) as `0x${string}`;
    const user = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
    const recipient = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
    const userNonce = ('0x' + '1'.repeat(64)) as `0x${string}`;
    const attestationNonce = ('0x' + '2'.repeat(64)) as `0x${string}`;
    const relayer = '0x9999999999999999999999999999999999999999' as const;

    const typedData = buildSponsorshipAttestationTypedData({
      vaultAddress,
      campaignId,
      user,
      recipient,
      amountUsdc: 5_000_000n,
      userNonce,
      validAfter: 100n,
      validBefore: 200n,
      maxGasReimbursementUsdc: 10_000n,
      expiry: 300n,
      attestationNonce,
      relayer,
    });

    expect(typedData.primaryType).toBe('SponsorshipAttestation');
    expect(typedData.domain.verifyingContract).toBe(vaultAddress);
    expect(typedData.domain.chainId).toBe(ARC_MAINNET_CHAIN_ID);
    expect(typedData.domain.name).toBe('AdgasProtocol');
    expect(typedData.domain.version).toBe('1');
    expect(typedData.message.campaignId).toBe(campaignId);
    expect(typedData.message.relayer).toBe(relayer);
    expect(typedData.message.attestationNonce).toBe(attestationNonce);
  });
});

