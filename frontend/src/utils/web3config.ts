"use client";

import { QueryClient } from "@tanstack/react-query";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";
import { config } from "@/utils/config";

export const projectId =
  config.walletConnectProjectId || "local-dev-project-id";

export const donationNetwork = defineChain({
  id: config.chainId,
  name: config.networkName || "Sepolia",
  chainNamespace: "eip155",
  caipNetworkId: `eip155:${config.chainId}`,
  nativeCurrency: {
    name: "ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [config.rpcUrl] },
    public: { http: [config.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
});

export const appkitNetworks: [typeof donationNetwork] = [donationNetwork];

if (!config.walletConnectProjectId) {
  console.warn(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is missing. AppKit will use the local development project id.",
  );
}

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: appkitNetworks,
  storage: createStorage({
    storage: cookieStorage,
  }) as never,
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
export const queryClient = new QueryClient();