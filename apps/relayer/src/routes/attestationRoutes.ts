import { type FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'node:crypto';
import {
  isAddress,
  isHex,
  padHex,
  stringToHex,
  stringToBytes,
  keccak256,
  parseSignature,
} from 'viem';
import {
  buildSponsorshipAttestationTypedData,
  ADGAS_VAULT_ADDRESS,
} from '@adgas/shared';

export interface AttestationRouteOptions {
  relayerAccount?: any;
  vaultAddress?: `0x${string}`;
  db?: any;
}

/**
 * Utility to convert arbitrary string or hex to valid bytes32 (66 chars, 0x-prefixed)
 */
function toBytes32(val: string): `0x${string}` {
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

function generateRandomBytes32(): `0x${string}` {
  let nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  while (nonce === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  }
  return nonce;
}

export const attestationRoutes: FastifyPluginAsync<AttestationRouteOptions> = async (app, opts) => {
  app.post<{
    Body: {
      campaignId: string;
      userAddress: string;
      recipientAddress: string;
      amountUsdcUnits: string;
      adSessionToken?: string;
      userNonce?: string;
      validAfter?: number | string;
      validBefore?: number | string;
      maxGasReimbursementUsdc?: string;
    };
  }>('/api/attestation/issue', async (request, reply) => {
    // 1. Vault Address and Relayer Configuration Validation (Fail-closed)
    const vaultAddress = 'vaultAddress' in opts ? opts.vaultAddress : ADGAS_VAULT_ADDRESS;
    if (
      !vaultAddress ||
      vaultAddress === '0x0000000000000000000000000000000000000000' ||
      !isAddress(vaultAddress, { strict: false })
    ) {
      return reply.status(500).send({
        error: 'ConfigurationError',
        message: 'Valid non-zero ADGAS_VAULT_ADDRESS must be configured on relayer',
      });
    }

    const relayerAccount = opts.relayerAccount;
    if (!relayerAccount) {
      return reply.status(500).send({
        error: 'ConfigurationError',
        message: 'Server relayer account is not configured for signing attestations',
      });
    }

    const {
      campaignId,
      userAddress,
      recipientAddress,
      amountUsdcUnits,
      userNonce,
      validAfter: reqValidAfter,
      validBefore: reqValidBefore,
      maxGasReimbursementUsdc: reqMaxGas,
    } = request.body || {};

    // 2. Parameter Validation
    if (!campaignId || !userAddress || !recipientAddress || !amountUsdcUnits) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Missing required parameters: campaignId, userAddress, recipientAddress, amountUsdcUnits',
      });
    }

    if (!isAddress(userAddress, { strict: false }) || !isAddress(recipientAddress, { strict: false })) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid EVM address provided for userAddress or recipientAddress',
      });
    }

    let amount: bigint;
    try {
      amount = BigInt(amountUsdcUnits);
    } catch {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'amountUsdcUnits must be a valid numeric string',
      });
    }

    if (amount <= 0n) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'amountUsdcUnits must be greater than zero',
      });
    }

    // 3. Campaign Validation
    const db = opts.db;
    const campaign = db ? await db.getCampaign(campaignId) : null;
    if (!campaign || campaign.status !== 'active') {
      return reply.status(400).send({
        error: 'CampaignError',
        message: `CAMPAIGN_NOT_ACTIVE: Campaign is not active or does not exist`,
      });
    }

    // 4. User Rate Limiting
    if (db?.getUserActiveAttestationCount) {
      const activeCount = await db.getUserActiveAttestationCount(userAddress);
      if (activeCount >= 2) {
        return reply.status(429).send({
          error: 'RateLimitError',
          message: 'RATE_LIMIT_EXCEEDED: Maximum pending attestations reached for this address',
        });
      }
    }

    // 5. Bytes32 Format Normalization
    const campaignIdBytes32 = toBytes32(campaignId);
    const formattedUserNonce =
      userNonce && typeof userNonce === 'string' && userNonce.trim().length > 0
        ? toBytes32(userNonce.trim())
        : generateRandomBytes32();
    const attestationNonce = generateRandomBytes32();

    // 6. Temporal Window and Gas Reimbursement Boundaries
    const nowSec = Math.floor(Date.now() / 1000);
    const validAfter = reqValidAfter !== undefined ? BigInt(reqValidAfter) : BigInt(nowSec - 5);
    const expiry = BigInt(nowSec + 300); // 5-minute TTL
    const validBefore = reqValidBefore !== undefined ? BigInt(reqValidBefore) : expiry;

    const campaignMaxGas = campaign.maxGasPerTxUsdc || campaign.maxGasPerTxUsdcUnits || 50_000n;
    let maxGasReimbursementUsdc = reqMaxGas ? BigInt(reqMaxGas) : BigInt(campaignMaxGas);
    if (maxGasReimbursementUsdc > 10_000_000n) {
      maxGasReimbursementUsdc = 10_000_000n; // Protocol cap: 10 USDC
    }

    // 7. Typed Data Construction & Relayer Signature
    const typedData = buildSponsorshipAttestationTypedData({
      vaultAddress: vaultAddress as `0x${string}`,
      campaignId: campaignIdBytes32,
      user: userAddress as `0x${string}`,
      recipient: recipientAddress as `0x${string}`,
      amountUsdc: amount,
      userNonce: formattedUserNonce,
      validAfter,
      validBefore,
      maxGasReimbursementUsdc,
      expiry,
      attestationNonce,
      relayer: relayerAccount.address,
    });

    const signature = await relayerAccount.signTypedData(typedData);
    const parsedSig = parseSignature(signature);
    const v = Number(parsedSig.v ?? (27n + BigInt(parsedSig.yParity ?? 0)));
    const r = parsedSig.r;
    const s = parsedSig.s;

    const record = {
      attestationNonce,
      nonce: attestationNonce,
      campaignId: campaign.id || campaignId,
      campaignIdBytes32,
      originalCampaignId: campaign.id || campaignId,
      user: userAddress as `0x${string}`,
      userAddress,
      recipient: recipientAddress as `0x${string}`,
      recipientAddress,
      amountUsdc: amount.toString(),
      amountUsdcUnits: amount.toString(),
      userNonce: formattedUserNonce,
      validAfter: Number(validAfter),
      validBefore: Number(validBefore),
      maxGasReimbursementUsdc: maxGasReimbursementUsdc.toString(),
      expiry: Number(expiry),
      expiryTimestamp: Number(expiry),
      relayer: relayerAccount.address as `0x${string}`,
      v,
      r,
      s,
      signature,
      domain: typedData.domain,
      status: 'issued',
      createdAt: new Date(),
    };

    if (db?.saveAttestation) {
      await db.saveAttestation(record);
    }

    return reply.status(200).send({
      ...record,
      campaignId: campaignIdBytes32,
    });
  });
};
