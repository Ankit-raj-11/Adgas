/**
 * Resilient Arc Mainnet EVM Client with Automatic RPC Failover
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  defineChain,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_RPC } from '@adgas/shared';

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ARC_MAINNET_RPC],
    },
    public: {
      http: [ARC_MAINNET_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.io',
    },
  },
});

export interface ArcClientConfig {
  rpcUrls?: string[];
  privateKey?: `0x${string}`;
}

export function createArcClient(config: ArcClientConfig = {}) {
  const rpcList = config.rpcUrls && config.rpcUrls.length > 0
    ? config.rpcUrls
    : [
        process.env.ARC_MAINNET_RPC || ARC_MAINNET_RPC,
        process.env.ARC_FALLBACK_RPC || 'https://rpc.mainnet.arc.io',
      ];

  const transports = rpcList.map((url) =>
    http(url, {
      timeout: 10_000,
      retryCount: 3,
      retryDelay: 1000,
    })
  );

  const publicClient: PublicClient = createPublicClient({
    chain: arcMainnet,
    transport: fallback(transports, { rank: false }),
  });

  let walletClient: WalletClient | null = null;
  let relayerAccount = null;

  const rawKey = config.privateKey || process.env.RELAYER_PRIVATE_KEY;
  if (rawKey && rawKey.startsWith('0x') && rawKey.length === 66) {
    relayerAccount = privateKeyToAccount(rawKey as `0x${string}`);
    walletClient = createWalletClient({
      account: relayerAccount,
      chain: arcMainnet,
      transport: fallback(transports, { rank: false }),
    });
  }

  return {
    publicClient,
    walletClient,
    relayerAccount,
    chain: arcMainnet,
  };
}
