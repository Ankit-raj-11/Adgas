import { type FastifyPluginAsync } from 'fastify';
import { isAddress } from 'viem';
import {
  ARC_USDC_ADDRESS,
  USDC_EIP3009_ABI,
  ARC_MAINNET_EXPLORER,
} from '@adgas/shared';
import { CampaignAccountingEngine } from '../services/accountingEngine.js';
import { TransactionRecoveryManager } from '../services/recoveryManager.js';

export interface RelayRouteOptions {
  arcClient: any;
  db: any;
  accountingEngine?: CampaignAccountingEngine;
  recoveryManager?: TransactionRecoveryManager;
}

export const relayRoutes: FastifyPluginAsync<RelayRouteOptions> = async (app, opts) => {
  const { arcClient, db } = opts;

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
    };
  }>('/api/relay/transfer', async (request, reply) => {
    const { attestationNonce, authorization } = request.body || {};

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

    // 1. Attestation Verification
    const attestation = db?.getAttestation ? await db.getAttestation(attestationNonce) : null;
    if (!attestation || attestation.status !== 'issued') {
      return reply.status(400).send({
        error: 'AttestationError',
        message: 'INVALID_ATTESTATION: Attestation not found or already consumed',
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (attestation.expiryTimestamp < nowSec) {
      return reply.status(400).send({
        error: 'AttestationError',
        message: 'INVALID_ATTESTATION: Attestation has expired',
      });
    }

    // 2. Exact Parameter Binding Verification
    if (
      attestation.userAddress.toLowerCase() !== from.toLowerCase() ||
      attestation.recipientAddress.toLowerCase() !== to.toLowerCase() ||
      BigInt(attestation.amountUsdcUnits) !== BigInt(value)
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

    // 4. Contract State Verification: authorizationState(from, nonce)
    const authState = await arcClient.publicClient.readContract({
      address: ARC_USDC_ADDRESS,
      abi: USDC_EIP3009_ABI,
      functionName: 'authorizationState',
      args: [from, nonce],
    });

    if (authState !== 0) {
      return reply.status(400).send({
        error: 'AuthorizationError',
        message: 'AUTHORIZATION_ALREADY_USED: This authorization nonce has already been consumed on-chain',
      });
    }

    // 5. Pre-flight Gas Reservation
    const gasLimit = 100_000n; // Standard allowance for EIP-3009 transfer
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
      recipientAddress: to,
      amountUsdc: BigInt(value),
      relayerAddress: arcClient.relayerAccount?.address || '0x0000000000000000000000000000000000000000',
      relayerNonce: 0,
      reservedCostUsdc: reservation.reservedCostUsdc,
    });

    // 7. Simulation on Arc Mainnet
    try {
      await arcClient.publicClient.simulateContract({
        address: ARC_USDC_ADDRESS,
        abi: USDC_EIP3009_ABI,
        functionName: 'transferWithAuthorization',
        args: [from, to, BigInt(value), BigInt(validAfter), BigInt(validBefore), nonce, v, r, s],
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

    // 8. Atomic Nonce Consumption
    if (db?.consumeAttestation) {
      await db.consumeAttestation(attestationNonce);
    }

    // 9. Raw On-Chain Broadcast
    let txHash: `0x${string}`;
    try {
      txHash = await arcClient.walletClient.writeContract({
        address: ARC_USDC_ADDRESS,
        abi: USDC_EIP3009_ABI,
        functionName: 'transferWithAuthorization',
        args: [from, to, BigInt(value), BigInt(validAfter), BigInt(validBefore), nonce, v, r, s],
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

    // 10. Wait for Confirmation & Receipt Settlement
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
