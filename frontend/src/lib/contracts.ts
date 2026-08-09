/**
 * Centralized smart contract registry.
 * Update here when contracts are redeployed — single source of truth.
 */
export const CONTRACTS = {
  donationEscrow: {
    address: "0xfdde78c41829451073532fb772f6e6cc4fb38417" as const,
    name: "Donation Escrow",
    network: "Sepolia Testnet",
    chainId: 11155111,
    explorer: "https://sepolia.etherscan.io",
  },
} as const;

export type ContractInfo = (typeof CONTRACTS)[keyof typeof CONTRACTS];

/** Build a block-explorer URL for a contract address. */
export function getExplorerUrl(
  info: ContractInfo,
  kind: "address" | "tx" = "address",
  ref?: string,
): string {
  const suffix = ref ? `/${kind}/${ref}` : `/${kind}/${info.address}`;
  return `${info.explorer}${suffix}`;
}

/**
 * Build a block-explorer URL for a transaction hash.
 * Defaults to the donation escrow's network explorer.
 */
export function getExplorerTxUrl(
  hash: string,
  info: ContractInfo = CONTRACTS.donationEscrow,
): string {
  return `${info.explorer}/tx/${hash}`;
}
