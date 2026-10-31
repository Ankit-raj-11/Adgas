/**
 * Fastify Relayer & Attestation Server
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createArcClient } from './client/arcClient.js';
import { ARC_MAINNET_CHAIN_ID, ADGAS_VAULT_ADDRESS } from '@adgas/shared';
import { attestationRoutes } from './routes/attestationRoutes.js';
import { relayRoutes } from './routes/relayRoutes.js';
import { campaignRoutes } from './routes/campaignRoutes.js';
import { MemoryDatabase } from './db/memoryStore.js';
import { PostgresDatabase } from './db/postgresStore.js';

// Ensure BigInt can be safely serialized to JSON across all endpoints
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

export interface BuildAppOptions {
  arcClient?: ReturnType<typeof createArcClient>;
  db?: any;
  vaultAddress?: `0x${string}`;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.register(cors, {
    origin: true,
  });

  const arc = options.arcClient || createArcClient();
  const db =
    options.db ||
    (process.env.DATABASE_URL
      ? new PostgresDatabase(process.env.DATABASE_URL)
      : new MemoryDatabase());
  const vaultAddress =
    'vaultAddress' in options
      ? options.vaultAddress
      : ((process.env.ADGAS_VAULT_ADDRESS as `0x${string}`) || ADGAS_VAULT_ADDRESS);

  // Health Probe Endpoint
  app.get('/health', async () => {
    let blockNumber = null;
    let chainId = ARC_MAINNET_CHAIN_ID;
    let rpcConnected = false;

    try {
      blockNumber = await arc.publicClient.getBlockNumber();
      rpcConnected = true;
    } catch {
      rpcConnected = false;
    }

    let relayerAddress = arc.relayerAccount?.address || null;
    let relayerBalance = null;

    if (relayerAddress) {
      try {
        const balWei = await arc.publicClient.getBalance({ address: relayerAddress });
        relayerBalance = {
          wei: balWei.toString(),
          usdcNative: (Number(balWei) / 1e18).toFixed(6),
        };
      } catch {
        // RPC error on balance query
      }
    }

    return {
      status: rpcConnected ? 'healthy' : 'degraded',
      chainId,
      rpcConnected,
      headBlock: blockNumber ? blockNumber.toString() : null,
      relayer: {
        address: relayerAddress,
        balance: relayerBalance,
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Register API Routes
  app.register(attestationRoutes, {
    relayerAccount: arc.relayerAccount,
    vaultAddress,
    db,
  });

  app.register(relayRoutes, {
    arcClient: arc,
    vaultAddress,
    db,
  });

  app.register(campaignRoutes, {
    arcClient: arc,
    db,
  });

  // Global Error Handler
  app.setErrorHandler((error: any, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
      statusCode,
    });
  });

  return app;
}

export async function start() {
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';
  const app = buildApp();

  try {
    await app.listen({ port, host });
    console.log(`Relayer API server listening on http://${host}:${port}`);
    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
