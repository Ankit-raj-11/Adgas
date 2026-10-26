import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAndCreditDeposit, type DepositVerifierDependencies } from '../src/services/depositService.js';

describe('On-Chain Sponsor Deposit Verification Service', () => {
  let mockRpcClient: any;
  let mockDb: any;
  let campaignState: any;

  beforeEach(() => {
    campaignState = {
      id: 'campaign-123',
      sponsorAddress: '0x1111111111111111111111111111111111111111',
      totalFundedUsdc: 0n,
      availableBalanceUsdc: 0n,
    };

    mockRpcClient = {
      getTransactionReceipt: vi.fn(),
    };

    mockDb = {
      isTxHashProcessed: vi.fn().mockResolvedValue(false),
      recordDepositAndCreditCampaign: vi.fn().mockImplementation(async ({ campaignId, txHash, amountUsdc, blockNumber }) => {
        campaignState.totalFundedUsdc += amountUsdc;
        campaignState.availableBalanceUsdc += amountUsdc;
        return {
          id: 'dep-1',
          campaignId,
          txHash,
          amountUsdc,
          blockNumber,
        };
      }),
    };
  });

  it('successfully verifies confirmed on-chain deposit and credits campaign balance', async () => {
    // Valid Transfer(address,address,uint256) event
    // topic0: keccak256("Transfer(address,address,uint256)") = 0xddf252ad1be2c89b69c2b068fc378d...
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const sponsorTopic = '0x0000000000000000000000001111111111111111111111111111111111111111';
    const targetEscrowTopic = '0x0000000000000000000000009999999999999999999999999999999999999999';
    // 50 USDC (50,000,000 units)
    const amountHex = '0x0000000000000000000000000000000000000000000000000000000002faf080';

    mockRpcClient.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 123456n,
      to: '0x3600000000000000000000000000000000000000',
      logs: [
        {
          address: '0x3600000000000000000000000000000000000000',
          topics: [transferTopic, sponsorTopic, targetEscrowTopic],
          data: amountHex,
        },
      ],
    });

    const result = await verifyAndCreditDeposit(
      {
        campaignId: 'campaign-123',
        txHash: '0xabc123',
        expectedSponsorAddress: '0x1111111111111111111111111111111111111111',
        escrowAddress: '0x9999999999999999999999999999999999999999',
      },
      { rpc: mockRpcClient, db: mockDb }
    );

    expect(result.status).toBe('CONFIRMED');
    expect(result.amountUsdc).toBe(50_000_000n);
    expect(result.blockNumber).toBe(123456n);
    expect(campaignState.availableBalanceUsdc).toBe(50_000_000n);
    expect(campaignState.totalFundedUsdc).toBe(50_000_000n);
  });

  it('rejects if transaction has already been credited (duplicate replay protection)', async () => {
    mockDb.isTxHashProcessed.mockResolvedValue(true);

    await expect(
      verifyAndCreditDeposit(
        {
          campaignId: 'campaign-123',
          txHash: '0xalreadyprocessed',
          expectedSponsorAddress: '0x1111111111111111111111111111111111111111',
          escrowAddress: '0x9999999999999999999999999999999999999999',
        },
        { rpc: mockRpcClient, db: mockDb }
      )
    ).rejects.toThrow('DUPLICATE_DEPOSIT');
  });

  it('rejects if transaction reverted on-chain', async () => {
    mockRpcClient.getTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      blockNumber: 123456n,
    });

    await expect(
      verifyAndCreditDeposit(
        {
          campaignId: 'campaign-123',
          txHash: '0xrevertedtx',
          expectedSponsorAddress: '0x1111111111111111111111111111111111111111',
          escrowAddress: '0x9999999999999999999999999999999999999999',
        },
        { rpc: mockRpcClient, db: mockDb }
      )
    ).rejects.toThrow('TRANSACTION_REVERTED');
  });

  it('rejects if transfer sender does not match campaign sponsor', async () => {
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const someoneElseTopic = '0x0000000000000000000000008888888888888888888888888888888888888888';
    const targetEscrowTopic = '0x0000000000000000000000009999999999999999999999999999999999999999';

    mockRpcClient.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 123456n,
      logs: [
        {
          address: '0x3600000000000000000000000000000000000000',
          topics: [transferTopic, someoneElseTopic, targetEscrowTopic],
          data: '0x0000000000000000000000000000000000000000000000000000000002faf080',
        },
      ],
    });

    await expect(
      verifyAndCreditDeposit(
        {
          campaignId: 'campaign-123',
          txHash: '0xwrongsender',
          expectedSponsorAddress: '0x1111111111111111111111111111111111111111',
          escrowAddress: '0x9999999999999999999999999999999999999999',
        },
        { rpc: mockRpcClient, db: mockDb }
      )
    ).rejects.toThrow('SPONSOR_MISMATCH');
  });
});
