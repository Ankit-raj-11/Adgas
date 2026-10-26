/**
 * Fastify Relayer & Attestation Server
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createArcClient } from './client/arcClient.js';
import { ARC_MAINNET_CHAIN_ID } from '@adgas/shared';

export interface BuildAppOptions {
  arcClient?: ReturnType<typeof createArcClient>;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.register(cors, {
    origin: true,
  });

  const arc = options.arcClient || createArcClient();

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
