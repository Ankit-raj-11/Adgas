import './globals.css';
import { type ReactNode } from 'react';
import { Providers } from './providers';

export const metadata = {
  title: 'Adgas | Gasless USDC Transfers Sponsored by Advertisers',
  description: 'Sponsor transaction gas fees for users transferring USDC on Arc mainnet through verifiable video ad engagement.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-navy-900 text-slate-100 antialiased selection:bg-electric-600 selection:text-white">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-navy-700/60 bg-navy-950/80 backdrop-blur sticky top-0 z-50">
              <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-electric-600 flex items-center justify-center font-bold text-white shadow-lg shadow-electric-600/30">
                    A
                  </div>
                  <div>
                    <span className="font-bold text-lg tracking-tight text-white">Adgas</span>
                    <span className="ml-2 text-xs font-mono uppercase bg-electric-600/20 text-electric-500 border border-electric-500/30 px-2 py-0.5 rounded-full">
                      Arc Mainnet
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-6 text-sm">
                  <a href="#payment-demo" className="text-slate-300 hover:text-white transition">
                    Payment Demo
                  </a>
                  <a href="#advertiser-dashboard" className="text-slate-300 hover:text-white transition">
                    Sponsor Dashboard
                  </a>
                  <div className="h-4 w-px bg-navy-700"></div>
                  <span className="inline-flex items-center text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                    RPC Connected
                  </span>
                </div>
              </div>
            </header>

            <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
              {children}
            </main>

            <footer className="border-t border-navy-700/60 py-6 text-center text-xs text-slate-500 font-mono">
              Adgas Protocol &bull; Chain ID 5042 &bull; Arc Mainnet USDC Gas Abstraction
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
