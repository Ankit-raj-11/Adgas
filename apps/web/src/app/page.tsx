'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Coins,
  CheckCircle2,
  Lock,
  Layers,
  BarChart3,
  ExternalLink,
  Cpu,
  Clock,
  ArrowUpRight,
  Sparkles,
  Eye,
  FileCheck,
  Send,
} from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID, ARC_USDC_ADDRESS, ARC_MAINNET_EXPLORER } from '@adgas/shared';

export default function LandingPage() {
  const [activeStep, setActiveStep] = useState(0);

  // Auto-advance animation sequence
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const flowSteps = [
    {
      id: '01',
      title: 'SPONSORED ATTENTION',
      subtitle: '5s Verified Spotlight',
      desc: 'User views verified sponsor content. Relayer verifies playback and issues an EIP-712 session attestation.',
      badge: 'EIP-712 Attestation',
      icon: Eye,
    },
    {
      id: '02',
      title: 'USER AUTHORIZATION',
      subtitle: 'Off-Chain EIP-3009 Signature',
      desc: 'User signs a gasless transferWithAuthorization permit in MetaMask. Zero native gas tokens required.',
      badge: 'Zero Native Gas',
      icon: FileCheck,
    },
    {
      id: '03',
      title: 'ADGAS RELAYER',
      subtitle: 'Subsidized Arc Broadcast',
      desc: 'Relayer simulates on Arc Mainnet, covers native execution gas, and broadcasts the transaction.',
      badge: 'EOA Gas Sponsor',
      icon: Cpu,
    },
    {
      id: '04',
      title: 'USDC SETTLEMENT',
      subtitle: 'On-Chain Finality',
      desc: 'Arc canonical USDC contract executes transfer. Gas cost settles against the sponsor campaign pool via 10^12 ceiling division.',
      badge: 'Canonical USDC',
      icon: Send,
    },
  ];

  return (
    <div className="flex-1 flex flex-col font-sans bg-white text-naka-dark">
      {/* SECTION A: HERO */}
      <section className="relative overflow-hidden pt-16 pb-24 md:pt-24 md:pb-32 border-b border-naka-border bg-naka-canvas">
        {/* Subtle Architectural Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f2f2f2_1px,transparent_1px),linear-gradient(to_bottom,#f2f2f2_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            {/* Small Positioning Statement */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-naka-subtle border border-naka-border text-xs font-mono font-medium text-naka-dark mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-naka-orange" />
              <span>SPONSORED TRANSACTION INFRASTRUCTURE FOR ARC</span>
            </div>

            {/* Master Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-naka-dark tracking-tight font-display leading-[1.05]">
              USDC Payments. <br />
              <span className="text-naka-orange">Gas Sponsored.</span>
            </h1>

            {/* Supporting Copy */}
            <p className="mt-6 text-lg sm:text-xl text-naka-muted font-sans leading-relaxed max-w-2xl">
              AdGas connects advertisers with users through sponsored blockchain transactions. Watch sponsored content, authorize your USDC transfer, and let AdGas handle eligible transaction gas costs.
            </p>

            {/* Primary & Secondary Call to Actions */}
            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href="/transfer"
                className="px-8 py-4 rounded-full bg-naka-dark hover:bg-neutral-800 text-white font-sans font-semibold text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md active:scale-98"
              >
                <span>Launch the App</span>
                <ArrowRight className="w-4 h-4 text-naka-orange" />
              </Link>

              <Link
                href="/advertiser"
                className="px-8 py-4 rounded-full bg-naka-subtle hover:bg-neutral-200 text-naka-dark border border-naka-border font-sans font-semibold text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <span>Become a Sponsor</span>
                <ArrowUpRight className="w-4 h-4 text-naka-muted" />
              </Link>
            </div>

            {/* Live Telemetry Metadata Strip */}
            <div className="mt-12 pt-8 border-t border-naka-border grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs font-mono">
              <div>
                <span className="block text-naka-muted">NETWORK</span>
                <span className="font-semibold text-naka-dark">Arc Mainnet ({ARC_MAINNET_CHAIN_ID})</span>
              </div>
              <div>
                <span className="block text-naka-muted">TRANSFER GAS FEE</span>
                <span className="font-semibold text-naka-orange">$0.00 (Sponsored)</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="block text-naka-muted">CANONICAL CONTRACT</span>
                <span className="font-semibold text-naka-dark truncate">
                  {ARC_USDC_ADDRESS.slice(0, 8)}...{ARC_USDC_ADDRESS.slice(-6)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION B: ANIMATED PROTOCOL VISUALIZATION */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-b border-naka-border">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-mono uppercase tracking-widest text-naka-orange mb-2">
            PROTOCOL LIFECYCLE
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-naka-dark tracking-tight font-display">
            The Gasless Execution Pipeline
          </h2>
          <p className="mt-3 text-sm text-naka-muted">
            How value and authorization flow seamlessly between users, advertisers, and the Arc blockchain.
          </p>
        </div>

        {/* Interactive Pipeline Architecture */}
        <div className="bg-naka-surface border border-naka-border rounded-3xl p-6 sm:p-10 shadow-sm relative overflow-hidden">
          {/* Timeline Connector Line */}
          <div className="hidden lg:block absolute top-[94px] left-[10%] right-[10%] h-0.5 bg-naka-border z-0">
            <div
              className="h-full bg-naka-orange transition-all duration-700 ease-out"
              style={{ width: `${(activeStep / 3) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {flowSteps.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = activeStep === idx;
              const isPast = activeStep > idx;

              return (
                <div
                  key={step.id}
                  onClick={() => setActiveStep(idx)}
                  className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer text-left ${
                    isActive
                      ? 'bg-white border-naka-orange shadow-lg ring-1 ring-naka-orange/20 scale-[1.02]'
                      : isPast
                      ? 'bg-white border-naka-border opacity-90'
                      : 'bg-white/60 border-naka-border/60 hover:border-naka-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-xs transition-colors ${
                        isActive
                          ? 'bg-naka-orange text-white'
                          : isPast
                          ? 'bg-naka-dark text-white'
                          : 'bg-naka-subtle text-naka-muted'
                      }`}
                    >
                      <StepIcon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-mono text-naka-muted">{step.id}</span>
                  </div>

                  <div className="text-[11px] font-mono font-semibold tracking-wider text-naka-muted uppercase mb-1">
                    {step.title}
                  </div>
                  <h3 className="text-base font-bold text-naka-dark tracking-tight mb-2">
                    {step.subtitle}
                  </h3>
                  <p className="text-xs text-naka-muted leading-relaxed font-sans mb-4">
                    {step.desc}
                  </p>

                  <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono bg-naka-subtle text-naka-dark border border-naka-border">
                    {step.badge}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Technical Protocol Status Bar */}
          <div className="mt-8 pt-6 border-t border-naka-border flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-naka-muted gap-4">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-naka-green" />
              <span>ACTIVE FLOW: {flowSteps[activeStep].title}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span>ZERO RELAYER LOSS MATH (10^12)</span>
              <span>•</span>
              <span>PURE EIP-3009</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION C: MISSION */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-naka-subtle border border-naka-border text-xs font-mono font-medium text-naka-dark mb-6">
          <span>MISSION & PHILOSOPHY</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-naka-dark tracking-tight font-display leading-tight max-w-4xl mx-auto">
          Making Transaction Costs Invisible to Users.
        </h2>
        <p className="mt-8 text-lg sm:text-xl text-naka-muted font-sans leading-relaxed max-w-3xl mx-auto">
          AdGas gives advertisers a new way to reach engaged blockchain users while helping eligible users complete USDC transfers without personally paying native transaction gas.
        </p>
      </section>

      {/* SECTION D: CORE CAPABILITIES (3 Distinct Compositions) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-t border-naka-border">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-naka-orange mb-2">
            CORE CAPABILITIES
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-naka-dark tracking-tight font-display">
            Engineered for Frictionless Utility
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Capability 1: Sponsored Transaction Access */}
          <div className="bg-naka-surface border border-naka-border rounded-3xl p-8 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-naka-border text-xs font-mono text-naka-dark mb-6">
                01 // ATTENTION SUBSIDY
              </div>
              <h3 className="text-2xl font-bold text-naka-dark tracking-tight font-display mb-3">
                Sponsored Transaction Access
              </h3>
              <p className="text-sm text-naka-muted leading-relaxed font-sans mb-8">
                Eliminate the requirement to buy, bridge, or hold native Arc tokens. Completing a brief 5-second sponsor spotlight unlocks an off-chain attestation waiving 100% of execution costs.
              </p>
            </div>
            {/* Visual Callout Component */}
            <div className="bg-white border border-naka-border rounded-2xl p-4 font-mono text-xs space-y-2.5">
              <div className="flex items-center justify-between text-naka-muted">
                <span>Native Gas Required:</span>
                <span className="text-naka-orange font-bold">$0.00</span>
              </div>
              <div className="flex items-center justify-between text-naka-muted">
                <span>Engagement Required:</span>
                <span className="text-naka-dark font-medium">5 Seconds Verified</span>
              </div>
              <div className="w-full bg-naka-subtle h-2 rounded-full overflow-hidden">
                <div className="bg-naka-orange h-full w-full" />
              </div>
            </div>
          </div>

          {/* Capability 2: Direct USDC Authorization */}
          <div className="bg-naka-dark text-white rounded-3xl p-8 flex flex-col justify-between shadow-xl">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs font-mono text-naka-orange mb-6">
                02 // DIRECT PERMIT
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight font-display mb-3">
                Direct USDC Authorization
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed font-sans mb-8">
                Transfers execute directly against Arc’s canonical USDC contract via EIP-3009. Users sign standard typed data signatures without trusting intermediaries or depositing into proxy vaults.
              </p>
            </div>
            {/* Visual Code Callout Component */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 font-mono text-[11px] text-neutral-300 space-y-1.5">
              <div className="text-neutral-500">// EIP-3009 Function Call</div>
              <div className="text-naka-orange">transferWithAuthorization(</div>
              <div className="pl-3 text-neutral-400">from, to, value,</div>
              <div className="pl-3 text-neutral-400">validAfter, validBefore,</div>
              <div className="pl-3 text-neutral-400">nonce, v, r, s</div>
              <div className="text-naka-orange">)</div>
            </div>
          </div>

          {/* Capability 3: Advertiser-Funded Gas */}
          <div className="bg-naka-surface border border-naka-border rounded-3xl p-8 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-naka-border text-xs font-mono text-naka-dark mb-6">
                03 // BALANCED POOLS
              </div>
              <h3 className="text-2xl font-bold text-naka-dark tracking-tight font-display mb-3">
                Advertiser-Funded Gas
              </h3>
              <p className="text-sm text-naka-muted leading-relaxed font-sans mb-8">
                Sponsors fund gas subsidy pools on Arc Mainnet with strict per-transaction caps. Real-time receipts deduct actual gas costs via a 10^12 ceiling division model with zero relayer loss.
              </p>
            </div>
            {/* Visual Pool Metric Component */}
            <div className="bg-white border border-naka-border rounded-2xl p-4 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-naka-muted">Pool Status:</span>
                <span className="text-naka-green font-semibold">Active & Funded</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-naka-muted">Unit Ceiling Division:</span>
                <span className="text-naka-dark font-medium">10^12 Precision</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-naka-border">
                <span className="text-naka-muted">Accounting:</span>
                <span className="text-naka-dark font-semibold">Two-Phase Reserve</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION E: HOW ADGAS WORKS (Real Transaction Flow) */}
      <section className="py-24 border-y border-naka-border bg-naka-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-xs font-mono uppercase tracking-widest text-naka-orange mb-2">
              STEP-BY-STEP WORKFLOW
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-naka-dark tracking-tight font-display">
              Transparent, Multi-Stage Execution
            </h2>
            <p className="mt-3 text-sm text-naka-muted">
              Watching an ad never executes transactions automatically. Users retain full sovereign control over every signature.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 font-mono">
            {[
              {
                step: '01',
                title: 'Watch Ad',
                desc: 'User plays a 5-second verified ad spotlight in the application.',
              },
              {
                step: '02',
                title: 'Verify Proof',
                desc: 'Relayer validates session telemetry and issues a 5-minute attestation.',
              },
              {
                step: '03',
                title: 'Sign Permit',
                desc: 'User reviews parameters and signs an off-chain EIP-3009 message.',
              },
              {
                step: '04',
                title: 'Relay Tx',
                desc: 'AdGas relayer broadcasts the permit to Arc Mainnet paying native gas.',
              },
              {
                step: '05',
                title: 'Settle On-Chain',
                desc: 'USDC moves directly to recipient; gas cost settles against campaign pool.',
              },
            ].map((s) => (
              <div
                key={s.step}
                className="bg-white border border-naka-border rounded-2xl p-6 relative hover:border-naka-orange/40 transition-colors"
              >
                <div className="text-xs font-bold text-naka-orange mb-2">STAGE {s.step}</div>
                <h4 className="text-base font-bold text-naka-dark mb-2 font-display">{s.title}</h4>
                <p className="text-xs text-naka-muted font-sans leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION F: INFRASTRUCTURE SPECIFICATION */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-naka-orange mb-2">
            MODULAR ARCHITECTURE
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-naka-dark tracking-tight font-display">
            Purpose-Built Infrastructure for Sponsored Payments
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs font-mono">
          <div className="bg-naka-surface border border-naka-border rounded-2xl p-6 space-y-2">
            <div className="text-naka-orange font-bold">01 // EIP-3009</div>
            <div className="text-sm font-bold text-naka-dark font-display">Transfer Authorization</div>
            <p className="text-naka-muted font-sans">
              Native Arc USDC contract authorization flow. No token approvals or lockups required.
            </p>
          </div>

          <div className="bg-naka-surface border border-naka-border rounded-2xl p-6 space-y-2">
            <div className="text-naka-orange font-bold">02 // EIP-712</div>
            <div className="text-sm font-bold text-naka-dark font-display">Typed Attestation</div>
            <p className="text-naka-muted font-sans">
              Cryptographically signed proof-of-attention verified by the relayer before gas sponsorship.
            </p>
          </div>

          <div className="bg-naka-surface border border-naka-border rounded-2xl p-6 space-y-2">
            <div className="text-naka-orange font-bold">03 // RELAYER EOA</div>
            <div className="text-sm font-bold text-naka-dark font-display">Execution Broadcast</div>
            <p className="text-naka-muted font-sans">
              Dedicated funded account paying native Arc gas, shielding end consumers from gas tokens.
            </p>
          </div>

          <div className="bg-naka-surface border border-naka-border rounded-2xl p-6 space-y-2">
            <div className="text-naka-orange font-bold">04 // 10^12 MATH</div>
            <div className="text-sm font-bold text-naka-dark font-display">Unit Ceiling Scaling</div>
            <p className="text-naka-muted font-sans">
              Bridges 18-decimal Arc native gas with 6-decimal USDC with integer ceiling rounding.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION G: WHY ADGAS (Institutional Advantages) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full border-t border-naka-border">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-naka-dark tracking-tight font-display">
            The AdGas Institutional Advantage
          </h2>
        </div>

        <div className="bg-white border border-naka-border rounded-3xl overflow-hidden shadow-sm text-xs font-mono">
          <div className="grid grid-cols-3 bg-naka-subtle p-4 border-b border-naka-border font-bold text-naka-dark uppercase tracking-wider">
            <div>FEATURE</div>
            <div className="text-naka-muted">TRADITIONAL TRANSFER</div>
            <div className="text-naka-orange">ADGAS PROTOCOL</div>
          </div>

          <div className="grid grid-cols-3 p-4 border-b border-naka-border items-center">
            <div className="text-naka-dark font-medium">Native Gas Token</div>
            <div className="text-naka-muted">Mandatory (Buy / Bridge)</div>
            <div className="text-naka-dark font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-naka-green" />
              <span>Zero Native Gas Needed</span>
            </div>
          </div>

          <div className="grid grid-cols-3 p-4 border-b border-naka-border items-center">
            <div className="text-naka-dark font-medium">Smart Contract Risk</div>
            <div className="text-naka-muted">Custom Vaults / Proxies</div>
            <div className="text-naka-dark font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-naka-green" />
              <span>Direct Canonical USDC</span>
            </div>
          </div>

          <div className="grid grid-cols-3 p-4 border-b border-naka-border items-center">
            <div className="text-naka-dark font-medium">Sponsor Verification</div>
            <div className="text-naka-muted">Passive Impressions</div>
            <div className="text-naka-dark font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-naka-green" />
              <span>Verified High-Intent Attention</span>
            </div>
          </div>

          <div className="grid grid-cols-3 p-4 items-center">
            <div className="text-naka-dark font-medium">Accounting Transparency</div>
            <div className="text-naka-muted">Estimated Volatile Fees</div>
            <div className="text-naka-dark font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-naka-green" />
              <span>Receipt-Derived Settlement</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION H: FINAL CTA */}
      <section className="py-24 border-t border-naka-border bg-naka-surface text-center px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-naka-dark tracking-tight font-display">
            Make Every Sponsored Interaction Count.
          </h2>
          <p className="text-naka-muted text-base max-w-xl mx-auto font-sans leading-relaxed">
            Give users a smoother way to transact while connecting your campaign to real blockchain activity.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/transfer"
              className="px-8 py-4 rounded-full bg-naka-dark hover:bg-neutral-800 text-white font-sans font-semibold text-sm shadow-md flex items-center space-x-2 transition-all cursor-pointer"
            >
              <span>Send USDC</span>
              <ArrowRight className="w-4 h-4 text-naka-orange" />
            </Link>
            <Link
              href="/advertiser"
              className="px-8 py-4 rounded-full bg-white hover:bg-naka-subtle text-naka-dark border border-naka-border font-sans font-semibold text-sm transition-all shadow-sm"
            >
              <span>Sponsor Transactions</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
