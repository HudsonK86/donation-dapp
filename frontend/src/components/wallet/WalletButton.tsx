"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

function compactAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const label = isConnected && address ? compactAddress(address) : "Connect Wallet";

  return (
    <button
      type="button"
      onClick={() => {
        void open({ view: isConnected ? "Account" : "Connect" });
      }}
      className="inline-flex min-h-8 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
      aria-label={isConnected ? "Open wallet account" : "Connect Wallet"}
    >
      {isConnected && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
      {label}
    </button>
  );
}
