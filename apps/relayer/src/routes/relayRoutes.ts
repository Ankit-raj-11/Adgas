import { type FastifyPluginAsync } from 'fastify';
import { isAddress } from 'viem';
import {
  ARC_USDC_ADDRESS,
  USDC_EIP3009_ABI,
  ADGAS_VAULT_ABI,
  ADGAS_VAULT_ADDRESS,
  ARC_MAINNET_EXPLORER,
} from '@adgas/shared';
import { CampaignAccountingEngine } from '../services/accountingEngine.js';
import { TransactionRecoveryManager } from '../services/recoveryManager.js';

export interface RelayRouteOptions {
  arcClient: any;
  vaultAddress?: `0x${string}`;
  db?: any;
  accountingEngine?: CampaignAccountingEngine;
  recoveryManager?: TransactionRecoveryManager;
}

export const relayRoutes: FastifyPluginAsync<RelayRouteOptions> = async (app, opts) => {
  const { arcClient, db } = opts;
  const vaultAddress = opts.vaultAddress || ADGAS_VAULT_ADDRESS;

  const accountingEngine = opts.accountingEngine || new CampaignAccountingEngine({
    getCampaign: async (id) => db?.getCampaign ? db.getCampaign(id) : null,
    updateBalances: async (id, updates) => db?.updateBalances ? db.updateBalances(id, updates) : undefined,
  });

  const recoveryManager = opts.recoveryManager || new TransactionRecoveryManager({
    rpc: {
      getTransactionReceipt: (p) => arcClient.publicClient.getTransactionReceipt(p),
      getTransactionCount: (p) => arcClient.publicClient.getTransactionCount(p),
    },
    db: {
      persistAttempt: (r) => db?.persistAttempt ? db.persistAttempt(r) : Promise.resolve(r),
      updateAttempt: (id, u) => db?.updateAttempt ? db.updateAttempt(id, u) : Promise.resolve(),
      getPendingAttempts: () => db?.getPendingAttempts ? db.getPendingAttempts() : Promise.resolve([]),
    },
    accounting: accountingEngine,
  });

  app.post<{
    Body: {
      attestationNonce?: string;
      campaignId?: string;
      attestation?: any;
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
    };
  }>('/api/relay/transfer', async (request, reply) => {
    const { attestationNonce: reqNonce, campaignId: reqCampaignId, attestation: reqAttestation, authorization } = request.body || {};
    const attestationNonce = reqNonce || reqAttestation?.attestationNonce || reqAttestation?.nonce;

    if (!attestationNonce || !authorization) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Missing required parameters: attestationNonce, authorization',
      });
    }

    const { from, to, value, validAfter, validBefore, nonce, v, r, s } = authorization;

    if (!isAddress(from) || !isAddress(to)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid EVM address in authorization',
      });
    }

    // Front-running immune routing (Architecture A):
    // The user signs receiveWithAuthorization with to = ADGAS_VAULT_ADDRESS
    if (vaultAddress && to.toLowerCase() !== vaultAddress.toLowerCase()) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'INVALID_RECIPIENT: Authorization recipient must be AdgasSponsorVault',
      });
    }

    // 1. Attestation Verification
    let attestation = db?.getAttestation ? await db.getAttestation(attestationNonce) : null;
    if (!attestation && reqAttestation) {
      attestation = reqAttestation;
    }

    if (!attestation || attestation.status !== 'issued') {
      return reply.status(400).send({
        error: 'AttestationError',
        message: 'INVALID_ATTESTATION: Attestation not found or already consumed',
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expiryTimestamp = Number(attestation.expiry ?? attestation.expiryTimestamp ?? 0);
    if (expiryTimestamp < nowSec) {
      return reply.status(400).send({
        error: 'AttestationError',
        message: 'INVALID_ATTESTATION: Attestation has expired',
      });
    }

    // 2. Exact Parameter Binding Verification
    const expectedUser = (attestation.user || attestation.userAddress).toLowerCase();
    const expectedAmount = BigInt(attestation.amountUsdc || attestation.amountUsdcUnits);
    if (
      expectedUser !== from.toLowerCase() ||
      expectedAmount !== BigInt(value)
    ) {
      return reply.status(400).send({
        error: 'AttestationError',
        message: 'ATTESTATION_PARAMETER_MISMATCH: Authorization parameters do not match signed attestation',
      });
    }

    // 3. Authorization Window Verification
    if (nowSec < validAfter || nowSec > validBefore) {
      return reply.status(400).send({
        error: 'AuthorizationError',
        message: 'AUTHORIZATION_EXPIRED: Current time outside valid authorization window',
      });
    }

    // 4. Contract State Verification: authorizationState(from, nonce) on Arc USDC
    const authState = await arcClient.publicClient.readContract({
      address: ARC_USDC_ADDRESS,
      abi: USDC_EIP3009_ABI,
      functionName: 'authorizationState',
      args: [from, nonce],
    });

    const isUsed = typeof authState === 'boolean' ? authState : Boolean(authState);
    if (isUsed) {
      return reply.status(400).send({
        error: 'AuthorizationError',
        message: 'AUTHORIZATION_ALREADY_USED: This authorization nonce has already been consumed on-chain',
      });
    }

    // 5. Pre-flight Gas Reservation
    const gasLimit = 150_000n; // Standard allowance for vault execution + transfer
    const maxFeePerGas = 25_000_000_000n; // 25 Gwei

    let reservation;
    try {
      reservation = await accountingEngine.reserveGas({
        campaignId: attestation.campaignId,
        gasLimit,
        maxFeePerGas,
      });
    } catch (err: any) {
      return reply.status(400).send({
        error: 'AccountingError',
        message: err.message,
      });
    }

    // 6. Pre-Broadcast Persistence
    const attempt = await recoveryManager.createPreBroadcastAttempt({
      attestationNonce,
      campaignId: attestation.campaignId,
      userAddress: from,
      recipientAddress: attestation.recipient || attestation.recipientAddress,
      amountUsdc: BigInt(value),
      relayerAddress: arcClient.relayerAccount?.address || '0x0000000000000000000000000000000000000000',
      relayerNonce: 0,
      reservedCostUsdc: reservation.reservedCostUsdc,
    });

    // 7. Prepare On-Chain Vault Tuples
    const authTuple = {
      from: from as `0x${string}`,
      to: (vaultAddress || to) as `0x${string}`,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce as `0x${string}`,
      v: Number(v),
      r: r as `0x${string}`,
      s: s as `0x${string}`,
    };

    const attestationTuple = {
      campaignId: (attestation.campaignIdBytes32 || attestation.campaignId) as `0x${string}`,
      user: (attestation.user || attestation.userAddress) as `0x${string}`,
      recipient: (attestation.recipient || attestation.recipientAddress) as `0x${string}`,
      amountUsdc: BigInt(attestation.amountUsdc || attestation.amountUsdcUnits),
      userNonce: (attestation.userNonce || nonce) as `0x${string}`,
      validAfter: BigInt(attestation.validAfter ?? validAfter),
      validBefore: BigInt(attestation.validBefore ?? validBefore),
      maxGasReimbursementUsdc: BigInt(attestation.maxGasReimbursementUsdc || 50_000),
      expiry: BigInt(expiryTimestamp),
      attestationNonce: (attestation.attestationNonce || attestation.nonce) as `0x${string}`,
      relayer: (attestation.relayer || arcClient.relayerAccount?.address) as `0x${string}`,
      v: Number(attestation.v ?? 27),
      r: (attestation.r || '0x' + '0'.repeat(64)) as `0x${string}`,
      s: (attestation.s || '0x' + '0'.repeat(64)) as `0x${string}`,
    };

    // 8. Simulation on Arc Mainnet via AdgasSponsorVault.executeSponsoredTransfer
    try {
      await arcClient.publicClient.simulateContract({
        address: vaultAddress,
        abi: ADGAS_VAULT_ABI,
        functionName: 'executeSponsoredTransfer',
        args: [attestationTuple.campaignId, authTuple, attestationTuple],
        account: arcClient.relayerAccount,
      });
    } catch (simErr: any) {
      await accountingEngine.releaseReservation({
        campaignId: attestation.campaignId,
        reservationId: reservation.reservationId,
        reservedCostUsdc: reservation.reservedCostUsdc,
      });
      return reply.status(400).send({
        error: 'SimulationError',
        message: `SIMULATION_FAILED: ${simErr.message}`,
      });
    }

    // 9. Atomic Nonce Consumption
    if (db?.consumeAttestation) {
      await db.consumeAttestation(attestationNonce);
    }

    // 10. Raw On-Chain Broadcast via AdgasSponsorVault.executeSponsoredTransfer
    let txHash: `0x${string}`;
    try {
      txHash = await arcClient.walletClient.writeContract({
        address: vaultAddress,
        abi: ADGAS_VAULT_ABI,
        functionName: 'executeSponsoredTransfer',
        args: [attestationTuple.campaignId, authTuple, attestationTuple],
        account: arcClient.relayerAccount,
      });

      await recoveryManager.recordBroadcast(attempt.id, txHash);
    } catch (broadcastErr: any) {
      await accountingEngine.releaseReservation({
        campaignId: attestation.campaignId,
        reservationId: reservation.reservationId,
        reservedCostUsdc: reservation.reservedCostUsdc,
      });
      return reply.status(500).send({
        error: 'BroadcastError',
        message: `BROADCAST_FAILED: ${broadcastErr.message}`,
      });
    }

    // 11. Wait for Confirmation & Receipt Settlement
    const receipt = await arcClient.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    const gasUsed = BigInt(receipt.gasUsed);
    const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
    const blockNumber = BigInt(receipt.blockNumber);

    const settlement = await accountingEngine.settleGas({
      campaignId: attestation.campaignId,
      reservationId: reservation.reservationId,
      reservedCostUsdc: reservation.reservedCostUsdc,
      gasUsed,
      effectiveGasPrice,
    });

    const explorerUrl = `${ARC_MAINNET_EXPLORER}/tx/${txHash}`;
    const isSuccess = receipt.status === 'success' || receipt.status === '0x1' || receipt.status === 1;

    if (!isSuccess) {
      return reply.status(502).send({
        status: 'failed_onchain',
        error: 'ExecutionReverted',
        message: 'TRANSACTION_REVERTED: The sponsored transfer reverted on-chain during execution',
        txHash,
        blockNumber: blockNumber.toString(),
        actualCostUsdc: settlement.actualCostUsdc.toString(),
        nativeGasCostWei: settlement.nativeGasCostWei.toString(),
        unspentRefundUsdc: settlement.unspentRefundUsdc.toString(),
        explorerUrl,
      });
    }

    return reply.status(200).send({
      status: 'confirmed',
      txHash,
      blockNumber: blockNumber.toString(),
      actualCostUsdc: settlement.actualCostUsdc.toString(),
      nativeGasCostWei: settlement.nativeGasCostWei.toString(),
      unspentRefundUsdc: settlement.unspentRefundUsdc.toString(),
      explorerUrl,
    });
  });
};
