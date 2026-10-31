'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from './WalletButton';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER } from '@adgas/shared';

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Consumer App', href: '/transfer' },
    { name: 'Advertiser Portal', href: '/advertiser' },
  ];

  return (
    <header className="border-b border-naka-border bg-white/90 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-3 group">
            {/* Geometric Monogram Emblem */}
            <div className="w-9 h-9 rounded-xl bg-naka-dark text-white flex items-center justify-center font-mono font-bold text-sm tracking-tighter group-hover:bg-neutral-800 transition-colors shadow-sm">
              <span className="text-naka-orange">A</span>G
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <span className="text-xl font-bold text-naka-dark tracking-tight font-display">
                  ADGAS
                </span>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-naka-subtle text-naka-dark border border-naka-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-naka-green mr-1.5" />
                  ARC MAINNET ({ARC_MAINNET_CHAIN_ID})
                </span>
              </div>
              <span className="hidden sm:block text-[10px] font-mono uppercase tracking-widest text-naka-muted">
                SPONSORED TRANSACTION INFRASTRUCTURE
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-1 bg-naka-surface p-1.5 rounded-full border border-naka-border text-xs font-sans">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`px-4 py-2 rounded-full font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-naka-dark text-white shadow-sm'
                    : 'text-naka-muted hover:text-naka-dark hover:bg-neutral-100'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
          <a
            href={ARC_MAINNET_EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-full text-naka-muted hover:text-naka-dark hover:bg-neutral-100 transition-all flex items-center space-x-1"
          >
            <span>Explorer</span>
            <ArrowUpRight className="w-3 h-3 text-naka-muted" />
          </a>
        </nav>

        {/* Right Action: Wallet Button & Mobile Toggle */}
        <div className="flex items-center space-x-3">
          <WalletButton />

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-naka-subtle border border-naka-border text-naka-dark hover:bg-neutral-200 transition-colors"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-naka-border bg-white p-4 space-y-2 animate-in fade-in duration-200 font-sans text-sm">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 rounded-xl font-medium transition-all ${
                  isActive
                    ? 'bg-naka-dark text-white'
                    : 'text-naka-dark hover:bg-naka-subtle'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
          <a
            href={ARC_MAINNET_EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-3 rounded-xl text-naka-muted hover:bg-naka-subtle"
          >
            <span>Arc Mainnet Explorer</span>
            <ArrowUpRight className="w-4 h-4 text-naka-muted" />
          </a>
        </div>
      )}
    </header>
  );
}
