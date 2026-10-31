import { type FastifyPluginAsync } from 'fastify';
import {
  isAddress,
  getAddress,
  isHex,
  padHex,
  stringToHex,
  stringToBytes,
  keccak256,
  parseSignature,
} from 'viem';
import {
  ARC_USDC_ADDRESS,
  USDC_EIP3009_ABI,
  ADGAS_VAULT_ABI,
  ADGAS_VAULT_ADDRESS,
  ARC_MAINNET_EXPLORER,
} from '@adgas/shared';
import { CampaignAccountingEngine } from '../services/accountingEngine.js';
import { TransactionRecoveryManager } from '../services/recoveryManager.js';

/**
 * Utility to convert arbitrary string or hex to valid bytes32 (66 chars, 0x-prefixed)
 */
function toBytes32(val: string): `0x${string}` {
  if (!val) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  if (val.startsWith('0x') && val.length === 66 && isHex(val)) {
    return val as `0x${string}`;
  }
  if (isHex(val)) {
    return padHex(val as `0x${string}`, { size: 32, dir: 'right' });
  }
  const hex = stringToHex(val);
  if (hex.length <= 66) {
    return padHex(hex as `0x${string}`, { size: 32, dir: 'right' });
  }
  return keccak256(stringToBytes(val));
}

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
    if (attestation && reqAttestation) {
      // Keep DB record status while hydrating all full typed parameters & signature fields
      attestation = { ...reqAttestation, ...attestation };
    } else if (!attestation && reqAttestation) {
      attestation = reqAttestation;
    }

    if (!attestation || attestation.status !== 'issued') {
      return reply.status(400).send({
        error: 'AttestationError',
        message: 'INVALID_ATTESTATION: Attestation not found or already consumed',
      });
    }

    // Hydrate signature components (v, r, s) if missing
    if (attestation.signature && (!attestation.r || !attestation.s)) {
      try {
        const parsedSig = parseSignature(attestation.signature);
        attestation.v = Number(parsedSig.v ?? (27n + BigInt(parsedSig.yParity ?? 0)));
        attestation.r = parsedSig.r;
        attestation.s = parsedSig.s;
      } catch {
        // signature may already be split
      }
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

    // Format IDs for on-chain Solidity bytes32 vs DB string lookup
    const rawCampaignId = attestation.campaignIdBytes32 || attestation.campaignId || reqCampaignId || '';
    const campaignIdBytes32 = toBytes32(rawCampaignId);
    const dbCampaignId = attestation.originalCampaignId || attestation.campaignId || reqCampaignId;

    // 5. Pre-flight Gas Reservation
    const gasLimit = 150_000n; // Standard allowance for vault execution + transfer
    const maxFeePerGas = 25_000_000_000n; // 25 Gwei

    let reservation;
    try {
      reservation = await accountingEngine.reserveGas({
        campaignId: dbCampaignId,
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
      campaignId: dbCampaignId,
      userAddress: getAddress(from),
      recipientAddress: getAddress(attestation.recipient || attestation.recipientAddress),
      amountUsdc: BigInt(value),
      relayerAddress: arcClient.relayerAccount?.address || '0x0000000000000000000000000000000000000000',
      relayerNonce: 0,
      reservedCostUsdc: reservation.reservedCostUsdc,
    });

    // 7. Prepare On-Chain Vault Tuples with strict bytes32 and address normalization
    const authTuple = {
      from: getAddress(from) as `0x${string}`,
      to: (vaultAddress || getAddress(to)) as `0x${string}`,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: (nonce.startsWith('0x') && nonce.length === 66 ? nonce : toBytes32(nonce)) as `0x${string}`,
      v: Number(v),
      r: (r.startsWith('0x') && r.length === 66 ? r : toBytes32(r)) as `0x${string}`,
      s: (s.startsWith('0x') && s.length === 66 ? s : toBytes32(s)) as `0x${string}`,
    };

    const attestationTuple = {
      campaignId: campaignIdBytes32,
      user: getAddress(attestation.user || attestation.userAddress) as `0x${string}`,
      recipient: getAddress(attestation.recipient || attestation.recipientAddress) as `0x${string}`,
      amountUsdc: BigInt(attestation.amountUsdc || attestation.amountUsdcUnits),
      userNonce: toBytes32(attestation.userNonce || nonce),
      validAfter: BigInt(attestation.validAfter ?? validAfter),
      validBefore: BigInt(attestation.validBefore ?? validBefore),
      maxGasReimbursementUsdc: BigInt(attestation.maxGasReimbursementUsdc || 50_000),
      expiry: BigInt(expiryTimestamp),
      attestationNonce: toBytes32(attestation.attestationNonce || attestation.nonce || attestationNonce),
      relayer: getAddress(attestation.relayer || arcClient.relayerAccount?.address) as `0x${string}`,
      v: Number(attestation.v ?? 27),
      r: (attestation.r && attestation.r.startsWith('0x') && attestation.r.length === 66 ? attestation.r : toBytes32(attestation.r || '0x0')) as `0x${string}`,
      s: (attestation.s && attestation.s.startsWith('0x') && attestation.s.length === 66 ? attestation.s : toBytes32(attestation.s || '0x0')) as `0x${string}`,
    };

    // Fetch live network gas price to ensure tx.gasprice > 0 for Arc execution & simulation
    let networkGasPrice = 25_000_000_000n; // 25 Gwei fallback
    try {
      if (typeof arcClient?.publicClient?.getGasPrice === 'function') {
        const livePrice = await arcClient.publicClient.getGasPrice();
        if (livePrice && livePrice > 0n) {
          networkGasPrice = livePrice;
        }
      }
    } catch {
      // fallback to 25 Gwei
    }

    // Ensure campaign is registered and funded on-chain in AdgasSponsorVault
    if (vaultAddress && arcClient?.relayerAccount && arcClient?.walletClient) {
      try {
        const onChainCamp: any = await arcClient.publicClient.readContract({
          address: vaultAddress,
          abi: ADGAS_VAULT_ABI,
          functionName: 'campaigns',
          args: [campaignIdBytes32],
        });
        const sponsorAddr = onChainCamp?.[0] || onChainCamp?.sponsor;
        const availableBal = onChainCamp?.[1] ?? onChainCamp?.availableBalanceUsdc ?? 0n;

        if (!sponsorAddr || sponsorAddr === '0x0000000000000000000000000000000000000000') {
          console.log(`Auto-registering campaign ${campaignIdBytes32} on-chain...`);
          const regTx = await arcClient.walletClient.writeContract({
            address: vaultAddress,
            abi: ADGAS_VAULT_ABI,
            functionName: 'createCampaign',
            args: [campaignIdBytes32, 50000n, 0n, arcClient.relayerAccount.address],
            gasPrice: networkGasPrice,
          });
          await arcClient.publicClient.waitForTransactionReceipt({ hash: regTx });

          const depositUnits = 500000n;
          const approveTx = await arcClient.walletClient.writeContract({
            address: ARC_USDC_ADDRESS,
            abi: USDC_EIP3009_ABI,
            functionName: 'approve',
            args: [vaultAddress, depositUnits],
            gasPrice: networkGasPrice,
          });
          await arcClient.publicClient.waitForTransactionReceipt({ hash: approveTx });

          const depositTx = await arcClient.walletClient.writeContract({
            address: vaultAddress,
            abi: ADGAS_VAULT_ABI,
            functionName: 'depositBudget',
            args: [campaignIdBytes32, depositUnits],
            gasPrice: networkGasPrice,
          });
          await arcClient.publicClient.waitForTransactionReceipt({ hash: depositTx });
          console.log(`Auto-registered and funded campaign ${campaignIdBytes32} on-chain.`);
        } else if (availableBal <= 10000n) {
          console.log(`Replenishing on-chain balance for campaign ${campaignIdBytes32}...`);
          const replenishUnits = 500000n;
          const approveTx = await arcClient.walletClient.writeContract({
            address: ARC_USDC_ADDRESS,
            abi: USDC_EIP3009_ABI,
            functionName: 'approve',
            args: [vaultAddress, replenishUnits],
            gasPrice: networkGasPrice,
          });
          await arcClient.publicClient.waitForTransactionReceipt({ hash: approveTx });

          const depTx = await arcClient.walletClient.writeContract({
            address: vaultAddress,
            abi: ADGAS_VAULT_ABI,
            functionName: 'depositBudget',
            args: [campaignIdBytes32, replenishUnits],
            gasPrice: networkGasPrice,
          });
          await arcClient.publicClient.waitForTransactionReceipt({ hash: depTx });
        }
      } catch (autoRegErr) {
        console.warn('Auto on-chain campaign setup check warning:', autoRegErr);
      }
    }

    // 8. Simulation on Arc Mainnet via AdgasSponsorVault.executeSponsoredTransfer
    try {
      await arcClient.publicClient.simulateContract({
        address: vaultAddress,
        abi: ADGAS_VAULT_ABI,
        functionName: 'executeSponsoredTransfer',
        args: [campaignIdBytes32, authTuple, attestationTuple],
        account: arcClient.relayerAccount,
        gasPrice: networkGasPrice,
      });
    } catch (simErr: any) {
      // Arc Testnet RPC node sets tx.gasprice = 0 during eth_call (read-only simulation),
      // which triggers AdgasVault's anti-zero-gas assertion (line 501).
      // In live broadcast via writeContract, tx.gasprice = networkGasPrice > 0.
      const isZeroGasPriceRevert = simErr?.message?.includes('zero gas price transaction rejected');
      if (!isZeroGasPriceRevert) {
        await accountingEngine.releaseReservation({
          campaignId: dbCampaignId,
          reservationId: reservation.reservationId,
          reservedCostUsdc: reservation.reservedCostUsdc,
        });
        return reply.status(400).send({
          error: 'SimulationError',
          message: `SIMULATION_FAILED: ${simErr.message}`,
        });
      }
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
        args: [campaignIdBytes32, authTuple, attestationTuple],
        account: arcClient.relayerAccount,
        gasPrice: networkGasPrice,
      });

      await recoveryManager.recordBroadcast(attempt.id, txHash);
    } catch (broadcastErr: any) {
      if (db?.consumeAttestation) {
        await db.consumeAttestation(attestationNonce);
      }
      await accountingEngine.releaseReservation({
        campaignId: dbCampaignId,
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
      campaignId: dbCampaignId,
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
      success: true,
      txHash,
      blockNumber: blockNumber.toString(),
      actualCostUsdc: settlement.actualCostUsdc.toString(),
      nativeGasCostWei: settlement.nativeGasCostWei.toString(),
      unspentRefundUsdc: settlement.unspentRefundUsdc.toString(),
      explorerUrl,
      gasBreakdown: {
        gasUsed: gasUsed.toString(),
        effectiveGasPriceWei: effectiveGasPrice.toString(),
        actualGasCostWei: settlement.nativeGasCostWei.toString(),
        actualGasCostUsdcUnits: settlement.actualCostUsdc.toString(),
      },
    });
  });
};
