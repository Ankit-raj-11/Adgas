'use client';

import React, { useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { isAddress } from 'viem';
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  Wallet,
  Loader2,
} from 'lucide-react';
import {
  parseUsdcUnits,
  generateEip3009Nonce,
  buildEip3009TypedData,
  splitSignatureBytes,
  requestGasAttestation,
} from '../lib/transferClient';
import { ARC_USDC_ADDRESS } from '@adgas/shared';

export interface TransferFormProps {
  campaignId: string;
  brandName: string;
  isAdCompleted: boolean;
  adSessionToken?: string;
  onInitiateAdPrompt?: () => void;
  onTransferSubmitted: (params: {
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
  }) => void;
}

export function TransferForm({
  campaignId,
  brandName,
  isAdCompleted,
  adSessionToken,
  onInitiateAdPrompt,
  onTransferSubmitted,
}: TransferFormProps) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [recipient, setRecipient] = useState<string>('');
  const [amount, setAmount] = useState<string>('5.0');
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Validation
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

  const handleOpenReview = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isConnected) {
      setErrorMessage('Please connect your EVM wallet first.');
      return;
    }
    if (!isAdCompleted) {
      setErrorMessage('Please complete the brief sponsored video ad above to unlock $0 gas.');
      return;
    }
    if (!isValidRecipient) {
      setErrorMessage('Please enter a valid Arc EVM recipient address.');
      return;
    }
    if (!isAmountValid || !parsedAmountBigInt) {
      setErrorMessage('Please enter a valid USDC amount.');
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

      // 1. Obtain relayer attestation
      const attestation = await requestGasAttestation({
        campaignId,
        userAddress: address,
        recipientAddress: trimmedRecipient,
        amountUsdcUnits: amountUnitsStr,
        adSessionToken,
      });

      // 2. Prepare EIP-3009 typed data
      const nonce = generateEip3009Nonce();
      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity

      const typedData = buildEip3009TypedData({
        from: address,
        to: trimmedRecipient,
        value: parsedAmountBigInt,
        validAfter,
        validBefore,
        nonce,
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
        attestationNonce: attestation.attestationNonce,
        authorization: {
          from: address,
          to: trimmedRecipient,
          value: amountUnitsStr,
          validAfter,
          validBefore,
          nonce,
          v,
          r,
          s,
        },
        transferDetails: {
          recipient: trimmedRecipient,
          amountFormatted: amount,
          brandName,
        },
      });
    } catch (err: any) {
      console.error('Signing or attestation error:', err);
      setErrorMessage(err?.message || 'Failed to authorize transfer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      {/* Background radial accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex items-center justify-between pb-5 border-b border-gray-800 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Sponsored USDC Transfer
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Send native USDC on Arc with 100% sponsored gas fees.
          </p>
        </div>

        {/* Gas Subsidy Badge */}
        {isAdCompleted ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>$0 Gas Sponsored</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onInitiateAdPrompt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Watch ad to waive gas</span>
          </button>
        )}
      </div>

      {/* Transfer Input Form */}
      <form onSubmit={handleOpenReview} className="space-y-4">
        {/* Recipient Address */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
            Recipient EVM Address
          </label>
          <div className="relative">
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {isValidRecipient && (
              <div className="absolute right-3 top-3 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>

        {/* Transfer Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Amount (USDC)
            </label>
            <span className="text-[11px] text-gray-500 font-mono">
              Arc Token: {ARC_USDC_ADDRESS.slice(0, 6)}...{ARC_USDC_ADDRESS.slice(-4)}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-[#0B0F19] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            <div className="absolute right-3 top-3 flex items-center space-x-1.5">
              <span className="text-xs font-bold text-gray-300 bg-gray-800 px-2 py-0.5 rounded">
                USDC
              </span>
            </div>
          </div>
        </div>

        {/* Gas Fee Coverage Indicator Box */}
        <div className="bg-[#0B0F19]/60 border border-gray-800/80 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-medium text-white">Network Gas Fee</div>
              <div className="text-[11px] text-gray-400">
                {isAdCompleted
                  ? `Covered by ${brandName}`
                  : 'Watch video ad above to unlock gas subsidy'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono font-bold text-emerald-400">
              $0.00 USDC
            </div>
            <div className="text-[10px] text-gray-500 line-through font-mono">
              ~0.0015 USDC
            </div>
          </div>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Submit / Review CTA */}
        <button
          type="submit"
          disabled={!canReview}
          className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg ${
            canReview
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20 cursor-pointer active:scale-[0.99]'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-800'
          }`}
        >
          {!isConnected ? (
            <>
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet to Continue</span>
            </>
          ) : !isAdCompleted ? (
            <>
              <Lock className="w-4 h-4" />
              <span>Watch Video Ad to Unlock ($0 Gas)</span>
            </>
          ) : (
            <>
              <span>Review Sponsored Payment</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Payment Review Modal / Card */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#111827] border border-gray-700 rounded-2xl p-6 shadow-2xl relative text-left">
            <h3 className="text-lg font-bold text-white tracking-tight mb-1">
              Confirm Sponsored Transfer
            </h3>
            <p className="text-xs text-gray-400 mb-5">
              Please verify transfer details before authorizing on Arc mainnet.
            </p>

            <div className="space-y-3 bg-[#0B0F19] border border-gray-800 rounded-xl p-4 mb-5 text-xs font-mono">
              <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Transfer Value</span>
                <span className="text-white font-bold text-sm">{amount} USDC</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Recipient</span>
                <span className="text-gray-200 truncate max-w-[200px]" title={recipient}>
                  {recipient.slice(0, 10)}...{recipient.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Network</span>
                <span className="text-gray-300">Arc Mainnet (Chain 5042)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Execution Gas</span>
                <span className="text-emerald-400 font-bold">$0.00 (Sponsored)</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-400">Sponsor</span>
                <span className="text-blue-400 font-sans font-medium">{brandName}</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mb-5 leading-relaxed">
              By authorizing, you sign an EIP-712 / EIP-3009 gasless permit. The Adgas relayer will broadcast and settle execution gas on your behalf.
            </p>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSign}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-2 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Authorize & Sign</span>
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
