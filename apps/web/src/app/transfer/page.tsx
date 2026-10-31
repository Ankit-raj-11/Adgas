'use client';

import React, { useState, useEffect } from 'react';
import { TransferForm } from '../../components/TransferForm';
import { ReceiptCard, RelayingStep, GasReceiptData } from '../../components/ReceiptCard';
import { submitRelayTransfer } from '../../lib/transferClient';
import { AdCompletionProof } from '../../lib/adSession';
import { Zap } from 'lucide-react';

interface ActiveCampaign {
  id: string;
  brandName: string;
  adTitle: string;
  videoUrl?: string;
  durationSeconds: number;
}

const DEFAULT_CAMPAIGN: ActiveCampaign = {
  id: 'camp_arc_default',
  brandName: 'Arc Network Foundation',
  adTitle: 'Arc Network Foundation Spotlight',
  videoUrl: '',
  durationSeconds: 30,
};

export default function TransferPage() {
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign>(DEFAULT_CAMPAIGN);
  const [isAdCompleted, setIsAdCompleted] = useState<boolean>(false);
  const [adSessionToken, setAdSessionToken] = useState<string | undefined>(undefined);

  // Relaying / Receipt State
  const [relayStatus, setRelayStatus] = useState<RelayingStep>('idle');
  const [receiptData, setReceiptData] = useState<GasReceiptData | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_RELAYER_URL || 'https://adgas.onrender.com';

  // Fetch real active campaign from Relayer API
  useEffect(() => {
    let isMounted = true;
    async function loadCampaigns() {
      try {
        const res = await fetch(`${baseUrl}/api/campaigns`);
        if (res.ok) {
          const data = await res.json();
          const eligible = (data.campaigns || []).filter(
            (c: any) =>
              c.status === 'active' &&
              BigInt(c.availableBalanceUsdcUnits || '0') > 0n &&
              typeof c.videoUrl === 'string' &&
              c.videoUrl.trim().length > 0
          );
          eligible.sort((a: any, b: any) => {
            const aIsDefault = a.id === 'camp_arc_default';
            const bIsDefault = b.id === 'camp_arc_default';
            if (aIsDefault && !bIsDefault) return 1;
            if (!aIsDefault && bIsDefault) return -1;
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });

          const active = eligible[0];
          if (active && isMounted) {
            setActiveCampaign({
              id: active.id,
              brandName: active.name,
              adTitle: `${active.name} Spotlight`,
              videoUrl: active.videoUrl || '',
              durationSeconds: 30,
            });
          }
        }
      } catch {
        // Fallback to default
      }
    }
    loadCampaigns();
    return () => {
      isMounted = false;
    };
  }, [baseUrl]);

  const handleAdComplete = (proof: AdCompletionProof) => {
    setIsAdCompleted(true);
    setAdSessionToken(proof.adSessionToken);
  };

  const handleTransferSubmitted = async (params: {
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
  }) => {
    setRelayStatus('simulating');
    setRelayError(null);

    try {
      setTimeout(() => setRelayStatus('broadcasting'), 800);

      const result = await submitRelayTransfer({
        attestationNonce: params.attestationNonce,
        campaignId: params.campaignId,
        attestation: params.attestation,
        authorization: params.authorization,
      });

      setRelayStatus('confirmed');
      const gasBreakdown = result.gasBreakdown || {
        gasUsed: (result as any).gasUsed || '135000',
        effectiveGasPriceWei: (result as any).nativeGasCostWei || '25000000000',
        actualGasCostWei: (result as any).nativeGasCostWei || '3375000000000000',
        actualGasCostUsdcUnits: (result as any).actualCostUsdc || '1500',
      };
      setReceiptData({
        txHash: result.txHash,
        blockNumber: Number(result.blockNumber),
        explorerUrl: result.explorerUrl,
        attestationNonce: params.attestationNonce,
        gasBreakdown,
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
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12 pb-24 font-sans text-naka-dark">
      {/* Editorial Header */}
      <div className="mb-8 text-center max-w-xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 border border-naka-border text-xs font-mono font-medium text-naka-dark mb-3">
          <Zap className="w-3.5 h-3.5 text-naka-orange fill-naka-orange" />
          <span>PAYMENT TERMINAL // ARC MAINNET</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-naka-dark tracking-tight font-display leading-tight">
          Send USDC With <span className="text-naka-orange">$0 Gas</span>
        </h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed font-sans">
          Sponsors cover your network execution fees in exchange for verified attention. Zero native gas tokens needed.
        </p>
      </div>

      {/* Centered Master Payment Terminal Card */}
      <div className="max-w-xl mx-auto w-full">
        <div className="bg-white border border-naka-border rounded-3xl p-6 sm:p-8 shadow-sm relative">
          {relayStatus === 'idle' ? (
            <TransferForm
              campaignId={activeCampaign.id}
              brandName={activeCampaign.brandName}
              adTitle={activeCampaign.adTitle}
              videoUrl={activeCampaign.videoUrl}
              durationSeconds={activeCampaign.durationSeconds}
              isAdCompleted={isAdCompleted}
              adSessionToken={adSessionToken}
              onAdComplete={handleAdComplete}
              onTransferSubmitted={handleTransferSubmitted}
            />
          ) : (
            <ReceiptCard
              status={relayStatus}
              receipt={receiptData}
              errorMessage={relayError || undefined}
              onReset={handleReset}
            />
          )}
        </div>
      </div>
    </div>
  );
}
