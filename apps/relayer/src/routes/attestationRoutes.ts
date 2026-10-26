import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { isAddress } from 'viem';
import { ADGAS_ATTESTATION_DOMAIN, ADGAS_ATTESTATION_TYPES } from '@adgas/shared';

export interface AttestationRouteOptions {
  relayerAccount?: any;
  db?: any;
}

export const attestationRoutes: FastifyPluginAsync<AttestationRouteOptions> = async (app, opts) => {
  app.post<{
    Body: {
      campaignId: string;
      userAddress: string;
      recipientAddress: string;
      amountUsdcUnits: string;
      adSessionToken: string;
    };
  }>('/api/attestation/issue', async (request, reply) => {
    const { campaignId, userAddress, recipientAddress, amountUsdcUnits, adSessionToken } = request.body || {};

    // 1. Parameter Validation
    if (!campaignId || !userAddress || !recipientAddress || !amountUsdcUnits) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Missing required parameters: campaignId, userAddress, recipientAddress, amountUsdcUnits',
      });
    }

    if (!isAddress(userAddress) || !isAddress(recipientAddress)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid EVM address provided for userAddress or recipientAddress',
      });
    }

    const amount = BigInt(amountUsdcUnits);
    if (amount <= 0n) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'amountUsdcUnits must be greater than zero',
      });
    }

    const db = opts.db;
    const relayerAccount = opts.relayerAccount;

    if (!relayerAccount) {
      return reply.status(500).send({
        error: 'ConfigurationError',
        message: 'Server relayer account is not configured for signing attestations',
      });
    }

    // 2. Campaign Validation
    const campaign = db ? await db.getCampaign(campaignId) : null;
    if (!campaign || campaign.status !== 'active') {
      return reply.status(400).send({
        error: 'CampaignError',
        message: `CAMPAIGN_NOT_ACTIVE: Campaign is not active or does not exist`,
      });
    }

    // 3. User Rate Limiting
    if (db?.getUserActiveAttestationCount) {
      const activeCount = await db.getUserActiveAttestationCount(userAddress);
      if (activeCount >= 2) {
        return reply.status(429).send({
          error: 'RateLimitError',
          message: 'RATE_LIMIT_EXCEEDED: Maximum pending attestations reached for this address',
        });
      }
    }

    // 4. Generate Nonce & 5-minute Expiry
    const nonce = `att_${randomUUID()}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const expiryTimestamp = nowSec + 300; // Exact 5-minute TTL

    // 5. Cryptographic EIP-712 Signature
    const message = {
      campaignId,
      user: userAddress as `0x${string}`,
      recipient: recipientAddress as `0x${string}`,
      amountUsdcUnits: amount,
      nonce,
      expiryTimestamp: BigInt(expiryTimestamp),
    };

    const signature = await relayerAccount.signTypedData({
      domain: ADGAS_ATTESTATION_DOMAIN,
      types: ADGAS_ATTESTATION_TYPES,
      primaryType: 'AdgasAttestation',
      message,
    });

    const record = {
      nonce,
      campaignId,
      userAddress,
      recipientAddress,
      amountUsdcUnits,
      expiryTimestamp,
      status: 'issued',
      signature,
      createdAt: new Date(),
    };

    if (db?.saveAttestation) {
      await db.saveAttestation(record);
    }

    return reply.status(200).send(record);
  });
};
