'use client';

import React, { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { Wallet, LogOut, AlertCircle, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { arcMainnet } from '../lib/wagmi';

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);

  const handleConnect = async (connectorOverride?: any) => {
    setErrorMessage(null);

    // Check if ethereum object is present in browser
    const hasInjected = typeof window !== 'undefined' && Boolean((window as any).ethereum);

    if (!hasInjected && connectors.length === 0) {
      setErrorMessage('No EVM wallet detected in your browser. Please install MetaMask or another EVM wallet.');
      setShowModal(true);
      return;
    }

    try {
      const targetConnector = connectorOverride || connectors.find((c) => c.id === 'injected') || connectors[0];
      if (!targetConnector) {
        throw new Error('No compatible wallet connector found.');
      }

      const result = await connectAsync({
        connector: targetConnector,
        chainId: arcMainnet.id,
      });

      // If connected on different chain, attempt to switch to Arc Mainnet
      if (result.chainId !== arcMainnet.id && switchChainAsync) {
        try {
          await switchChainAsync({ chainId: arcMainnet.id });
        } catch (switchErr: any) {
          console.warn('Network switch skipped or rejected:', switchErr);
        }
      }

      setShowModal(false);
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      const msg = err?.message || 'Failed to connect wallet.';
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        setErrorMessage('Connection request rejected in wallet.');
      } else {
        setErrorMessage(msg);
      }
      setShowModal(true);
    }
  };

  if (isConnected && address) {
    const isWrongChain = chainId !== arcMainnet.id;

    return (
      <div className="flex items-center space-x-2">
        {isWrongChain ? (
          <button
            onClick={() => switchChainAsync && switchChainAsync({ chainId: arcMainnet.id })}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-mono bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20 transition-all cursor-pointer"
            title="Click to switch to Arc Mainnet"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>SWITCH TO ARC ({arcMainnet.id})</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 bg-naka-subtle border border-naka-border px-3.5 py-1.5 rounded-full text-xs font-mono text-naka-dark transition-colors">
            <span className="w-2 h-2 rounded-full bg-naka-green shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="font-medium tracking-tight">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
        )}

        <button
          onClick={() => disconnect()}
          title="Disconnect Wallet"
          className="p-2 rounded-full bg-naka-subtle border border-naka-border text-naka-muted hover:text-rose-600 hover:border-rose-300 transition-all cursor-pointer"
          aria-label="Disconnect wallet"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => handleConnect()}
        disabled={isPending}
        className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-naka-dark hover:bg-neutral-800 text-white text-xs font-sans font-semibold tracking-tight transition-all duration-200 cursor-pointer active:scale-95 shadow-sm"
      >
        {isPending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <Wallet className="w-3.5 h-3.5 text-naka-orange" />
            <span>Connect Wallet</span>
          </>
        )}
      </button>

      {/* Wallet Connection Modal (Triggered on error or manual choice) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white border border-naka-border rounded-3xl p-6 shadow-2xl relative text-left">
            <h3 className="text-lg font-bold text-naka-dark font-display mb-1">
              Connect Web3 Wallet
            </h3>
            <p className="text-xs text-naka-muted mb-4 font-sans">
              Connect your EVM wallet to interact with Arc Mainnet (Chain ID {arcMainnet.id}).
            </p>

            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            <div className="space-y-2 mb-4">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => handleConnect(connector)}
                  disabled={isPending}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-naka-border hover:border-naka-orange hover:bg-naka-subtle text-xs font-medium text-naka-dark transition-all cursor-pointer"
                >
                  <span className="flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-naka-muted" />
                    <span>{connector.name}</span>
                  </span>
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-naka-orange" />}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-naka-border flex items-center justify-between text-xs text-naka-muted">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-naka-dark flex items-center space-x-1"
              >
                <span>Get MetaMask</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg bg-naka-subtle hover:bg-neutral-200 text-naka-dark font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
