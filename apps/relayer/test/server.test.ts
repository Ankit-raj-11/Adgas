import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/server.js';
import { ARC_MAINNET_CHAIN_ID } from '@adgas/shared';

describe('Fastify Relayer Server Scaffolding & Health Probe', () => {
  it('returns healthy status with chain metadata when RPC is connected', async () => {
    const mockArcClient = {
      publicClient: {
        getBlockNumber: vi.fn().mockResolvedValue(27939100n),
        getBalance: vi.fn().mockResolvedValue(2_000_000_000_000_000_000n), // 2.0 native USDC
      },
      walletClient: null,
      relayerAccount: {
        address: '0x9999999999999999999999999999999999999999',
      },
    } as any;

    const app = buildApp({ arcClient: mockArcClient });

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('healthy');
    expect(body.chainId).toBe(ARC_MAINNET_CHAIN_ID);
    expect(body.rpcConnected).toBe(true);
    expect(body.headBlock).toBe('27939100');
    expect(body.relayer.address).toBe('0x9999999999999999999999999999999999999999');
    expect(body.relayer.balance.usdcNative).toBe('2.000000');
  });

  it('handles degraded status when RPC is unreachable', async () => {
    const mockArcClient = {
      publicClient: {
        getBlockNumber: vi.fn().mockRejectedValue(new Error('RPC Timeout')),
      },
      walletClient: null,
      relayerAccount: null,
    } as any;

    const app = buildApp({ arcClient: mockArcClient });

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.rpcConnected).toBe(false);
    expect(body.headBlock).toBeNull();
  });
});
