import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID, ARC_USDC_ADDRESS, ARC_MAINNET_EXPLORER } from '@adgas/shared';

export function Footer() {
  return (
    <footer className="border-t border-naka-dark-border bg-naka-dark text-neutral-400 py-12 md:py-14 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
        {/* Brand Column */}
        <div className="md:col-span-4 space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-800 text-white flex items-center justify-center font-mono font-bold text-xs">
              <span className="text-naka-orange">A</span>G
            </div>
            <span className="text-lg font-bold text-white tracking-tight font-display">
              ADGAS
            </span>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed max-w-sm">
            Sponsored transaction infrastructure connecting advertiser campaign budgets with gas-sponsored USDC payments on Arc Network.
          </p>
          <div className="inline-flex items-center space-x-2 text-xs font-mono text-neutral-300 bg-neutral-800/60 border border-neutral-700/60 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-naka-green" />
            <span>Arc Mainnet • Chain ID {ARC_MAINNET_CHAIN_ID}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="md:col-span-2 space-y-3 text-sm">
          <div className="text-white font-semibold text-xs font-mono uppercase tracking-wider">
            Navigation
          </div>
          <ul className="space-y-2">
            <li>
              <Link href="/" className="hover:text-white transition-colors">
                Overview
              </Link>
            </li>
            <li>
              <Link href="/transfer" className="hover:text-white transition-colors">
                Consumer App
              </Link>
            </li>
            <li>
              <Link href="/advertiser" className="hover:text-white transition-colors">
                Advertiser Portal
              </Link>
            </li>
          </ul>
        </div>

        {/* Architecture & Standards */}
        <div className="md:col-span-3 space-y-3 text-sm">
          <div className="text-white font-semibold text-xs font-mono uppercase tracking-wider">
            Architecture
          </div>
          <ul className="space-y-2 text-xs font-mono">
            <li className="flex items-center justify-between">
              <span className="text-neutral-400">Payment Standard:</span>
              <span className="text-neutral-200">EIP-3009</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-neutral-400">Attestation:</span>
              <span className="text-neutral-200">EIP-712 Typed Data</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-neutral-400">Unit Scaling:</span>
              <span className="text-neutral-200">10^12 Ceiling Division</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-neutral-400">Settlement:</span>
              <span className="text-neutral-200">Arc Relayer EOA</span>
            </li>
          </ul>
        </div>

        {/* Canonical Token & Explorer */}
        <div className="md:col-span-3 space-y-3 text-sm">
          <div className="text-white font-semibold text-xs font-mono uppercase tracking-wider">
            Verification
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            All sponsored transfers interact strictly with Arc’s pre-deployed canonical USDC contract. Zero custom proxy contracts.
          </p>
          <div className="pt-1">
            <a
              href={`${ARC_MAINNET_EXPLORER}/address/${ARC_USDC_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs font-mono text-naka-orange hover:text-white transition-colors"
            >
              <span>Verify Canonical USDC</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Legal & Disclaimer Strip */}
      <div className="max-w-7xl mx-auto pt-8 border-t border-neutral-800 text-xs text-neutral-400 space-y-3">
        <p className="leading-relaxed text-[11px]">
          AdGas is a transaction relay and sponsorship infrastructure platform. AdGas does not take custody of user funds; transfers are signed off-chain via standard EIP-3009 authorizations directly by the user’s wallet. Native gas fees are reimbursed to the relayer through configured advertiser sponsorship pools subject to campaign availability and verification.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 text-neutral-400 text-[11px] font-mono">
          <div>© {new Date().getFullYear()} AdGas Protocol. Built on Arc Network.</div>
          <div className="flex items-center space-x-4">
            <span>EIP-3009 Compliant</span>
            <span>•</span>
            <span>Non-Custodial</span>
            <span>•</span>
            <span>Arc Mainnet</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
