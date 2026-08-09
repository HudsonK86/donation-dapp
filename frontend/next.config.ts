import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Wagmi/Viem — handle Node.js-specific modules
  webpack: (config, { webpack }) => {
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
      "accounts",
      // Porto (deprecated) is dynamically imported by @wagmi/connectors
      // but never used at runtime. Ignore it so webpack doesn't try to
      // resolve it during build.
      "porto",
      "porto/internal",
    );
    // Use IgnorePlugin to fully skip the dynamic imports of the
    // deprecated `porto` package inside @wagmi/connectors.
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^porto$|^porto\/internal$/,
      }),
    );
    return config;
  },
};

export default nextConfig;