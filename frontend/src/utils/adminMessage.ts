export function buildAdminActionMessage(
  walletAddress: string,
  action: string,
  timestamp: number
) {
  return [
    "DonateChain Admin Action",
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Action: ${action}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}
