'use client';

import React from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Wallet, LogOut, CheckCircle2 } from 'lucide-react';

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-2 bg-[#111827] border border-gray-800 px-3 py-1.5 rounded-xl text-xs font-mono text-gray-300">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
        </div>
        <button
          onClick={() => disconnect()}
          title="Disconnect Wallet"
          className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        const injected = connectors[0];
        if (injected) connect({ connector: injected });
      }}
      disabled={isPending}
      className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer active:scale-95"
    >
      <Wallet className="w-3.5 h-3.5" />
      <span>{isPending ? 'Connecting...' : 'Connect Wallet'}</span>
    </button>
  );
}
