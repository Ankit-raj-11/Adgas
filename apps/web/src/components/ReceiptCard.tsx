'use client';

import React from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Flame,
  ShieldCheck,
  ArrowRight,
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
    <div className="w-full bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300">
      {/* Background glow based on status */}
      <div
        className={`absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
          isConfirmed
            ? 'bg-emerald-500/10'
            : isFailed
            ? 'bg-rose-500/10'
            : 'bg-blue-500/10'
        }`}
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-800 mb-6">
        <div className="flex items-center space-x-2.5">
          {isConfirmed ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : isFailed ? (
            <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {isConfirmed
                ? 'Transfer Confirmed on Arc Mainnet'
                : isFailed
                ? 'Relay Broadcast Failed'
                : 'Relaying Gasless Transfer...'}
            </h3>
            <p className="text-xs text-gray-400">
              {isConfirmed
                ? 'Cryptographic settlement receipt issued.'
                : isFailed
                ? 'An error occurred during verification or execution.'
                : 'Adgas relayer is simulating and broadcasting your transaction.'}
            </p>
          </div>
        </div>

        {onReset && (isConfirmed || isFailed) && (
          <button
            onClick={onReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Transfer</span>
          </button>
        )}
      </div>

      {/* Real-time progression steps */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {/* Step 1: Simulating */}
        <div
          className={`p-3 rounded-xl border text-left transition-all ${
            isSimulating
              ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
              : isBroadcasting || isConfirmed
              ? 'bg-[#0B0F19] border-gray-800 text-gray-300'
              : 'bg-[#0B0F19]/40 border-gray-800/40 text-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">1. Simulation</span>
            {isSimulating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : isBroadcasting || isConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : null}
          </div>
          <p className="text-[11px] text-gray-400">Gas pre-validation</p>
        </div>

        {/* Step 2: Broadcasting */}
        <div
          className={`p-3 rounded-xl border text-left transition-all ${
            isBroadcasting
              ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
              : isConfirmed
              ? 'bg-[#0B0F19] border-gray-800 text-gray-300'
              : 'bg-[#0B0F19]/40 border-gray-800/40 text-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">2. Broadcast</span>
            {isBroadcasting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : isConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : null}
          </div>
          <p className="text-[11px] text-gray-400">Arc Mempool</p>
        </div>

        {/* Step 3: Confirmed */}
        <div
          className={`p-3 rounded-xl border text-left transition-all ${
            isConfirmed
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : isFailed
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
              : 'bg-[#0B0F19]/40 border-gray-800/40 text-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">3. Settlement</span>
            {isConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : isFailed ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            ) : null}
          </div>
          <p className="text-[11px] text-gray-400">Receipt Mined</p>
        </div>
      </div>

      {/* Failure Banner */}
      {isFailed && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs mb-4">
          <div className="font-semibold mb-0.5">Execution Failed</div>
          <div className="font-mono text-[11px] break-all">{errorMessage || 'Transaction execution failed.'}</div>
        </div>
      )}

      {/* Confirmed Receipt Card */}
      {isConfirmed && receipt && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Summary Banner */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="text-xs font-bold text-white block">
                  {receipt.transferDetails?.amountFormatted || 'USDC'} Transferred
                </span>
                <span className="text-[11px] text-gray-400">
                  Recipient received full value. $0 gas deducted from sender.
                </span>
              </div>
            </div>
            <a
              href={receipt.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition-colors"
            >
              <span>View on Arc Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Detailed cryptographic parameters table */}
          <div className="bg-[#0B0F19] border border-gray-800 rounded-xl p-4 space-y-2.5 text-xs font-mono">
            <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
              <span className="text-gray-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-gray-500" />
                Transaction Hash
              </span>
              <a
                href={receipt.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 truncate max-w-[220px]"
                title={receipt.txHash}
              >
                {receipt.txHash}
              </a>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
              <span className="text-gray-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                Block Height
              </span>
              <span className="text-gray-200">#{receipt.blockNumber}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
              <span className="text-gray-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                Actual Gas Consumed
              </span>
              <span className="text-gray-200">
                {Number(receipt.gasBreakdown.gasUsed).toLocaleString()} units
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Effective Gas Price</span>
              <span className="text-gray-200">
                {receipt.gasBreakdown.effectiveGasPriceWei} wei
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Relayer Gas Cost</span>
              <span className="text-emerald-400 font-bold">
                {formatUsdcUnits(BigInt(receipt.gasBreakdown.actualGasCostUsdcUnits))} USDC
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-gray-400">Attestation Nonce</span>
              <span className="text-gray-500 truncate max-w-[200px]" title={receipt.attestationNonce}>
                {receipt.attestationNonce}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
