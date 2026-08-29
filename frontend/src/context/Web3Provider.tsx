"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { config as appConfig } from "@/utils/config";
import {
  appkitNetworks,
  donationNetwork,
  projectId,
  queryClient,
  wagmiAdapter,
  wagmiConfig,
} from "@/utils/web3config";

const metadata = {
  name: appConfig.appName,
  description: appConfig.appDescription,
  url:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://donatechain.asia",
  icons: [],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: appkitNetworks,
  defaultNetwork: donationNetwork,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#06b6d4",
  },
});

export default function Web3Provider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WagmiProvider
      config={
        wagmiConfig as unknown as React.ComponentProps<
          typeof WagmiProvider
        >["config"]
      }
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
