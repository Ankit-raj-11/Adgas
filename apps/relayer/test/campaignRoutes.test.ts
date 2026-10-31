import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { ARC_USDC_ADDRESS } from '@adgas/shared';

describe('Campaign & Advertiser Management Routes', () => {
  let campaignsMap: Map<string, any>;
  let mockDb: any;
  let mockArcClient: any;

  beforeEach(() => {
    campaignsMap = new Map();
    campaignsMap.set('camp_demo', {
      id: 'camp_demo',
      sponsorAddress: '0x1111111111111111111111111111111111111111',
      name: 'Circle Arc Sponsor',
      totalFundedUsdcUnits: 100_000_000n, // 100 USDC
      availableBalanceUsdcUnits: 95_000_000n, // 95 USDC
      reservedBalanceUsdcUnits: 0n,
      settledSpendUsdcUnits: 5_000_000n,
      maxGasPerTxUsdcUnits: 50_000n,
      status: 'active',
      sponsoredTxCount: 14,
    });

    mockDb = {
      listCampaigns: vi.fn().mockImplementation(async () => Array.from(campaignsMap.values())),
      getCampaign: vi.fn().mockImplementation(async (id: string) => campaignsMap.get(id) || null),
      createCampaign: vi.fn().mockImplementation(async (camp: any) => {
        campaignsMap.set(camp.id, camp);
        return camp;
      }),
      updateCampaignStatus: vi.fn().mockImplementation(async (id: string, status: string) => {
        const c = campaignsMap.get(id);
        if (!c) return null;
        c.status = status;
        campaignsMap.set(id, c);
        return c;
      }),
      isTxHashProcessed: vi.fn().mockResolvedValue(false),
      recordDepositAndCreditCampaign: vi.fn().mockImplementation(async ({ campaignId, amountUsdc }) => {
        const c = campaignsMap.get(campaignId);
        if (c) {
          c.totalFundedUsdcUnits += amountUsdc;
          c.availableBalanceUsdcUnits += amountUsdc;
        }
        return { success: true };
      }),
    };

    mockArcClient = {
      publicClient: {
        getBlockNumber: vi.fn().mockResolvedValue(1000n),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'success',
          to: ARC_USDC_ADDRESS,
          blockNumber: 1000n,
          logs: [
            {
              address: ARC_USDC_ADDRESS,
              topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                '0x0000000000000000000000001111111111111111111111111111111111111111',
                '0x0000000000000000000000009999999999999999999999999999999999999999',
              ],
              data: '0x0000000000000000000000000000000000000000000000000000000002faf080', // 50 USDC (50_000_000)
            },
          ],
        }),
      },
      relayerAccount: {
        address: '0x9999999999999999999999999999999999999999',
      },
    };
  });

  it('GET /api/campaigns lists all campaigns and summary metrics', async () => {
    const app = buildApp({ arcClient: mockArcClient, db: mockDb });

    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].name).toBe('Circle Arc Sponsor');
    expect(body.campaigns[0].status).toBe('active');
  });

  it('POST /api/campaigns creates a new campaign', async () => {
    const app = buildApp({ arcClient: mockArcClient, db: mockDb });

    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        sponsorAddress: '0x3333333333333333333333333333333333333333',
        name: 'DeFi Summer Gas Pool',
        maxGasPerTxUsdcUnits: '25000',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.campaign.id).toBeDefined();
    expect(body.campaign.name).toBe('DeFi Summer Gas Pool');
    expect(body.campaign.status).toBe('active');
  });

  it('POST /api/campaigns/:id/status pauses or resumes a campaign', async () => {
    const app = buildApp({ arcClient: mockArcClient, db: mockDb });

    const pauseRes = await app.inject({
      method: 'POST',
      url: '/api/campaigns/camp_demo/status',
      payload: { status: 'paused' },
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.json().campaign.status).toBe('paused');

    const resumeRes = await app.inject({
      method: 'POST',
      url: '/api/campaigns/camp_demo/status',
      payload: { status: 'active' },
    });
    expect(resumeRes.statusCode).toBe(200);
    expect(resumeRes.json().campaign.status).toBe('active');
  });

  it('POST /api/campaigns/:id/deposit verifies on-chain receipt and credits campaign', async () => {
    const app = buildApp({ arcClient: mockArcClient, db: mockDb });

    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/camp_demo/deposit',
      payload: {
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        sponsorAddress: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.creditedAmountUsdcUnits).toBe('50000000');
  });

  it('GET /api/sponsor/check checks active sponsor and validates YouTube URL', async () => {
    const app = buildApp({ arcClient: mockArcClient, db: mockDb });

    // Initially camp_demo has no videoUrl -> returns available: false
    const resNoVideo = await app.inject({
      method: 'GET',
      url: '/api/sponsor/check',
    });
    expect(resNoVideo.statusCode).toBe(200);
    expect(resNoVideo.json()).toEqual({
      available: false,
      message: 'Sorry, no sponsor found',
    });

    // Update camp_demo to have a valid YouTube URL
    const camp = campaignsMap.get('camp_demo');
    camp.videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    campaignsMap.set('camp_demo', camp);

    const resWithVideo = await app.inject({
      method: 'GET',
      url: '/api/sponsor/check',
    });
    expect(resWithVideo.statusCode).toBe(200);
    const bodyWithVideo = resWithVideo.json();
    expect(bodyWithVideo.available).toBe(true);
    expect(bodyWithVideo.sponsor.name).toBe('Circle Arc Sponsor');
    expect(bodyWithVideo.sponsor.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
