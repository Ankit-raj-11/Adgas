'use client';

import React, { useState } from 'react';
import { VideoAdPlayer } from '../components/VideoAdPlayer';
import { TransferForm } from '../components/TransferForm';
import { ReceiptCard, RelayingStep, GasReceiptData } from '../components/ReceiptCard';
import { WalletButton } from '../components/WalletButton';
import { submitRelayTransfer } from '../lib/transferClient';
import { AdCompletionProof } from '../lib/adSession';
import { Sparkles, Shield, Zap, Globe, ArrowRight, BarChart3, Coins } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID, ARC_USDC_ADDRESS } from '@adgas/shared';

// Default MVP Demo Campaign
const DEMO_CAMPAIGN = {
  id: 'camp_arc_demo_001',
  brandName: 'Circle & Arc Foundation',
  adTitle: 'Instant USDC Transfers on Arc Network',
  durationSeconds: 5,
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'consumer' | 'advertiser'>('consumer');

  // Ad Completion State
  const [isAdCompleted, setIsAdCompleted] = useState<boolean>(false);
  const [adSessionToken, setAdSessionToken] = useState<string | undefined>(undefined);

  // Relaying / Receipt State
  const [relayStatus, setRelayStatus] = useState<RelayingStep>('idle');
  const [receiptData, setReceiptData] = useState<GasReceiptData | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);

  const handleAdComplete = (proof: AdCompletionProof) => {
    setIsAdCompleted(true);
    setAdSessionToken(proof.adSessionToken);
  };

  const handleTransferSubmitted = async (params: {
    attestationNonce: string;
    authorization: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: number;
      validBefore: number;
      nonce: `0x${string}`;
      v: number;
      r: `0x${string}`;
      s: `0x${string}`;
    };
    transferDetails: {
      recipient: string;
      amountFormatted: string;
      brandName: string;
    };
  }) => {
    setRelayStatus('simulating');
    setRelayError(null);

    try {
      // Simulate slight realistic network step progression
      setTimeout(() => setRelayStatus('broadcasting'), 800);

      const result = await submitRelayTransfer({
        attestationNonce: params.attestationNonce,
        authorization: params.authorization,
      });

      setRelayStatus('confirmed');
      setReceiptData({
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        attestationNonce: params.attestationNonce,
        gasBreakdown: result.gasBreakdown,
        transferDetails: params.transferDetails,
      });
    } catch (err: any) {
      console.error('Relay broadcast error:', err);
      setRelayStatus('failed');
      setRelayError(err?.message || 'Relay broadcast failed on Arc mainnet.');
    }
  };

  const handleReset = () => {
    setRelayStatus('idle');
    setReceiptData(null);
    setRelayError(null);
    setIsAdCompleted(false);
    setAdSessionToken(undefined);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-gray-800/80 bg-[#0B0F19]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/30">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-tight">Adgas</span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                Arc Mainnet (Chain 5042)
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* View Switcher */}
            <div className="flex items-center bg-[#111827] p-1 rounded-xl border border-gray-800 text-xs">
              <button
                onClick={() => setActiveTab('consumer')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'consumer'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Send USDC ($0 Gas)
              </button>
              <button
                onClick={() => setActiveTab('advertiser')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'advertiser'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Advertiser Portal
              </button>
            </div>

            <WalletButton />
          </div>
        </div>
      </header>

      {/* Hero Subheader */}
      <div className="border-b border-gray-800/50 bg-gradient-to-b from-[#111827]/40 to-transparent py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Advertising-Sponsored Gas Abstraction for Arc Mainnet</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Transfer USDC with <span className="text-blue-500">$0 Gas Fees</span>
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">
            Advertisers sponsor your Arc transaction execution fees in exchange for verified ad engagement. Relayed with EIP-712 and EIP-3009 permits.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'consumer' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Video Ad Player */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Step 1: Watch Sponsored Spotlight
                </h3>
                {isAdCompleted && (
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" />
                    Gas Subsidy Active
                  </span>
                )}
              </div>

              <VideoAdPlayer
                campaignId={DEMO_CAMPAIGN.id}
                brandName={DEMO_CAMPAIGN.brandName}
                adTitle={DEMO_CAMPAIGN.adTitle}
                durationSeconds={DEMO_CAMPAIGN.durationSeconds}
                onAdComplete={handleAdComplete}
                isUnlocked={isAdCompleted}
              />

              {/* Verified Security Card */}
              <div className="p-4 rounded-xl bg-[#111827]/50 border border-gray-800/80 text-xs text-gray-400 space-y-1.5">
                <div className="text-white font-medium flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-blue-400" />
                  <span>Arc Mainnet Security Guarantee</span>
                </div>
                <p>
                  Zero arbitrary contract interaction. The relayer is locked strictly to official Arc USDC (<span className="font-mono text-gray-300">0x3600...0000</span>) via standard EIP-3009 typed data signatures.
                </p>
              </div>
            </div>

            {/* Right Column: Transfer Form & Live Relaying Receipt */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Step 2: Sign & Relay Payment
                </h3>
                <span className="text-xs font-mono text-gray-500">
                  Chain ID: {ARC_MAINNET_CHAIN_ID}
                </span>
              </div>

              {relayStatus === 'idle' ? (
                <TransferForm
                  campaignId={DEMO_CAMPAIGN.id}
                  brandName={DEMO_CAMPAIGN.brandName}
                  isAdCompleted={isAdCompleted}
                  adSessionToken={adSessionToken}
                  onInitiateAdPrompt={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onTransferSubmitted={handleTransferSubmitted}
                />
              ) : (
                <ReceiptCard
                  status={relayStatus}
                  receipt={receiptData}
                  errorMessage={relayError}
                  onReset={handleReset}
                />
              )}
            </div>
          </div>
        ) : (
          /* Advertiser Portal View Preview (Phase 5 Anchor) */
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-gray-800 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Coins className="w-5 h-5 text-blue-400" />
                    Advertiser Campaign Management
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Fund campaign gas pools, set per-tx caps, and track verified consumer engagements.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                  <span>Phase 5 Preview</span>
                </div>
              </div>

              {/* Overview Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Active Campaign</div>
                  <div className="text-base font-bold text-white mt-1">Circle & Arc Foundation</div>
                  <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Funded Budget</div>
                  <div className="text-base font-bold font-mono text-white mt-1">500.00 USDC</div>
                  <div className="text-[11px] text-gray-500 mt-1">Verified on-chain</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Available Gas Pool</div>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-1">488.75 USDC</div>
                  <div className="text-[11px] text-gray-500 mt-1">Ready for subsidies</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Sponsored Transfers</div>
                  <div className="text-base font-bold font-mono text-blue-400 mt-1">142 Tx</div>
                  <div className="text-[11px] text-gray-500 mt-1">100% completion rate</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center justify-between text-xs">
                <div className="text-gray-300">
                  Ready to test the live user payment flow with $0 gas?
                </div>
                <button
                  onClick={() => setActiveTab('consumer')}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Go to Payment Demo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-6 px-4 text-center text-xs text-gray-500">
        <p>Adgas &copy; 2026. Built natively for Arc Mainnet (Chain ID 5042) with EIP-712 & EIP-3009.</p>
      </footer>
    </div>
  );
}
