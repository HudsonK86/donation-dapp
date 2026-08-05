"use client";

import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { AppKitProvider, createAppKit } from "@reown/appkit/react";
import { config as appConfig } from "@/utils/config";
import {
  appkitNetworks,
  hardhatNetwork,
  projectId,
  queryClient,
  wagmiAdapter,
  wagmiConfig,
} from "@/utils/web3config";

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: appkitNetworks,
  defaultNetwork: hardhatNetwork,
  metadata: {
    name: appConfig.appName,
    description: appConfig.appDescription,
    url: "http://localhost:3000",
    icons: [],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
});

export default function Web3Provider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppKitProvider
      adapters={[wagmiAdapter]}
      projectId={projectId}
      networks={appkitNetworks}
      defaultNetwork={hardhatNetwork}
      metadata={{
        name: appConfig.appName,
        description: appConfig.appDescription,
        url: "http://localhost:3000",
        icons: [],
      }}
      themeMode="dark"
      themeVariables={{
        "--w3m-accent": "#06b6d4",
      }}
    >
      <WagmiProvider
        config={
          wagmiConfig as unknown as React.ComponentProps<
            typeof WagmiProvider
          >["config"]
        }
      >
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  );
}
