'use client';

import React, { useState } from 'react';
import {
  Coins,
  ShieldCheck,
  Pause,
  Play,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Activity,
  Layers,
  Flame,
  ExternalLink,
} from 'lucide-react';
import { formatUsdcUnits, parseUsdcUnits } from '../lib/transferClient';
import { ARC_MAINNET_EXPLORER } from '@adgas/shared';

export interface CampaignData {
  id: string;
  name: string;
  sponsorAddress: string;
  totalFundedUsdcUnits: string;
  availableBalanceUsdcUnits: string;
  settledSpendUsdcUnits: string;
  maxGasPerTxUsdcUnits: string;
  status: 'active' | 'paused';
  sponsoredTxCount: number;
}

export interface AdvertiserDashboardProps {
  initialCampaign?: CampaignData;
  relayerUrl?: string;
}

export function AdvertiserDashboard({
  initialCampaign,
  relayerUrl,
}: AdvertiserDashboardProps) {
  const [campaign, setCampaign] = useState<CampaignData>(
    initialCampaign || {
      id: 'camp_arc_demo_001',
      name: 'Circle & Arc Foundation',
      sponsorAddress: '0x3600000000000000000000000000000000000000',
      totalFundedUsdcUnits: '500000000', // 500 USDC
      availableBalanceUsdcUnits: '488750000', // 488.75 USDC
      settledSpendUsdcUnits: '11250000', // 11.25 USDC
      maxGasPerTxUsdcUnits: '50000', // 0.05 USDC cap
      status: 'active',
      sponsoredTxCount: 142,
    }
  );

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Deposit Form State
  const [depositTxHash, setDepositTxHash] = useState('');
  const [depositSponsorAddress, setDepositSponsorAddress] = useState(campaign.sponsorAddress);
  const [isVerifyingDeposit, setIsVerifyingDeposit] = useState(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Toggle Status State
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // New Campaign Form State
  const [newCampName, setNewCampName] = useState('');
  const [newCampSponsor, setNewCampSponsor] = useState('');
  const [newCampMaxGas, setNewCampMaxGas] = useState('0.05');
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  const baseUrl = relayerUrl || process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';

  // Toggle Campaign Pause/Resume
  const handleToggleStatus = async () => {
    setIsTogglingStatus(true);
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';

    try {
      const res = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        const data = await res.json();
        setCampaign((prev) => ({ ...prev, status: data.campaign.status }));
      } else {
        // Fallback optimistic update for demo standalone view
        setCampaign((prev) => ({ ...prev, status: nextStatus }));
      }
    } catch {
      setCampaign((prev) => ({ ...prev, status: nextStatus }));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Submit On-Chain Deposit Verification
  const handleVerifyDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingDeposit(true);
    setDepositError(null);
    setDepositSuccessMsg(null);

    try {
      const res = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: depositTxHash.trim(),
          sponsorAddress: depositSponsorAddress.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Deposit verification failed on Arc mainnet.');
      }

      setDepositSuccessMsg(
        `Verified! Successfully credited ${formatUsdcUnits(BigInt(data.creditedAmountUsdcUnits))} USDC to available gas pool.`
      );

      // Update state
      const added = BigInt(data.creditedAmountUsdcUnits);
      setCampaign((prev) => ({
        ...prev,
        totalFundedUsdcUnits: (BigInt(prev.totalFundedUsdcUnits) + added).toString(),
        availableBalanceUsdcUnits: (BigInt(prev.availableBalanceUsdcUnits) + added).toString(),
      }));

      setTimeout(() => {
        setIsDepositModalOpen(false);
        setDepositTxHash('');
      }, 2000);
    } catch (err: any) {
      setDepositError(err?.message || 'Deposit verification failed.');
    } finally {
      setIsVerifyingDeposit(false);
    }
  };

  // Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCampaign(true);

    try {
      const res = await fetch(`${baseUrl}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampName.trim(),
          sponsorAddress: newCampSponsor.trim(),
          maxGasPerTxUsdcUnits: parseUsdcUnits(newCampMaxGas).toString(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCampaign({
          ...data.campaign,
          sponsoredTxCount: 0,
        });
        setIsCreateModalOpen(false);
        setNewCampName('');
        setNewCampSponsor('');
      } else {
        // Mock fallback for demo
        setCampaign({
          id: `camp_${Date.now()}`,
          name: newCampName.trim(),
          sponsorAddress: newCampSponsor.trim(),
          totalFundedUsdcUnits: '0',
          availableBalanceUsdcUnits: '0',
          settledSpendUsdcUnits: '0',
          maxGasPerTxUsdcUnits: parseUsdcUnits(newCampMaxGas).toString(),
          status: 'active',
          sponsoredTxCount: 0,
        });
        setIsCreateModalOpen(false);
      }
    } catch {
      setIsCreateModalOpen(false);
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const totalFundedFormatted = formatUsdcUnits(BigInt(campaign.totalFundedUsdcUnits));
  const availableFormatted = formatUsdcUnits(BigInt(campaign.availableBalanceUsdcUnits));
  const settledFormatted = formatUsdcUnits(BigInt(campaign.settledSpendUsdcUnits));
  const maxGasFormatted = formatUsdcUnits(BigInt(campaign.maxGasPerTxUsdcUnits));

  return (
    <div className="space-y-6">
      {/* Campaign Card Top Header */}
      <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-gray-800 gap-4 mb-6">
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {campaign.name}
              </h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  campaign.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                    campaign.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                {campaign.status === 'active' ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="text-xs font-mono text-gray-400 mt-1">
              Campaign ID: {campaign.id} | Sponsor: {campaign.sponsorAddress.slice(0, 8)}...{campaign.sponsorAddress.slice(-6)}
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Pause / Resume Button */}
            <button
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition-all cursor-pointer ${
                campaign.status === 'active'
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isTogglingStatus ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : campaign.status === 'active' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Subsidies</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Subsidies</span>
                </>
              )}
            </button>

            {/* Fund Budget Button */}
            <button
              onClick={() => setIsDepositModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Record On-Chain Deposit</span>
            </button>

            {/* Create Campaign Button */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="p-2 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-all cursor-pointer"
              title="Create New Campaign"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Stat Metric Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs uppercase tracking-wider font-semibold">
              <span>Funded Budget</span>
              <Coins className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white mt-2">
              {totalFundedFormatted} <span className="text-xs text-gray-400 font-sans font-normal">USDC</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Verified on Arc chain</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs uppercase tracking-wider font-semibold">
              <span>Available Gas Pool</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-2">
              {availableFormatted} <span className="text-xs text-gray-400 font-sans font-normal">USDC</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Unreserved & ready</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs uppercase tracking-wider font-semibold">
              <span>Settled Gas Spend</span>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold font-mono text-white mt-2">
              {settledFormatted} <span className="text-xs text-gray-400 font-sans font-normal">USDC</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Confirmed receipts</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0B0F19] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs uppercase tracking-wider font-semibold">
              <span>Sponsored Transfers</span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400 mt-2">
              {campaign.sponsoredTxCount} <span className="text-xs text-gray-400 font-sans font-normal">Tx</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Cap: {maxGasFormatted} USDC/tx</div>
          </div>
        </div>
      </div>

      {/* Verified Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#111827] border border-gray-700 rounded-2xl p-6 shadow-2xl relative text-left">
            <h3 className="text-lg font-bold text-white tracking-tight mb-1">
              Record On-Chain Deposit
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter the transaction hash of your USDC transfer to the relayer on Arc mainnet.
            </p>

            <form onSubmit={handleVerifyDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Deposit Transaction Hash
                </label>
                <input
                  type="text"
                  required
                  value={depositTxHash}
                  onChange={(e) => setDepositTxHash(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Sponsor Address
                </label>
                <input
                  type="text"
                  required
                  value={depositSponsorAddress}
                  onChange={(e) => setDepositSponsorAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              {depositSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{depositSuccessMsg}</span>
                </div>
              )}

              {depositError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{depositError}</span>
                </div>
              )}

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  disabled={isVerifyingDeposit}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingDeposit || !depositTxHash}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isVerifyingDeposit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying On-Chain...</span>
                    </>
                  ) : (
                    <span>Verify & Credit</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Campaign Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#111827] border border-gray-700 rounded-2xl p-6 shadow-2xl relative text-left">
            <h3 className="text-lg font-bold text-white tracking-tight mb-1">
              Create New Gas Campaign
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Scaffold a new sponsored gas campaign on Arc mainnet.
            </p>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Campaign Brand Name
                </label>
                <input
                  type="text"
                  required
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="e.g. DeFi Summer Protocol"
                  className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Sponsor EVM Address
                </label>
                <input
                  type="text"
                  required
                  value={newCampSponsor}
                  onChange={(e) => setNewCampSponsor(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Max Gas Cap Per Transfer (USDC)
                </label>
                <input
                  type="text"
                  required
                  value={newCampMaxGas}
                  onChange={(e) => setNewCampMaxGas(e.target.value)}
                  placeholder="0.05"
                  className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreatingCampaign}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCampaign || !newCampName || !newCampSponsor}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCreatingCampaign ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Campaign</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
