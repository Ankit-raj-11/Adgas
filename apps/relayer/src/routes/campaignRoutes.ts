import { type FastifyPluginAsync } from 'fastify';
import { isAddress } from 'viem';
import { verifyAndCreditDeposit } from '../services/depositService.js';

export interface CampaignRouteOptions {
  arcClient: any;
  db: any;
}

export const campaignRoutes: FastifyPluginAsync<CampaignRouteOptions> = async (app, opts) => {
  const { arcClient, db } = opts;

  // GET /api/campaigns - List all campaigns
  app.get('/api/campaigns', async (_request, reply) => {
    const campaigns = db?.listCampaigns ? await db.listCampaigns() : [];
    return reply.status(200).send({
      campaigns: campaigns.map((c: any) => ({
        ...c,
        totalFundedUsdcUnits: c.totalFundedUsdcUnits?.toString(),
        availableBalanceUsdcUnits: c.availableBalanceUsdcUnits?.toString(),
        reservedBalanceUsdcUnits: c.reservedBalanceUsdcUnits?.toString(),
        settledSpendUsdcUnits: c.settledSpendUsdcUnits?.toString(),
        maxGasPerTxUsdcUnits: c.maxGasPerTxUsdcUnits?.toString(),
      })),
    });
  });

  // GET /api/campaigns/:id - Get a single campaign
  app.get<{
    Params: { id: string };
  }>('/api/campaigns/:id', async (request, reply) => {
    const { id } = request.params;
    const campaign = db?.getCampaign ? await db.getCampaign(id) : null;
    if (!campaign) {
      return reply.status(404).send({ error: 'NotFound', message: `Campaign ${id} not found` });
    }

    return reply.status(200).send({
      campaign: {
        ...campaign,
        totalFundedUsdcUnits: campaign.totalFundedUsdcUnits?.toString(),
        availableBalanceUsdcUnits: campaign.availableBalanceUsdcUnits?.toString(),
        reservedBalanceUsdcUnits: campaign.reservedBalanceUsdcUnits?.toString(),
        settledSpendUsdcUnits: campaign.settledSpendUsdcUnits?.toString(),
        maxGasPerTxUsdcUnits: campaign.maxGasPerTxUsdcUnits?.toString(),
      },
    });
  });

  // POST /api/campaigns - Create a new campaign
  app.post<{
    Body: {
      sponsorAddress: `0x${string}`;
      name: string;
      maxGasPerTxUsdcUnits?: string;
    };
  }>('/api/campaigns', async (request, reply) => {
    const { sponsorAddress, name, maxGasPerTxUsdcUnits } = request.body || {};

    if (!sponsorAddress || !name || !isAddress(sponsorAddress)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Valid sponsorAddress and name are required',
      });
    }

    const newCampaign = {
      id: `camp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      sponsorAddress: sponsorAddress.toLowerCase(),
      name,
      totalFundedUsdcUnits: 0n,
      availableBalanceUsdcUnits: 0n,
      reservedBalanceUsdcUnits: 0n,
      settledSpendUsdcUnits: 0n,
      maxGasPerTxUsdcUnits: BigInt(maxGasPerTxUsdcUnits || '50000'), // 0.05 USDC default
      status: 'active',
      sponsoredTxCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (db?.createCampaign) {
      await db.createCampaign(newCampaign);
    }

    return reply.status(201).send({
      campaign: {
        ...newCampaign,
        totalFundedUsdcUnits: newCampaign.totalFundedUsdcUnits.toString(),
        availableBalanceUsdcUnits: newCampaign.availableBalanceUsdcUnits.toString(),
        reservedBalanceUsdcUnits: newCampaign.reservedBalanceUsdcUnits.toString(),
        settledSpendUsdcUnits: newCampaign.settledSpendUsdcUnits.toString(),
        maxGasPerTxUsdcUnits: newCampaign.maxGasPerTxUsdcUnits.toString(),
      },
    });
  });

  // POST /api/campaigns/:id/status - Toggle active/paused
  app.post<{
    Params: { id: string };
    Body: { status: 'active' | 'paused' };
  }>('/api/campaigns/:id/status', async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body || {};

    if (status !== 'active' && status !== 'paused') {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Status must be active or paused',
      });
    }

    const updated = db?.updateCampaignStatus
      ? await db.updateCampaignStatus(id, status)
      : null;

    if (!updated) {
      return reply.status(404).send({ error: 'NotFound', message: `Campaign ${id} not found` });
    }

    return reply.status(200).send({
      campaign: {
        ...updated,
        totalFundedUsdcUnits: updated.totalFundedUsdcUnits?.toString(),
        availableBalanceUsdcUnits: updated.availableBalanceUsdcUnits?.toString(),
        reservedBalanceUsdcUnits: updated.reservedBalanceUsdcUnits?.toString(),
        settledSpendUsdcUnits: updated.settledSpendUsdcUnits?.toString(),
        maxGasPerTxUsdcUnits: updated.maxGasPerTxUsdcUnits?.toString(),
      },
    });
  });

  // POST /api/campaigns/:id/deposit - Verify and credit on-chain deposit
  app.post<{
    Params: { id: string };
    Body: {
      txHash: string;
      sponsorAddress: string;
    };
  }>('/api/campaigns/:id/deposit', async (request, reply) => {
    const { id } = request.params;
    const { txHash, sponsorAddress } = request.body || {};

    if (!txHash || !sponsorAddress) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'txHash and sponsorAddress are required',
      });
    }

    const escrowAddress = arcClient?.relayerAccount?.address || '0x0000000000000000000000000000000000000000';

    try {
      const result = await verifyAndCreditDeposit(
        {
          campaignId: id,
          txHash,
          expectedSponsorAddress: sponsorAddress,
          escrowAddress,
        },
        {
          rpc: {
            getTransactionReceipt: (params) => arcClient.publicClient.getTransactionReceipt(params),
          },
          db: {
            isTxHashProcessed: (hash) => db.isTxHashProcessed(hash),
            recordDepositAndCreditCampaign: (params) => db.recordDepositAndCreditCampaign(params),
          },
        }
      );

      return reply.status(200).send({
        success: true,
        creditedAmountUsdcUnits: result.amountUsdc.toString(),
        blockNumber: result.blockNumber.toString(),
      });
    } catch (err: any) {
      return reply.status(400).send({
        error: 'DepositVerificationFailed',
        message: err?.message || 'Deposit verification failed',
      });
    }
  });
};
