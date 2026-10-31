import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';
import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_RPC, ARC_MAINNET_EXPLORER } from '@adgas/shared';

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: ARC_MAINNET_CHAIN_ID === 5042002 ? 'Arc Testnet' : 'Arc Mainnet',
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
      url: ARC_MAINNET_EXPLORER,
    },
  },
});

export const config = createConfig({
  chains: [arcMainnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(ARC_MAINNET_RPC),
  },
  ssr: true,
});
