'use client';

import React, { useState } from 'react';
import { useAccount, useSignTypedData, useConnect, useSwitchChain, useReadContract } from 'wagmi';
import { isAddress } from 'viem';
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  Wallet,
  Loader2,
  Coins,
} from 'lucide-react';
import {
  formatUsdcUnits,
  parseUsdcUnits,
  generateEip3009Nonce,
  buildEip3009TypedData,
  buildReceiveWithAuthorizationTypedData,
  splitSignatureBytes,
  requestGasAttestation,
} from '../lib/transferClient';
import { AdCompletionProof } from '../lib/adSession';
import { VideoAdPlayer } from './VideoAdPlayer';
import { arcMainnet } from '../lib/wagmi';
import { ARC_USDC_ADDRESS, ADGAS_VAULT_ADDRESS, USDC_EIP3009_ABI, ARC_MAINNET_CHAIN_ID } from '@adgas/shared';

export interface TransferFormProps {
  campaignId?: string;
  brandName?: string;
  adTitle?: string;
  videoUrl?: string;
  durationSeconds?: number;
  isAdCompleted: boolean;
  adSessionToken?: string;
  onAdComplete: (proof: AdCompletionProof) => void;
  onTransferSubmitted: (params: {
    attestationNonce: string;
    campaignId?: string;
    attestation?: any;
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
  }) => void;
}

export function TransferForm({
  campaignId = 'camp_arc_default',
  brandName = 'Arc Network Foundation',
  adTitle = 'Instant USDC on Arc Network',
  videoUrl,
  durationSeconds = 10,
  isAdCompleted,
  adSessionToken,
  onAdComplete,
  onTransferSubmitted,
}: TransferFormProps) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  const [recipient, setRecipient] = useState<string>('');
  const [amount, setAmount] = useState<string>('1.0');
  const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(false);
  const [isCheckingSponsor, setIsCheckingSponsor] = useState<boolean>(false);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [activeSponsor, setActiveSponsor] = useState<{
    id: string;
    name: string;
    videoUrl: string;
  } | null>(null);

  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read real on-chain USDC balance on Arc Mainnet
  const { data: rawBalance, isLoading: isLoadingBalance } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: USDC_EIP3009_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const formattedBalance = rawBalance ? formatUsdcUnits(rawBalance) : '0.00';

  const isValidRecipient = Boolean(recipient && isAddress(recipient.trim()));
  let parsedAmountBigInt: bigint | null = null;
  let isAmountValid = false;
  try {
    if (amount) {
      parsedAmountBigInt = parseUsdcUnits(amount);
      isAmountValid = parsedAmountBigInt > 0n;
    }
  } catch {
    isAmountValid = false;
  }

  const canReview = isConnected && isValidRecipient && isAmountValid && isAdCompleted;

  const handleConnectWallet = async () => {
    setErrorMessage(null);
    try {
      const connector = connectors.find((c) => c.id === 'injected') || connectors[0];
      if (!connector) {
        throw new Error('No EVM wallet detected. Please install MetaMask or another browser wallet.');
      }
      const res = await connectAsync({ connector, chainId: arcMainnet.id });
      if (res.chainId !== arcMainnet.id && switchChainAsync) {
        await switchChainAsync({ chainId: arcMainnet.id }).catch(() => {});
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to connect wallet.');
    }
  };

  /**
   * Check backend for an active sponsor with budget & video URL.
   * If available, display video player & start playing.
   * If not available, display "Sorry, no sponsor found".
   */
  const handleWatchAdClick = async () => {
    setErrorMessage(null);
    setSponsorError(null);

    if (!isConnected) {
      await handleConnectWallet();
      return;
    }
    if (!isValidRecipient) {
      setErrorMessage('Please enter a valid Arc recipient address (0x...).');
      return;
    }
    if (!isAmountValid || !parsedAmountBigInt) {
      setErrorMessage('Please enter a valid USDC transfer amount.');
      return;
    }

    setIsCheckingSponsor(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';
      const res = await fetch(`${baseUrl}/api/sponsor/check`);
      const data = await res.json();

      if (!res.ok || !data.available || !data.sponsor?.videoUrl) {
        setSponsorError(data.message || 'Sorry, no sponsor found');
        setShowVideoPlayer(false);
        setIsAdPlaying(false);
        return;
      }

      // Valid sponsor found! Display video player and play.
      setActiveSponsor({
        id: data.sponsor.id,
        name: data.sponsor.name,
        videoUrl: data.sponsor.videoUrl,
      });
      setSponsorError(null);
      setShowVideoPlayer(true);
      setIsAdPlaying(true);
    } catch (err: any) {
      console.error('Error checking sponsor:', err);
      setSponsorError('Sorry, no sponsor found');
      setShowVideoPlayer(false);
      setIsAdPlaying(false);
    } finally {
      setIsCheckingSponsor(false);
    }
  };

  const handleOpenReview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!isConnected) {
      handleConnectWallet();
      return;
    }
    if (!isValidRecipient) {
      setErrorMessage('Please enter a valid Arc recipient address (0x...).');
      return;
    }
    if (!isAmountValid || !parsedAmountBigInt) {
      setErrorMessage('Please enter a valid USDC transfer amount.');
      return;
    }
    if (!isAdCompleted) {
      handleWatchAdClick();
      return;
    }

    setIsReviewOpen(true);
  };

  const handleConfirmAndSign = async () => {
    if (!address || !parsedAmountBigInt || !isValidRecipient || !adSessionToken) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const trimmedRecipient = recipient.trim() as `0x${string}`;
      const amountUnitsStr = parsedAmountBigInt.toString();
      const currentCampaignId = activeSponsor?.id || campaignId;
      const currentBrand = activeSponsor?.name || brandName;

      // 1. Generate client userNonce and request on-chain attestation
      const clientUserNonce = generateEip3009Nonce();
      const attestation = await requestGasAttestation({
        campaignId: currentCampaignId,
        userAddress: address,
        recipientAddress: trimmedRecipient,
        amountUsdcUnits: amountUnitsStr,
        adSessionToken,
        userNonce: clientUserNonce,
      });

      // 2. Prepare EIP-3009 ReceiveWithAuthorization typed data
      // For on-chain vault escrow (Architecture A), the auth recipient MUST be the vault
      const vaultTarget = ADGAS_VAULT_ADDRESS;
      const validAfter = Number(attestation.validAfter ?? 0);
      const validBefore = Number(attestation.validBefore ?? (Math.floor(Date.now() / 1000) + 300));
      const authNonce = (attestation.userNonce || clientUserNonce) as `0x${string}`;

      const typedData = buildReceiveWithAuthorizationTypedData({
        vaultAddress: vaultTarget,
        from: address,
        value: parsedAmountBigInt,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: authNonce,
      });

      // 3. Request user signature in wallet
      const rawSignature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      // 4. Split signature into r, s, v
      const { r, s, v } = splitSignatureBytes(rawSignature as `0x${string}`);

      // 5. Notify parent to proceed to relay submission
      setIsReviewOpen(false);
      onTransferSubmitted({
        attestationNonce: attestation.attestationNonce || attestation.nonce,
        campaignId: attestation.campaignId || currentCampaignId,
        attestation,
        authorization: {
          from: address,
          to: vaultTarget,
          value: amountUnitsStr,
          validAfter,
          validBefore,
          nonce: authNonce,
          v,
          r,
          s,
        },
        transferDetails: {
          recipient: trimmedRecipient,
          amountFormatted: amount,
          brandName: currentBrand,
        },
      });
    } catch (err: any) {
      console.error('Signing or attestation error:', err);
      setErrorMessage(err?.message || 'Failed to authorize transfer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveBrandName = activeSponsor?.name || brandName;
  const effectiveVideoUrl = activeSponsor?.videoUrl || videoUrl;

  return (
    <div className="w-full text-naka-dark">
      <form onSubmit={handleOpenReview} className="space-y-5">
        {/* SECTION 1: TRANSFER AMOUNT */}
        <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-neutral-600 font-sans text-xs">
              Transfer Amount
            </span>
            <div className="flex items-center space-x-2 text-neutral-500 font-mono text-[11px]">
              <span>Balance:</span>
              <span className="font-semibold text-naka-dark">
                {isLoadingBalance ? '...' : `${formattedBalance} USDC`}
              </span>
              {rawBalance && rawBalance > 0n && (
                <button
                  type="button"
                  onClick={() => setAmount(formattedBalance)}
                  className="font-bold text-naka-orange hover:text-naka-orange-hover px-2 py-0.5 rounded bg-orange-50 border border-orange-200/80 transition-colors cursor-pointer"
                >
                  MAX
                </button>
              )}
            </div>
          </div>

          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl font-bold font-sans text-neutral-400">$</span>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-white border border-naka-border rounded-xl pl-9 pr-24 py-3.5 text-2xl font-bold font-mono text-naka-dark placeholder-neutral-300 focus:outline-none focus:border-naka-orange focus:ring-1 focus:ring-naka-orange/20 transition-all"
            />
            <div className="absolute right-3 flex items-center space-x-1.5 bg-neutral-100 border border-naka-border px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-naka-dark">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>USDC</span>
            </div>
          </div>

          {/* Quick preset chips */}
          <div className="flex items-center space-x-2 pt-0.5">
            {['1', '5', '10', '25', '50'].map((val) => (
              <button
                type="button"
                key={val}
                onClick={() => setAmount(val)}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all cursor-pointer ${
                  amount === val
                    ? 'bg-naka-dark text-white font-semibold shadow-xs'
                    : 'bg-white border border-naka-border text-neutral-500 hover:text-naka-dark hover:border-neutral-400'
                }`}
              >
                ${val}
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 2: RECIPIENT ADDRESS */}
        <div className="p-5 rounded-2xl bg-neutral-50/70 border border-naka-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-neutral-600 font-sans text-xs">
              Recipient Address
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              {ARC_MAINNET_CHAIN_ID === 5042002 ? 'Arc Testnet (5042002)' : 'Arc Mainnet (5042)'}
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x... recipient EVM address"
              className="w-full bg-white border border-naka-border rounded-xl px-4 py-3 text-xs font-mono text-naka-dark placeholder-neutral-400 focus:outline-none focus:border-naka-orange focus:ring-1 focus:ring-naka-orange/20 transition-all pr-10"
            />
            {isValidRecipient && (
              <div className="absolute right-3.5 top-3 text-naka-green" title="Valid Arc Address">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: NETWORK GAS FEE TRANSPARENCY */}
        <div className="p-4 rounded-2xl bg-white border border-naka-border flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-naka-border flex items-center justify-center text-naka-orange">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-naka-dark font-sans text-xs">Network Gas Fee</div>
              <div className="text-[11px] font-sans text-neutral-500">
                {isAdCompleted
                  ? `100% Covered by ${effectiveBrandName}`
                  : 'Covered when you watch a sponsor video'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-sm text-naka-green font-mono">$0.00 USDC</div>
            <div className="text-[10px] text-neutral-400 line-through font-mono">~0.0015 USDC</div>
          </div>
        </div>

        {/* Sponsor Not Found Alert */}
        {sponsorError && (
          <div className="flex items-start space-x-3 p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950 font-sans">{sponsorError}</div>
              <div className="text-[11px] text-amber-700 mt-0.5 font-sans">
                No active sponsor campaign with available gas pool was found. Please check back later or notify an advertiser.
              </div>
            </div>
          </div>
        )}

        {/* General Error Message */}
        {errorMessage && (
          <div className="flex items-center space-x-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* SECTION 4: SPONSOR VIDEO SPOTLIGHT (Shown strictly when requested or completed) */}
        {(showVideoPlayer || isAdCompleted) && (
          <div className="space-y-2 animate-in fade-in duration-300">
            <VideoAdPlayer
              campaignId={activeSponsor?.id || campaignId}
              brandName={effectiveBrandName}
              adTitle={`${effectiveBrandName} Spotlight`}
              videoUrl={effectiveVideoUrl}
              durationSeconds={durationSeconds}
              isPlayingOverride={isAdPlaying}
              onPlayStateChange={(playing) => {
                setIsAdPlaying(playing);
              }}
              onAdComplete={(proof) => {
                setIsAdPlaying(false);
                onAdComplete(proof);
              }}
              isUnlocked={isAdCompleted}
              onClose={() => {
                if (!isAdCompleted) {
                  setShowVideoPlayer(false);
                  setIsAdPlaying(false);
                }
              }}
            />
          </div>
        )}

        {/* PRIMARY ACTION BUTTON (Single, non-duplicated) */}
        {!isConnected ? (
          <button
            type="button"
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="w-full py-4 px-6 rounded-2xl font-semibold text-sm tracking-wide font-sans flex items-center justify-center space-x-2 bg-naka-dark hover:bg-neutral-800 text-white cursor-pointer active:scale-[0.99] transition-all shadow-sm"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Connecting Wallet...</span>
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4 text-naka-orange" />
                <span>Connect Wallet to Transfer</span>
              </>
            )}
          </button>
        ) : isCheckingSponsor ? (
          <button
            type="button"
            disabled
            className="w-full py-4 px-6 rounded-2xl font-semibold text-sm font-sans flex items-center justify-center space-x-2 bg-neutral-100 text-neutral-500 border border-naka-border cursor-not-allowed select-none transition-all shadow-xs"
          >
            <Loader2 className="w-4 h-4 animate-spin text-naka-orange" />
            <span>Checking Sponsor Video...</span>
          </button>
        ) : !isAdCompleted ? (
          isAdPlaying ? (
            <button
              type="button"
              disabled
              className="w-full py-4 px-6 rounded-2xl font-semibold text-sm font-sans flex items-center justify-center space-x-2 bg-neutral-100 text-neutral-500 border border-naka-border cursor-not-allowed select-none transition-all shadow-xs"
            >
              <Loader2 className="w-4 h-4 animate-spin text-naka-orange" />
              <span>Watching Sponsor Video...</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleWatchAdClick}
              className="w-full py-4 px-6 rounded-2xl font-semibold text-sm tracking-wide font-sans flex items-center justify-center space-x-2 bg-naka-dark hover:bg-neutral-800 text-white shadow-sm transition-all cursor-pointer active:scale-[0.99]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Watch Ad for Gasless Payment</span>
            </button>
          )
        ) : (
          <button
            type="submit"
            disabled={!canReview}
            className={`w-full py-4 px-6 rounded-2xl font-semibold text-sm tracking-wide font-sans flex items-center justify-center space-x-2 transition-all duration-200 shadow-sm ${
              canReview
                ? 'bg-naka-dark hover:bg-neutral-800 text-white cursor-pointer active:scale-[0.99]'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed border border-naka-border'
            }`}
          >
            <span>Send Gasless Payment ($0 Gas)</span>
            <ArrowRight className="w-4 h-4 text-naka-orange" />
          </button>
        )}
      </form>

      {/* Review & Authorize Modal */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white border border-naka-border rounded-3xl p-6 sm:p-7 shadow-2xl relative text-left">
            <h3 className="text-xl font-bold text-naka-dark tracking-tight font-display mb-1">
              Review Transfer Authorization
            </h3>
            <p className="text-xs font-mono text-neutral-500 mb-6">
              GASLESS EIP-3009 PERMIT // ZERO GAS TO SIGN
            </p>

            <div className="space-y-3 p-4 rounded-2xl bg-neutral-50 border border-naka-border mb-6 font-mono text-xs">
              <div className="flex justify-between items-center py-1 border-b border-naka-border/60">
                <span className="text-neutral-500">From (You):</span>
                <span className="font-semibold text-naka-dark">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-naka-border/60">
                <span className="text-neutral-500">Recipient:</span>
                <span className="font-semibold text-naka-dark">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-naka-border/60">
                <span className="text-neutral-500">Transfer Value:</span>
                <span className="font-bold text-naka-dark">{amount} USDC</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-naka-border/60">
                <span className="text-neutral-500">Sponsor Subsidy:</span>
                <span className="text-naka-green font-semibold">100% Gas Free ({effectiveBrandName})</span>
              </div>
              <div className="flex justify-between items-center pt-1 text-sm font-bold">
                <span className="text-naka-dark">Total Deducted:</span>
                <span className="text-naka-orange">{amount} USDC</span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-medium bg-neutral-100 hover:bg-neutral-200 text-naka-dark border border-naka-border transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSign}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Signing in Wallet...</span>
                  </>
                ) : (
                  <>
                    <span>Sign & Authorize</span>
                    <ArrowRight className="w-3.5 h-3.5 text-naka-orange" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
