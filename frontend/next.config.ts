import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Wagmi/Viem — handle Node.js-specific modules
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    // Wagmi and Coinbase Wallet require these externals to be handled
    config.externals.push(
      "pino-pretty",
      "lokijs",
      "encoding",
      "@x402/core/client",
      "@x402/evm/exact/client",
      "@x402/evm/upto/client",
      "@x402/svm/exact/client",
      "@x402/svm/upto/client",
      "@x402/evm",
      "@solana/kit",
      "accounts"
    );
    return config;
  },
};

export default nextConfig;
