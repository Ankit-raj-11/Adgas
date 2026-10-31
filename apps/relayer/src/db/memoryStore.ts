/**
 * In-Memory Database Store for AdGas Relayer
 * 
 * Provides an atomic, zero-configuration in-memory persistence layer
 * for campaigns, deposits, attestations, and relay recovery attempts.
 * Ensures the relayer server operates seamlessly in development, test,
 * and standalone demonstration environments.
 */

export class MemoryDatabase {
  private campaigns: Map<string, any> = new Map();
  private deposits: Map<string, any> = new Map();
  private attestations: Map<string, any> = new Map();
  private attempts: Map<string, any> = new Map();

  constructor() {
    // Default initial campaign on Arc Mainnet - starts with 0 balance until on-chain deposits are verified
    this.campaigns.set('camp_arc_default', {
      id: 'camp_arc_default',
      sponsorAddress: '0x3600000000000000000000000000000000000000',
      name: 'Arc Network Foundation',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Active sponsor YouTube video
      totalFundedUsdcUnits: 0n,
      availableBalanceUsdcUnits: 0n,
      reservedBalanceUsdcUnits: 0n,
      settledSpendUsdcUnits: 0n,
      maxGasPerTxUsdcUnits: 50_000n, // 0.05 USDC cap
      status: 'active',
      sponsoredTxCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async listCampaigns() {
    return Array.from(this.campaigns.values());
  }

  async getCampaign(id: string) {
    let c = this.campaigns.get(id);
    if (!c) {
      for (const val of this.campaigns.values()) {
        if (val.id === id) {
          c = val;
          break;
        }
        if (id.startsWith('0x') && id.length === 66) {
          try {
            const hex = '0x' + Buffer.from(val.id, 'utf8').toString('hex').padEnd(64, '0');
            if (hex.toLowerCase() === id.toLowerCase()) {
              c = val;
              break;
            }
          } catch {}
        }
      }
    }
    if (!c) return null;
    return {
      ...c,
      totalFundedUsdc: c.totalFundedUsdcUnits,
      availableBalanceUsdc: c.availableBalanceUsdcUnits,
      reservedBalanceUsdc: c.reservedBalanceUsdcUnits,
      settledSpendUsdc: c.settledSpendUsdcUnits,
      maxGasPerTxUsdc: c.maxGasPerTxUsdcUnits,
    };
  }

  async createCampaign(camp: any) {
    const formatted = {
      ...camp,
      totalFundedUsdcUnits: BigInt(camp.totalFundedUsdcUnits || 0),
      availableBalanceUsdcUnits: BigInt(camp.availableBalanceUsdcUnits || 0),
      reservedBalanceUsdcUnits: BigInt(camp.reservedBalanceUsdcUnits || 0),
      settledSpendUsdcUnits: BigInt(camp.settledSpendUsdcUnits || 0),
      maxGasPerTxUsdcUnits: BigInt(camp.maxGasPerTxUsdcUnits || 50000),
      sponsoredTxCount: camp.sponsoredTxCount || 0,
      status: camp.status || 'active',
    };
    this.campaigns.set(camp.id, formatted);
    return formatted;
  }

  async updateCampaignStatus(id: string, status: string) {
    const c = this.campaigns.get(id);
    if (!c) return null;
    c.status = status;
    c.updatedAt = new Date();
    this.campaigns.set(id, c);
    return c;
  }

  async updateBalances(id: string, updates: any) {
    let c = this.campaigns.get(id);
    let targetKey = id;
    if (!c) {
      for (const [k, val] of this.campaigns.entries()) {
        if (val.id === id) {
          c = val;
          targetKey = k;
          break;
        }
        if (id.startsWith('0x') && id.length === 66) {
          try {
            const hex = '0x' + Buffer.from(val.id, 'utf8').toString('hex').padEnd(64, '0');
            if (hex.toLowerCase() === id.toLowerCase()) {
              c = val;
              targetKey = k;
              break;
            }
          } catch {}
        }
      }
    }
    if (!c) return;
    if (updates.availableBalanceUsdc !== undefined) {
      c.availableBalanceUsdcUnits = updates.availableBalanceUsdc;
    }
    if (updates.reservedBalanceUsdc !== undefined) {
      c.reservedBalanceUsdcUnits = updates.reservedBalanceUsdc;
    }
    if (updates.settledSpendUsdc !== undefined) {
      c.settledSpendUsdcUnits = updates.settledSpendUsdc;
    }
    if (updates.status !== undefined) {
      c.status = updates.status;
    }
    c.updatedAt = new Date();
    this.campaigns.set(targetKey, c);
  }

  async isTxHashProcessed(txHash: string): Promise<boolean> {
    return this.deposits.has(txHash.toLowerCase());
  }

  async recordDepositAndCreditCampaign(params: {
    campaignId: string;
    txHash: string;
    sponsorAddress: string;
    amountUsdc: bigint;
    blockNumber: bigint;
  }) {
    const hash = params.txHash.toLowerCase();
    this.deposits.set(hash, {
      ...params,
      confirmedAt: new Date(),
    });
    const c = this.campaigns.get(params.campaignId);
    if (c) {
      c.totalFundedUsdcUnits = (c.totalFundedUsdcUnits || 0n) + params.amountUsdc;
      c.availableBalanceUsdcUnits = (c.availableBalanceUsdcUnits || 0n) + params.amountUsdc;
      c.updatedAt = new Date();
      this.campaigns.set(params.campaignId, c);
    }
    return { success: true };
  }

  async getUserActiveAttestationCount(userAddress: string): Promise<number> {
    const nowSec = Math.floor(Date.now() / 1000);
    const addr = userAddress.toLowerCase();
    let count = 0;
    for (const att of this.attestations.values()) {
      if (
        att.userAddress?.toLowerCase() === addr &&
        att.status === 'issued' &&
        att.expiryTimestamp > nowSec
      ) {
        count++;
      }
    }
    return count;
  }

  async saveAttestation(record: any) {
    this.attestations.set(record.nonce, { ...record });
    return record;
  }

  async getAttestation(nonce: string) {
    return this.attestations.get(nonce) || null;
  }

  async consumeAttestation(nonce: string) {
    const att = this.attestations.get(nonce);
    if (att) {
      att.status = 'consumed';
      this.attestations.set(nonce, att);
    }
  }

  async persistAttempt(record: any) {
    this.attempts.set(record.id, { ...record });
    return record;
  }

  async updateAttempt(id: string, updates: any) {
    const a = this.attempts.get(id);
    if (a) {
      Object.assign(a, updates);
      this.attempts.set(id, a);
    }
  }

  async getPendingAttempts() {
    return Array.from(this.attempts.values()).filter(
      (a) =>
        a.status === 'pending_broadcast' ||
        a.status === 'broadcasting' ||
        a.status === 'submitted'
    );
  }
}
