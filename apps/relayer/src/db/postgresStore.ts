import { eq, or, inArray, and, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export class PostgresDatabase {
  public db: ReturnType<typeof drizzle<typeof schema>>;
  public client: ReturnType<typeof postgres>;

  constructor(connectionString: string) {
    this.client = postgres(connectionString);
    this.db = drizzle(this.client, { schema });
    this.initDefaultCampaign().catch((err) => {
      console.warn('Could not initialize default campaign:', err.message);
    });
  }

  private async initDefaultCampaign() {
    try {
      const existing = await this.db.select().from(schema.campaigns).limit(1);
      if (existing.length === 0) {
        await this.db.insert(schema.campaigns).values({
          id: 'camp_arc_default',
          sponsorAddress: '0x3600000000000000000000000000000000000000',
          name: 'Arc Network Foundation',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          totalFundedUsdc: '100000000', // 100 USDC
          availableBalanceUsdc: '100000000',
          reservedBalanceUsdc: '0',
          settledSpendUsdc: '0',
          maxGasPerTxUsdc: '50000',
          status: 'active',
        });
      }
    } catch {
      // Ignored if concurrent startup
    }
  }

  private mapCampaign(c: typeof schema.campaigns.$inferSelect) {
    const totalFunded = BigInt(c.totalFundedUsdc || '0');
    const available = BigInt(c.availableBalanceUsdc || '0');
    const reserved = BigInt(c.reservedBalanceUsdc || '0');
    const settled = BigInt(c.settledSpendUsdc || '0');
    const maxGas = BigInt(c.maxGasPerTxUsdc || '50000');

    return {
      ...c,
      totalFundedUsdcUnits: totalFunded,
      availableBalanceUsdcUnits: available,
      reservedBalanceUsdcUnits: reserved,
      settledSpendUsdcUnits: settled,
      maxGasPerTxUsdcUnits: maxGas,
      totalFundedUsdc: c.totalFundedUsdc || '0',
      availableBalanceUsdc: c.availableBalanceUsdc || '0',
      reservedBalanceUsdc: c.reservedBalanceUsdc || '0',
      settledSpendUsdc: c.settledSpendUsdc || '0',
      maxGasPerTxUsdc: c.maxGasPerTxUsdc || '50000',
      sponsoredTxCount: 0,
    };
  }

  async listCampaigns() {
    const rows = await this.db.select().from(schema.campaigns);
    return rows.map((r) => this.mapCampaign(r));
  }

  async getCampaign(id: string) {
    const rows = await this.db.select().from(schema.campaigns);
    let matched = rows.find((r) => r.id === id);
    if (!matched && id.startsWith('0x') && id.length === 66) {
      matched = rows.find((r) => {
        try {
          const hex = '0x' + Buffer.from(r.id, 'utf8').toString('hex').padEnd(64, '0');
          return hex.toLowerCase() === id.toLowerCase();
        } catch {
          return false;
        }
      });
    }
    if (!matched) return null;
    return this.mapCampaign(matched);
  }

  async createCampaign(camp: any) {
    const values = {
      id: camp.id,
      sponsorAddress: camp.sponsorAddress,
      name: camp.name,
      videoUrl: camp.videoUrl || null,
      totalFundedUsdc: (camp.totalFundedUsdcUnits || camp.totalFundedUsdc || 0).toString(),
      availableBalanceUsdc: (camp.availableBalanceUsdcUnits || camp.availableBalanceUsdc || 0).toString(),
      reservedBalanceUsdc: (camp.reservedBalanceUsdcUnits || camp.reservedBalanceUsdc || 0).toString(),
      settledSpendUsdc: (camp.settledSpendUsdcUnits || camp.settledSpendUsdc || 0).toString(),
      maxGasPerTxUsdc: (camp.maxGasPerTxUsdcUnits || camp.maxGasPerTxUsdc || 50000).toString(),
      status: camp.status || 'active',
      updatedAt: new Date(),
    };
    await this.db.insert(schema.campaigns).values(values).onConflictDoUpdate({
      target: schema.campaigns.id,
      set: values,
    });
    return this.getCampaign(camp.id);
  }

  async updateCampaignStatus(id: string, status: string) {
    const res = await this.db
      .update(schema.campaigns)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.campaigns.id, id))
      .returning();
    return res.length > 0 ? this.mapCampaign(res[0]) : null;
  }

  async updateBalances(id: string, updates: any) {
    const c = await this.getCampaign(id);
    if (!c) return;
    const patch: any = { updatedAt: new Date() };
    if (updates.availableBalanceUsdc !== undefined) {
      patch.availableBalanceUsdc = updates.availableBalanceUsdc.toString();
    }
    if (updates.reservedBalanceUsdc !== undefined) {
      patch.reservedBalanceUsdc = updates.reservedBalanceUsdc.toString();
    }
    if (updates.settledSpendUsdc !== undefined) {
      patch.settledSpendUsdc = updates.settledSpendUsdc.toString();
    }
    if (updates.status !== undefined) {
      patch.status = updates.status;
    }
    await this.db.update(schema.campaigns).set(patch).where(eq(schema.campaigns.id, c.id));
  }

  async isTxHashProcessed(txHash: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(schema.deposits)
      .where(eq(schema.deposits.txHash, txHash.toLowerCase()))
      .limit(1);
    return rows.length > 0;
  }

  async recordDepositAndCreditCampaign(params: {
    campaignId: string;
    txHash: string;
    sponsorAddress: string;
    amountUsdc: bigint;
    blockNumber: bigint;
  }) {
    const hash = params.txHash.toLowerCase();
    await this.db.insert(schema.deposits).values({
      id: crypto.randomUUID ? crypto.randomUUID() : `dep_${Date.now()}`,
      campaignId: params.campaignId,
      sponsorAddress: params.sponsorAddress,
      txHash: hash,
      amountUsdc: params.amountUsdc.toString(),
      blockNumber: Number(params.blockNumber),
      confirmedAt: new Date(),
    });

    const c = await this.getCampaign(params.campaignId);
    if (c) {
      const newTotal = (c.totalFundedUsdcUnits || 0n) + params.amountUsdc;
      const newAvail = (c.availableBalanceUsdcUnits || 0n) + params.amountUsdc;
      await this.db
        .update(schema.campaigns)
        .set({
          totalFundedUsdc: newTotal.toString(),
          availableBalanceUsdc: newAvail.toString(),
          updatedAt: new Date(),
        })
        .where(eq(schema.campaigns.id, c.id));
    }
    return { success: true };
  }

  async getUserActiveAttestationCount(userAddress: string): Promise<number> {
    const nowSec = Math.floor(Date.now() / 1000);
    const rows = await this.db
      .select()
      .from(schema.attestations)
      .where(
        and(
          eq(schema.attestations.userAddress, userAddress.toLowerCase()),
          eq(schema.attestations.status, 'issued'),
          gt(schema.attestations.expiryTimestamp, nowSec)
        )
      );
    return rows.length;
  }

  async saveAttestation(record: any) {
    await this.db.insert(schema.attestations).values({
      nonce: record.nonce,
      campaignId: record.campaignId,
      userAddress: record.userAddress.toLowerCase(),
      recipientAddress: record.recipientAddress.toLowerCase(),
      amountUsdc: record.amountUsdc.toString(),
      expiryTimestamp: Number(record.expiryTimestamp || record.expiry || 0),
      status: record.status || 'issued',
      signature: record.signature,
      createdAt: new Date(),
    });
    return record;
  }

  async getAttestation(nonce: string) {
    const rows = await this.db
      .select()
      .from(schema.attestations)
      .where(eq(schema.attestations.nonce, nonce))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  async consumeAttestation(nonce: string) {
    await this.db
      .update(schema.attestations)
      .set({ status: 'consumed' })
      .where(eq(schema.attestations.nonce, nonce));
  }

  async persistAttempt(record: any) {
    await this.db.insert(schema.transactions).values({
      id: record.id,
      attestationNonce: record.attestationNonce,
      campaignId: record.campaignId,
      userAddress: (record.userAddress || '').toLowerCase(),
      recipientAddress: (record.recipientAddress || '').toLowerCase(),
      amountUsdc: (record.amountUsdc || '0').toString(),
      relayerAddress: (record.relayerAddress || '').toLowerCase(),
      relayerNonce: Number(record.relayerNonce || 0),
      status: record.status || 'pending_broadcast',
      txHash: record.txHash || null,
      gasUsedNativeWei: record.gasUsedNativeWei ? record.gasUsedNativeWei.toString() : null,
      gasPriceNativeWei: record.gasPriceNativeWei ? record.gasPriceNativeWei.toString() : null,
      actualCostUsdc: record.actualCostUsdc ? record.actualCostUsdc.toString() : null,
      reservedCostUsdc: (record.reservedCostUsdc || '0').toString(),
      blockNumber: record.blockNumber ? Number(record.blockNumber) : null,
      failureReason: record.failureReason || null,
      submittedAt: new Date(),
      confirmedAt: record.confirmedAt ? new Date(record.confirmedAt) : null,
    });
    return record;
  }

  async updateAttempt(id: string, updates: any) {
    const patch: any = {};
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.txHash !== undefined) patch.txHash = updates.txHash;
    if (updates.blockNumber !== undefined) patch.blockNumber = Number(updates.blockNumber);
    if (updates.gasUsedNativeWei !== undefined) patch.gasUsedNativeWei = updates.gasUsedNativeWei.toString();
    if (updates.gasPriceNativeWei !== undefined) patch.gasPriceNativeWei = updates.gasPriceNativeWei.toString();
    if (updates.actualCostUsdc !== undefined) patch.actualCostUsdc = updates.actualCostUsdc.toString();
    if (updates.failureReason !== undefined) patch.failureReason = updates.failureReason;
    if (updates.confirmedAt !== undefined) patch.confirmedAt = new Date(updates.confirmedAt);
    await this.db.update(schema.transactions).set(patch).where(eq(schema.transactions.id, id));
  }

  async getPendingAttempts() {
    return await this.db
      .select()
      .from(schema.transactions)
      .where(
        inArray(schema.transactions.status, [
          'pending_broadcast',
          'broadcasting',
          'submitted',
        ])
      );
  }
}

