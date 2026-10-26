import { pgTable, varchar, numeric, timestamp, bigint, text } from 'drizzle-orm/pg-core';

export const campaigns = pgTable('campaigns', {
  id: varchar('id', { length: 36 }).primaryKey(),
  sponsorAddress: varchar('sponsor_address', { length: 42 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  totalFundedUsdc: numeric('total_funded_usdc').notNull().default('0'), // 6 decimals
  availableBalanceUsdc: numeric('available_balance_usdc').notNull().default('0'),
  reservedBalanceUsdc: numeric('reserved_balance_usdc').notNull().default('0'),
  settledSpendUsdc: numeric('settled_spend_usdc').notNull().default('0'),
  maxGasPerTxUsdc: numeric('max_gas_per_tx_usdc').notNull().default('50000'), // 0.05 USDC cap
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'paused' | 'depleted'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const deposits = pgTable('deposits', {
  id: varchar('id', { length: 36 }).primaryKey(),
  campaignId: varchar('campaign_id', { length: 36 }).notNull().references(() => campaigns.id),
  sponsorAddress: varchar('sponsor_address', { length: 42 }).notNull(),
  txHash: varchar('tx_hash', { length: 66 }).notNull().unique(),
  amountUsdc: numeric('amount_usdc').notNull(),
  blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
  confirmedAt: timestamp('confirmed_at').notNull().defaultNow(),
});

export const attestations = pgTable('attestations', {
  nonce: varchar('nonce', { length: 64 }).primaryKey(), // UUID
  campaignId: varchar('campaign_id', { length: 36 }).notNull().references(() => campaigns.id),
  userAddress: varchar('user_address', { length: 42 }).notNull(),
  recipientAddress: varchar('recipient_address', { length: 42 }).notNull(),
  amountUsdc: numeric('amount_usdc').notNull(),
  expiryTimestamp: bigint('expiry_timestamp', { mode: 'number' }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('issued'), // 'issued' | 'consumed' | 'expired'
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  attestationNonce: varchar('attestation_nonce', { length: 64 }).notNull().references(() => attestations.nonce),
  campaignId: varchar('campaign_id', { length: 36 }).notNull().references(() => campaigns.id),
  userAddress: varchar('user_address', { length: 42 }).notNull(),
  recipientAddress: varchar('recipient_address', { length: 42 }).notNull(),
  amountUsdc: numeric('amount_usdc').notNull(),
  relayerAddress: varchar('relayer_address', { length: 42 }).notNull(),
  relayerNonce: bigint('relayer_nonce', { mode: 'number' }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending_broadcast'),
  txHash: varchar('tx_hash', { length: 66 }).unique(),
  gasUsedNativeWei: numeric('gas_used_native_wei'), // 18 decimals
  gasPriceNativeWei: numeric('gas_price_native_wei'),
  actualCostUsdc: numeric('actual_cost_usdc'), // 6 decimals
  reservedCostUsdc: numeric('reserved_cost_usdc').notNull(),
  blockNumber: bigint('block_number', { mode: 'number' }),
  failureReason: text('failure_reason'),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at'),
});
