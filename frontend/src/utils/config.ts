// Environment variables and app configuration

export const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/donation_dapp",

  // Blockchain
  contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "11155111"),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545",
  networkName: process.env.NEXT_PUBLIC_NETWORK_NAME || "Sepolia",

  // Reown AppKit (WalletConnect)
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",

  // Admin — fallback wallet address for bootstrapping without DB
  adminWalletAddress: (process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS || "").toLowerCase(),

  // App
  appName: "Donation Platform",
  appDescription: "Blockchain-based donation platform for transparent and traceable charitable giving",
} as const;
