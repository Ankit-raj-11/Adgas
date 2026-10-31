'use client';

import React from 'react';
import { AdvertiserDashboard } from '../../components/AdvertiserDashboard';
import { Coins, Zap } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID } from '@adgas/shared';

export default function AdvertiserPage() {
  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12 pb-24 font-sans text-naka-dark">
      {/* Page Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 border border-naka-border text-xs font-mono font-medium text-naka-dark mb-3">
          <Coins className="w-3.5 h-3.5 text-naka-orange" />
          <span>SPONSOR INFRASTRUCTURE // ARC MAINNET ({ARC_MAINNET_CHAIN_ID})</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-naka-dark tracking-tight font-display">
          Advertiser Portal
        </h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-2xl leading-relaxed">
          Fund gas subsidy pools to drive verified Web3 engagement. Manage real-time balances, pause or resume campaigns, and link spotlight video media on Arc Mainnet.
        </p>
      </div>

      {/* Main Campaign Management Dashboard */}
      <AdvertiserDashboard />
    </div>
  );
}
