'use client';

import React from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Flame,
  ShieldCheck,
  RotateCcw,
  Clock,
  Layers,
} from 'lucide-react';
import { formatUsdcUnits } from '../lib/transferClient';

export type RelayingStep = 'idle' | 'simulating' | 'broadcasting' | 'confirmed' | 'failed';

export interface GasReceiptData {
  txHash: `0x${string}`;
  blockNumber: number;
  explorerUrl: string;
  attestationNonce: string;
  gasBreakdown: {
    gasUsed: string;
    effectiveGasPriceWei: string;
    actualGasCostWei: string;
    actualGasCostUsdcUnits: string;
  };
  transferDetails?: {
    recipient: string;
    amountFormatted: string;
    brandName: string;
  };
}

export interface ReceiptCardProps {
  status: RelayingStep;
  receipt?: GasReceiptData | null;
  errorMessage?: string | null;
  onReset?: () => void;
}

export function ReceiptCard({
  status,
  receipt,
  errorMessage,
  onReset,
}: ReceiptCardProps) {
  if (status === 'idle') return null;

  const isSimulating = status === 'simulating';
  const isBroadcasting = status === 'broadcasting';
  const isConfirmed = status === 'confirmed';
  const isFailed = status === 'failed';

  return (
    <div className="w-full bg-white border border-naka-border rounded-3xl p-7 shadow-sm relative overflow-hidden transition-all duration-300 text-naka-dark">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-naka-border mb-6">
        <div className="flex items-center space-x-3">
          {isConfirmed ? (
            <div className="w-10 h-10 rounded-xl bg-naka-surface border border-naka-border flex items-center justify-center text-naka-green">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : isFailed ? (
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-naka-surface border border-naka-border flex items-center justify-center text-naka-orange">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-naka-dark tracking-tight font-display">
              {isConfirmed
                ? 'Transfer Confirmed on Arc Mainnet'
                : isFailed
                ? 'Relay Broadcast Failed'
                : 'Relaying Gasless Transfer...'}
            </h3>
            <p className="text-xs font-sans text-neutral-500 mt-0.5">
              {isConfirmed
                ? 'Cryptographic settlement receipt confirmed on-chain'
                : isFailed
                ? 'An error occurred during verification or execution'
                : 'Simulating and broadcasting via Arc relayer'}
            </p>
          </div>
        </div>

        {onReset && (isConfirmed || isFailed) && (
          <button
            onClick={onReset}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-sans font-medium bg-neutral-100 hover:bg-neutral-200 text-naka-dark border border-neutral-200 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Transfer</span>
          </button>
        )}
      </div>

      {/* Real-time progression steps */}
      <div className="grid grid-cols-3 gap-3 mb-6 font-sans">
        {/* Step 1: Simulating */}
        <div
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            isSimulating
              ? 'bg-orange-50/50 border-naka-orange text-naka-orange'
              : isBroadcasting || isConfirmed
              ? 'bg-neutral-50/80 border-neutral-200 text-naka-dark'
              : 'bg-white border-neutral-200/60 text-neutral-400'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold">1. Simulate</span>
            {isSimulating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-naka-orange" />
            ) : isBroadcasting || isConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-naka-green" />
            ) : null}
          </div>
          <p className="text-[11px] text-neutral-500 font-sans">Pre-flight checks</p>
        </div>

        {/* Step 2: Broadcasting */}
        <div
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            isBroadcasting
              ? 'bg-orange-50/50 border-naka-orange text-naka-orange'
              : isConfirmed
              ? 'bg-neutral-50/80 border-neutral-200 text-naka-dark'
              : 'bg-white border-neutral-200/60 text-neutral-400'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold">2. Broadcast</span>
            {isBroadcasting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-naka-orange" />
            ) : isConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-naka-green" />
            ) : null}
          </div>
          <p className="text-[11px] text-neutral-500 font-sans">Arc Mempool</p>
        </div>

        {/* Step 3: Confirmed */}
        <div
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            isConfirmed
              ? 'bg-emerald-50 border-naka-green text-naka-green'
              : isFailed
              ? 'bg-rose-50 border-rose-300 text-rose-600'
              : 'bg-white border-neutral-200/60 text-neutral-400'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold">3. Settle</span>
            {isConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-naka-green" />
            ) : isFailed ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            ) : null}
          </div>
          <p className="text-[11px] text-neutral-500 font-sans">Receipt Mined</p>
        </div>
      </div>

      {/* Failure Banner */}
      {isFailed && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs mb-4 font-sans">
          <div className="font-bold mb-1">Execution Failed</div>
          <div className="text-[11px] break-all">{errorMessage || 'Transaction execution failed.'}</div>
        </div>
      )}

      {/* Confirmed Receipt Card */}
      {isConfirmed && receipt && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Summary Banner */}
          <div className="bg-neutral-50/80 border border-neutral-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <ShieldCheck className="w-5 h-5 text-naka-green flex-shrink-0" />
              <div>
                <span className="text-xs font-bold text-naka-dark font-sans block">
                  {receipt.transferDetails?.amountFormatted || 'USDC'} USDC Transferred
                </span>
                <span className="text-[11px] text-neutral-500 font-sans">
                  Recipient received full value. $0 native gas paid by sender.
                </span>
              </div>
            </div>
            <a
              href={receipt.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-full text-xs font-sans font-semibold bg-naka-dark hover:bg-neutral-800 text-white transition-colors shadow-sm"
            >
              <span>Arc Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Detailed parameter table */}
          <div className="bg-neutral-50/60 border border-neutral-200 rounded-2xl p-5 space-y-2.5 text-xs font-mono">
            <div className="flex justify-between items-center py-1.5 border-b border-neutral-200/80">
              <span className="text-neutral-500 font-sans flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-neutral-400" />
                Transaction Hash
              </span>
              <a
                href={receipt.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-naka-dark font-medium hover:text-naka-orange hover:underline truncate max-w-[220px]"
                title={receipt.txHash}
              >
                {receipt.txHash}
              </a>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-200/80">
              <span className="text-neutral-500 font-sans flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                Block Height
              </span>
              <span className="text-naka-dark font-medium">#{receipt.blockNumber}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-200/80">
              <span className="text-neutral-500 font-sans flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-naka-orange" />
                Gas Consumed
              </span>
              <span className="text-naka-dark">
                {Number(receipt.gasBreakdown?.gasUsed || 0).toLocaleString()} units
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-200/80">
              <span className="text-neutral-500 font-sans">Effective Gas Price</span>
              <span className="text-naka-dark">
                {receipt.gasBreakdown?.effectiveGasPriceWei || '20000000000'} wei
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-200/80">
              <span className="text-neutral-500 font-sans">Sponsored Gas Debit</span>
              <span className="text-naka-green font-bold">
                {formatUsdcUnits(BigInt(receipt.gasBreakdown?.actualGasCostUsdcUnits || 0))} USDC
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5">
              <span className="text-neutral-500 font-sans">Attestation Nonce</span>
              <span className="text-neutral-400 truncate max-w-[200px]" title={receipt.attestationNonce}>
                {receipt.attestationNonce}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
