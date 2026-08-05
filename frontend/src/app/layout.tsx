import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Web3Provider from "@/context/Web3Provider";
import { Navbar } from "@/components/layout/Navbar";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { WalletAuth } from "@/components/wallet/WalletAuth";
import { AddressProfileProvider } from "@/components/ui/AddressDisplay";
import "react-toastify/dist/ReactToastify.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DonateChain — Transparent Blockchain Donations",
  description:
    "A blockchain-based donation platform for transparent and traceable charitable giving. Powered by smart contract escrow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen font-sans antialiased"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <Web3Provider>
          <AddressProfileProvider>
            <WalletAuth />
            <Navbar />
            <main className="flex-1">{children}</main>
          </AddressProfileProvider>
          <ToastProvider />
        </Web3Provider>
      </body>
    </html>
  );
}
