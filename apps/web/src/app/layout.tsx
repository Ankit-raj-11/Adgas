import './globals.css';
import { type ReactNode } from 'react';
import { Providers } from './providers';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export const metadata = {
  title: 'AdGas — USDC Payments. Gas Sponsored.',
  description: 'AdGas connects advertisers with users through sponsored blockchain transactions on Arc Network. Watch sponsored content, authorize your USDC transfer, and let AdGas handle eligible transaction gas costs.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-naka-dark antialiased font-sans flex flex-col min-h-screen">
        <Providers>
          <Navbar />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
