'use client';

import React, { useState, useEffect } from 'react';
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
  Flame,
  Film,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { formatUsdcUnits, parseUsdcUnits } from '../lib/transferClient';
import { useAccount, useWalletClient, useReadContract } from 'wagmi';
import {
  ARC_USDC_ADDRESS,
  ADGAS_VAULT_ADDRESS,
  ARC_MAINNET_EXPLORER,
  ARC_MAINNET_CHAIN_ID,
  USDC_EIP3009_ABI,
} from '@adgas/shared';

export interface CampaignData {
  id: string;
  name: string;
  sponsorAddress: string;
  videoUrl?: string;
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
  const { address: connectedAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Read real on-chain USDC balance from Arc Mainnet Canonical USDC contract (0x3600...0000)
  const { data: sponsorUsdcBalanceRaw, isLoading: isLoadingSponsorBal } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: USDC_EIP3009_ABI,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: !!connectedAddress,
    },
  });
  const sponsorWalletBalFormatted = sponsorUsdcBalanceRaw ? formatUsdcUnits(sponsorUsdcBalanceRaw) : '0.00';

  // Read real on-chain USDC balance in the Adgas Vault contract (if deployed)
  const isVaultConfigured = Boolean(
    ADGAS_VAULT_ADDRESS && ADGAS_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000'
  );
  const { data: vaultUsdcBalanceRaw } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: USDC_EIP3009_ABI,
    functionName: 'balanceOf',
    args: isVaultConfigured ? [ADGAS_VAULT_ADDRESS] : undefined,
    query: {
      enabled: isVaultConfigured,
    },
  });
  const vaultBalFormatted = vaultUsdcBalanceRaw ? formatUsdcUnits(vaultUsdcBalanceRaw) : '0.00';

  const baseUrl = relayerUrl || process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';

  const [campaignsList, setCampaignsList] = useState<CampaignData[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState<boolean>(true);

  // Default to real zero state (NO fake numbers)
  const [campaign, setCampaign] = useState<CampaignData>(
    initialCampaign || {
      id: '',
      name: '',
      sponsorAddress: '',
      videoUrl: '',
      totalFundedUsdcUnits: '0',
      availableBalanceUsdcUnits: '0',
      settledSpendUsdcUnits: '0',
      maxGasPerTxUsdcUnits: '50000',
      status: 'active',
      sponsoredTxCount: 0,
    }
  );

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Deposit Form State
  const [depositTab, setDepositTab] = useState<'direct' | 'txhash'>('direct');
  const [directAmountUsdc, setDirectAmountUsdc] = useState('1.0');
  const [isSubmittingOnChain, setIsSubmittingOnChain] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState('');
  const [depositSponsorAddress, setDepositSponsorAddress] = useState(
    connectedAddress || campaign.sponsorAddress
  );
  const [isVerifyingDeposit, setIsVerifyingDeposit] = useState(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Toggle Status State
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // New Campaign Form State
  const [newCampName, setNewCampName] = useState('');
  const [newCampSponsor, setNewCampSponsor] = useState('');
  const [newCampVideoUrl, setNewCampVideoUrl] = useState('');
  const [newCampMaxGas, setNewCampMaxGas] = useState('0.05');
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch real campaigns from Relayer API on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCampaigns() {
      setIsLoadingCampaigns(true);
      try {
        const res = await fetch(`${baseUrl}/api/campaigns`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.campaigns && data.campaigns.length > 0) {
            setCampaignsList(data.campaigns);
            // Default to connected user's campaign if available, else first
            const matched = connectedAddress
              ? data.campaigns.find(
                  (c: any) => c.sponsorAddress.toLowerCase() === connectedAddress.toLowerCase()
                )
              : null;
            setCampaign(matched || data.campaigns[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load campaigns:', err);
      } finally {
        if (isMounted) setIsLoadingCampaigns(false);
      }
    }
    loadCampaigns();
    return () => {
      isMounted = false;
    };
  }, [baseUrl, connectedAddress]);

  // Sync connected wallet to sponsor address fields
  useEffect(() => {
    if (connectedAddress) {
      if (!depositSponsorAddress) setDepositSponsorAddress(connectedAddress);
      if (!newCampSponsor) setNewCampSponsor(connectedAddress);
    }
  }, [connectedAddress, depositSponsorAddress, newCampSponsor]);

  // Toggle Campaign Pause/Resume
  const handleToggleStatus = async () => {
    if (!campaign.id) return;
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
        setCampaign((prev) => ({ ...prev, status: nextStatus }));
      }
    } catch {
      setCampaign((prev) => ({ ...prev, status: nextStatus }));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Direct On-Chain Deposit via Connected Wallet
  const handleDirectDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletClient || !connectedAddress) {
      setDepositError('Please connect your Web3 wallet first to execute this deposit.');
      return;
    }
    if (!campaign.id) {
      setDepositError('Please create or select an active campaign before depositing budget.');
      return;
    }

    setIsSubmittingOnChain(true);
    setDepositError(null);
    setDepositSuccessMsg(null);

    try {
      const amountUnits = parseUsdcUnits(directAmountUsdc);
      const recipientAddress =
        ADGAS_VAULT_ADDRESS && ADGAS_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000'
          ? ADGAS_VAULT_ADDRESS
          : (campaign.sponsorAddress as `0x${string}`);

      // 1. Submit on-chain transfer on Arc Mainnet
      const txHash = await walletClient.writeContract({
        address: ARC_USDC_ADDRESS,
        abi: USDC_EIP3009_ABI,
        functionName: 'transfer',
        args: [recipientAddress, amountUnits],
      });

      setDepositTxHash(txHash);
      setDepositSuccessMsg(`Transaction broadcast: ${txHash.slice(0, 10)}... Verifying with Relayer...`);

      // 2. Automatically verify and credit pool
      const res = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          sponsorAddress: connectedAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Deposit broadcast confirmed on Arc; indexing pending.');
      }

      setDepositSuccessMsg(
        `Success! Credited ${formatUsdcUnits(BigInt(data.creditedAmountUsdcUnits))} USDC to available gas pool.`
      );

      const added = BigInt(data.creditedAmountUsdcUnits);
      setCampaign((prev) => ({
        ...prev,
        totalFundedUsdcUnits: (BigInt(prev.totalFundedUsdcUnits || '0') + added).toString(),
        availableBalanceUsdcUnits: (BigInt(prev.availableBalanceUsdcUnits || '0') + added).toString(),
      }));

      setTimeout(() => {
        setIsDepositModalOpen(false);
        setDepositTxHash('');
      }, 3000);
    } catch (err: any) {
      setDepositError(err?.message || 'On-chain deposit failed.');
    } finally {
      setIsSubmittingOnChain(false);
    }
  };

  // Submit On-Chain Deposit Verification
  const handleVerifyDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign.id) {
      setDepositError('Please select or create an active campaign first.');
      return;
    }

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
        `Verified! Credited ${formatUsdcUnits(BigInt(data.creditedAmountUsdcUnits))} USDC to available gas pool.`
      );

      const added = BigInt(data.creditedAmountUsdcUnits);
      setCampaign((prev) => ({
        ...prev,
        totalFundedUsdcUnits: (BigInt(prev.totalFundedUsdcUnits || '0') + added).toString(),
        availableBalanceUsdcUnits: (BigInt(prev.availableBalanceUsdcUnits || '0') + added).toString(),
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

  // Create Campaign with Sponsor Video URL
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const trimmedUrl = newCampVideoUrl.trim();
    if (!trimmedUrl) {
      setCreateError('Please provide a sponsor YouTube video URL.');
      return;
    }
    if (!trimmedUrl.includes('youtube.com') && !trimmedUrl.includes('youtu.be')) {
      setCreateError('Sponsors must provide a valid YouTube video URL (e.g. https://www.youtube.com/watch?v=...)');
      return;
    }

    setIsCreatingCampaign(true);

    try {
      const res = await fetch(`${baseUrl}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampName.trim(),
          sponsorAddress: (newCampSponsor || connectedAddress || '').trim(),
          videoUrl: trimmedUrl,
          maxGasPerTxUsdcUnits: parseUsdcUnits(newCampMaxGas).toString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create campaign.');
      }

      const created: CampaignData = {
        id: data.campaign.id,
        name: data.campaign.name,
        sponsorAddress: data.campaign.sponsorAddress,
        videoUrl: data.campaign.videoUrl || trimmedUrl,
        totalFundedUsdcUnits: data.campaign.totalFundedUsdcUnits || '0',
        availableBalanceUsdcUnits: data.campaign.availableBalanceUsdcUnits || '0',
        settledSpendUsdcUnits: data.campaign.settledSpendUsdcUnits || '0',
        maxGasPerTxUsdcUnits: data.campaign.maxGasPerTxUsdcUnits || '50000',
        status: data.campaign.status || 'active',
        sponsoredTxCount: 0,
      };
      setCampaign(created);
      setCampaignsList((prev) => [created, ...prev]);
      setIsCreateModalOpen(false);
      setNewCampName('');
      setNewCampVideoUrl('');
    } catch (err: any) {
      console.error('Failed to create campaign:', err);
      setCreateError(err?.message || 'Failed to create campaign.');
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const totalFundedFormatted = formatUsdcUnits(BigInt(campaign.totalFundedUsdcUnits || '0'));
  const availableFormatted = formatUsdcUnits(BigInt(campaign.availableBalanceUsdcUnits || '0'));
  const settledFormatted = formatUsdcUnits(BigInt(campaign.settledSpendUsdcUnits || '0'));
  const maxGasFormatted = formatUsdcUnits(BigInt(campaign.maxGasPerTxUsdcUnits || '50000'));

  const hasCampaign = Boolean(campaign.id);

  return (
    <div className="w-full text-naka-dark space-y-6">
      {/* Campaign Switcher Pills (Rendered cleanly above card when multiple exist) */}
      {!isLoadingCampaigns && campaignsList.length > 0 && (
        <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider mr-1">
              Campaigns:
            </span>
            {campaignsList.map((c) => (
              <button
                key={c.id}
                onClick={() => setCampaign(c)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
                  campaign.id === c.id
                    ? 'bg-naka-dark text-white font-semibold shadow-xs'
                    : 'bg-white border border-naka-border text-neutral-600 hover:text-naka-dark hover:border-neutral-400'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-1.5 rounded-full text-xs font-sans font-medium text-naka-dark hover:text-white bg-white hover:bg-naka-dark border border-naka-border transition-all flex items-center space-x-1.5 shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-naka-orange" />
            <span>New Campaign</span>
          </button>
        </div>
      )}

      {/* Main Campaign Overview Card */}
      <div className="bg-white border border-naka-border rounded-3xl p-6 sm:p-8 shadow-xs relative">
        {isLoadingCampaigns ? (
          <div className="py-12 flex items-center justify-center space-x-2 text-neutral-400 text-xs font-mono">
            <Loader2 className="w-4 h-4 animate-spin text-naka-orange" />
            <span>Loading live campaigns from Arc relayer...</span>
          </div>
        ) : !hasCampaign ? (
          /* Empty State */
          <div className="py-12 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-neutral-50 border border-naka-border text-naka-orange mx-auto flex items-center justify-center">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-naka-dark font-display">No Active Campaigns</h3>
              <p className="text-xs text-neutral-500 mt-1 font-sans">
                Create your first sponsor campaign to link your video ad and fund gas subsidies on Arc Mainnet.
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="py-3 px-5 rounded-full text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white shadow-sm inline-flex items-center space-x-2 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4 text-naka-orange" />
              <span>Create Sponsor Campaign</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header: Title, Status Badges, and Action Buttons */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-naka-border gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                  <h2 className="text-2xl font-bold text-naka-dark tracking-tight font-display">
                    {campaign.name}
                  </h2>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                      campaign.status === 'active'
                        ? 'bg-emerald-50 text-naka-green border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-500 border border-naka-border'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        campaign.status === 'active' ? 'bg-naka-green' : 'bg-neutral-400'
                      }`}
                    />
                    {campaign.status === 'active' ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div className="flex items-center space-x-2.5 text-xs font-mono text-neutral-500 flex-wrap gap-y-1">
                  <span className="bg-neutral-100 px-2 py-0.5 rounded text-[11px]">
                    ID: {campaign.id}
                  </span>
                  <span>•</span>
                  <span>
                    Sponsor: {campaign.sponsorAddress ? `${campaign.sponsorAddress.slice(0, 6)}...${campaign.sponsorAddress.slice(-4)}` : 'Unset'}
                  </span>
                  {connectedAddress && (
                    <>
                      <span>•</span>
                      <span className="text-naka-dark font-medium">
                        Wallet: {isLoadingSponsorBal ? '...' : `${sponsorWalletBalFormatted} USDC`}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <a
                    href={`${ARC_MAINNET_EXPLORER}/token/${ARC_USDC_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-emerald-700 hover:underline inline-flex items-center space-x-1"
                  >
                    <span>Arc USDC (0x3600...0000)</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                  {ADGAS_VAULT_ADDRESS && ADGAS_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000' && (
                    <>
                      <span>•</span>
                      <a
                        href={`${ARC_MAINNET_EXPLORER}/address/${ADGAS_VAULT_ADDRESS}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono text-naka-orange hover:underline inline-flex items-center space-x-1"
                      >
                        <span>Vault Contract</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2.5 flex-shrink-0">
                <button
                  onClick={handleToggleStatus}
                  disabled={isTogglingStatus}
                  className="px-4 py-2 rounded-full text-xs font-sans font-medium flex items-center space-x-1.5 border border-naka-border bg-neutral-50 hover:bg-neutral-100 text-naka-dark transition-all cursor-pointer"
                >
                  {isTogglingStatus ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : campaign.status === 'active' ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-naka-green" />
                      <span>Resume</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setIsDepositModalOpen(true)}
                  className="px-5 py-2.5 rounded-full text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white shadow-sm flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-naka-orange" />
                  <span>Deposit Budget</span>
                </button>
              </div>
            </div>

            {/* 4 Financial KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-sans font-medium">
                  <span>Funded Budget</span>
                  <Coins className="w-4 h-4 text-naka-orange" />
                </div>
                <div className="text-2xl font-bold font-mono text-naka-dark mt-2.5">
                  {totalFundedFormatted} <span className="text-xs text-neutral-400 font-sans font-normal">USDC</span>
                </div>
                <div className="text-[11px] text-neutral-400 mt-1 font-mono">On-chain deposited</div>
              </div>

              <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-sans font-medium">
                  <span>Available Gas Pool</span>
                  <ShieldCheck className="w-4 h-4 text-naka-green" />
                </div>
                <div className="text-2xl font-bold font-mono text-naka-dark mt-2.5">
                  {availableFormatted} <span className="text-xs text-emerald-600 font-sans font-normal">USDC</span>
                </div>
                <div className="text-[11px] text-neutral-400 mt-1 font-mono">Ready to subsidize</div>
              </div>

              <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-sans font-medium">
                  <span>Settled Gas Spend</span>
                  <Flame className="w-4 h-4 text-naka-orange" />
                </div>
                <div className="text-2xl font-bold font-mono text-naka-dark mt-2.5">
                  {settledFormatted} <span className="text-xs text-neutral-400 font-sans font-normal">USDC</span>
                </div>
                <div className="text-[11px] text-neutral-400 mt-1 font-mono">Mined Arc receipts</div>
              </div>

              <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-sans font-medium">
                  <span>Sponsored Transfers</span>
                  <Activity className="w-4 h-4 text-naka-orange" />
                </div>
                <div className="text-2xl font-bold font-mono text-naka-dark mt-2.5">
                  {campaign.sponsoredTxCount} <span className="text-xs text-neutral-400 font-sans font-normal">Tx</span>
                </div>
                <div className="text-[11px] text-neutral-400 mt-1 font-mono">Cap: {maxGasFormatted} USDC/Tx</div>
              </div>
            </div>

            {/* Video Spotlight Preview Section */}
            {campaign.videoUrl ? (
              <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white border border-naka-border flex items-center justify-center text-naka-orange flex-shrink-0 shadow-2xs">
                    <Film className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-naka-dark font-sans flex items-center space-x-1.5">
                      <span>Active Sponsor Spotlight Video</span>
                      <span className="text-[10px] font-mono bg-emerald-50 text-naka-green border border-emerald-200 px-2 py-0.5 rounded-full">
                        Live on /transfer
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 truncate max-w-lg mt-0.5">
                      {campaign.videoUrl}
                    </div>
                  </div>
                </div>

                <a
                  href={campaign.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-full text-xs font-mono text-naka-orange hover:text-white hover:bg-naka-orange bg-white border border-naka-border flex items-center space-x-1.5 transition-all self-start sm:self-auto flex-shrink-0"
                >
                  <span>Preview Video</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-neutral-50/70 border border-naka-border flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-white border border-naka-border flex items-center justify-center text-neutral-400 shadow-2xs">
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-naka-dark">No custom video URL linked</div>
                    <div className="text-[11px] text-neutral-400">Displaying default Arc Spotlight canvas on /transfer</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-xs font-mono text-naka-orange hover:underline font-semibold cursor-pointer"
                >
                  + Create with Custom Video
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verified Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white border border-naka-border rounded-3xl p-7 shadow-2xl relative text-left">
            <h3 className="text-xl font-bold text-naka-dark tracking-tight font-display mb-1">
              Deposit Sponsor Budget
            </h3>
            <p className="text-xs font-sans text-neutral-500 mb-5">
              Fund campaign escrow on {ARC_MAINNET_CHAIN_ID === 5042002 ? 'Arc Testnet (5042002)' : 'Arc Mainnet (5042)'}
            </p>

            {/* Mode Tabs */}
            <div className="flex items-center p-1 rounded-xl bg-neutral-100 border border-naka-border mb-5">
              <button
                type="button"
                onClick={() => setDepositTab('direct')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-sans font-medium transition-all cursor-pointer ${
                  depositTab === 'direct'
                    ? 'bg-white text-naka-dark shadow-xs'
                    : 'text-neutral-500 hover:text-naka-dark'
                }`}
              >
                1-Click Wallet
              </button>
              <button
                type="button"
                onClick={() => setDepositTab('txhash')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-sans font-medium transition-all cursor-pointer ${
                  depositTab === 'txhash'
                    ? 'bg-white text-naka-dark shadow-xs'
                    : 'text-neutral-500 hover:text-naka-dark'
                }`}
              >
                Verify Tx Hash
              </button>
            </div>

            {depositTab === 'direct' ? (
              <form onSubmit={handleDirectDeposit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-neutral-600 font-sans">
                      Deposit Amount (USDC)
                    </label>
                    <div className="flex items-center space-x-1.5 text-[11px] font-mono text-neutral-500">
                      <span>Wallet Balance:</span>
                      <span className="font-semibold text-naka-dark">
                        {isLoadingSponsorBal ? '...' : `${sponsorWalletBalFormatted} USDC`}
                      </span>
                      {sponsorUsdcBalanceRaw && sponsorUsdcBalanceRaw > 0n && (
                        <button
                          type="button"
                          onClick={() => setDirectAmountUsdc(sponsorWalletBalFormatted)}
                          className="font-bold text-naka-orange hover:text-naka-orange-hover px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200/80 text-[10px] cursor-pointer"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={directAmountUsdc}
                      onChange={(e) => setDirectAmountUsdc(e.target.value)}
                      placeholder="1.0"
                      className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-3 text-sm text-naka-dark font-mono focus:outline-none focus:border-naka-orange focus:bg-white transition-all pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-neutral-400">
                      USDC
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    {['0.1', '1.0', '5.0', '10.0'].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDirectAmountUsdc(amt)}
                        className="px-2.5 py-1 text-xs font-mono bg-white border border-neutral-200 rounded-lg hover:border-naka-orange hover:text-naka-orange transition-colors cursor-pointer"
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1 font-sans">
                    Sponsor Connected Wallet
                  </label>
                  <p className="text-xs font-mono text-naka-dark bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 truncate">
                    {connectedAddress || 'No wallet connected. Please connect wallet first.'}
                  </p>
                </div>

                {depositSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-naka-green text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span className="break-all">{depositSuccessMsg}</span>
                  </div>
                )}

                {depositError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{depositError}</span>
                  </div>
                )}

                <div className="flex items-center space-x-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsDepositModalOpen(false)}
                    disabled={isSubmittingOnChain}
                    className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-medium bg-neutral-100 hover:bg-neutral-200 text-naka-dark border border-neutral-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingOnChain || !isConnected}
                    className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingOnChain ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Confirming On-Chain...</span>
                      </>
                    ) : (
                      <span>Deposit on Arc</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyDeposit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5 font-sans">
                    Deposit Transaction Hash
                  </label>
                  <input
                    type="text"
                    required
                    value={depositTxHash}
                    onChange={(e) => setDepositTxHash(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-3 text-xs text-naka-dark placeholder-neutral-400 font-mono focus:outline-none focus:border-naka-orange focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5 font-sans">
                    Sponsor Address
                  </label>
                  <input
                    type="text"
                    required
                    value={depositSponsorAddress}
                    onChange={(e) => setDepositSponsorAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-3 text-xs text-naka-dark placeholder-neutral-400 font-mono focus:outline-none focus:border-naka-orange focus:bg-white transition-all"
                  />
                </div>

                {depositSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-naka-green text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span className="break-all">{depositSuccessMsg}</span>
                  </div>
                )}

                {depositError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{depositError}</span>
                  </div>
                )}

                <div className="flex items-center space-x-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsDepositModalOpen(false)}
                    disabled={isVerifyingDeposit}
                    className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-medium bg-neutral-100 hover:bg-neutral-200 text-naka-dark border border-neutral-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingDeposit || !depositTxHash}
                    className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isVerifyingDeposit ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Verify & Credit</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Campaign Modal with Video URL Input */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white border border-naka-border rounded-3xl p-7 shadow-2xl relative text-left">
            <h3 className="text-xl font-bold text-naka-dark tracking-tight font-display mb-1">
              Create Sponsor Campaign
            </h3>
            <p className="text-xs font-sans text-neutral-500 mb-5">
              Set campaign media and gas sponsorship parameters
            </p>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5 font-sans">
                  Campaign Name
                </label>
                <input
                  type="text"
                  required
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="e.g. Circle & Arc Spotlight"
                  className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs text-naka-dark placeholder-neutral-400 font-sans focus:outline-none focus:border-naka-orange focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5 font-sans">
                  Sponsor Video URL (YouTube Only)
                </label>
                <input
                  type="url"
                  required
                  value={newCampVideoUrl}
                  onChange={(e) => setNewCampVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs text-naka-dark placeholder-neutral-400 font-mono focus:outline-none focus:border-naka-orange focus:bg-white transition-all"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block font-sans">
                  Users on /transfer watch this YouTube video to sponsor their Arc transaction fees.
                </span>
              </div>

              {createError && (
                <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5 font-sans">
                  Sponsor EVM Address
                </label>
                <input
                  type="text"
                  required
                  value={newCampSponsor}
                  onChange={(e) => setNewCampSponsor(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs text-naka-dark placeholder-neutral-400 font-mono focus:outline-none focus:border-naka-orange focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5 font-sans">
                  Max Gas Limit Per Transfer (USDC)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newCampMaxGas}
                  onChange={(e) => setNewCampMaxGas(e.target.value)}
                  className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs text-naka-dark font-mono focus:outline-none focus:border-naka-orange focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreatingCampaign}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-medium bg-neutral-100 hover:bg-neutral-200 text-naka-dark border border-neutral-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCampaign || !newCampName}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCreatingCampaign ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Launch Campaign</span>
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
