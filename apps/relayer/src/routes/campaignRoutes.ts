import { type FastifyPluginAsync } from 'fastify';
import { isAddress } from 'viem';
import { verifyAndCreditDeposit } from '../services/depositService.js';

export interface CampaignRouteOptions {
  arcClient: any;
  db: any;
}

function formatCampaignResponse(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    sponsorAddress: c.sponsorAddress,
    name: c.name,
    videoUrl: c.videoUrl || '',
    totalFundedUsdcUnits: (c.totalFundedUsdcUnits ?? c.totalFundedUsdc ?? '0').toString(),
    availableBalanceUsdcUnits: (c.availableBalanceUsdcUnits ?? c.availableBalanceUsdc ?? '0').toString(),
    reservedBalanceUsdcUnits: (c.reservedBalanceUsdcUnits ?? c.reservedBalanceUsdc ?? '0').toString(),
    settledSpendUsdcUnits: (c.settledSpendUsdcUnits ?? c.settledSpendUsdc ?? '0').toString(),
    maxGasPerTxUsdcUnits: (c.maxGasPerTxUsdcUnits ?? c.maxGasPerTxUsdc ?? '50000').toString(),
    status: c.status || 'active',
    sponsoredTxCount: Number(c.sponsoredTxCount || 0),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const campaignRoutes: FastifyPluginAsync<CampaignRouteOptions> = async (app, opts) => {
  const { arcClient, db } = opts;

  // GET /api/sponsor/check - Check if an active sponsor with a valid video exists
  app.get('/api/sponsor/check', async (_request, reply) => {
    const campaigns = db?.listCampaigns ? await db.listCampaigns() : [];
    // Find active campaign with budget and a valid YouTube URL
    const active = campaigns.find(
      (c: any) =>
        c.status === 'active' &&
        BigInt(c.availableBalanceUsdcUnits || '0') > 0n &&
        typeof c.videoUrl === 'string' &&
        c.videoUrl.trim().length > 0 &&
        (c.videoUrl.includes('youtube.com') || c.videoUrl.includes('youtu.be'))
    );

    if (!active) {
      return reply.status(200).send({
        available: false,
        message: 'Sorry, no sponsor found',
      });
    }

    return reply.status(200).send({
      available: true,
      sponsor: {
        id: active.id,
        name: active.name,
        sponsorAddress: active.sponsorAddress,
        videoUrl: active.videoUrl.trim(),
        availableBalanceUsdcUnits: active.availableBalanceUsdcUnits?.toString(),
      },
    });
  });

  // GET /api/campaigns - List all campaigns
  app.get('/api/campaigns', async (_request, reply) => {
    const campaigns = db?.listCampaigns ? await db.listCampaigns() : [];
    return reply.status(200).send({
      campaigns: campaigns.map((c: any) => formatCampaignResponse(c)),
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
      campaign: formatCampaignResponse(campaign),
    });
  });

  // POST /api/campaigns - Create a new campaign
  app.post<{
    Body: {
      sponsorAddress: `0x${string}`;
      name: string;
      maxGasPerTxUsdcUnits?: string;
      videoUrl?: string;
    };
  }>('/api/campaigns', async (request, reply) => {
    const { sponsorAddress, name, maxGasPerTxUsdcUnits, videoUrl } = request.body || {};

    if (!sponsorAddress || !name || !isAddress(sponsorAddress)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Valid sponsorAddress and name are required',
      });
    }

    if (videoUrl && videoUrl.trim()) {
      const trimmed = videoUrl.trim();
      if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Sponsor video must be a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)',
        });
      }
    }

    const newCampaign = {
      id: `camp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      sponsorAddress: sponsorAddress.toLowerCase(),
      name,
      videoUrl: videoUrl || '',
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
      campaign: formatCampaignResponse(newCampaign),
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
      campaign: formatCampaignResponse(updated),
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
