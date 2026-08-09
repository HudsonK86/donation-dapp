/**
 * Display formatters for ETH amounts.
 *
 * On Sepolia testnet, donation amounts are usually 0.001–10 ETH, so we
 * default to 4 decimals — enough precision to show 0.0010 cleanly while
 * keeping the UI readable. Trailing zeros are trimmed so whole numbers
 * render as "10.0" instead of "10.0000".
 *
 * Very small amounts (< 0.0001) bump to 6 decimals so they don't render
 * as "0.0000" and look like they didn't happen.
 */

import { formatUnits } from "viem";

/**
 * Format an ETH amount (already in ETH units, NOT wei) for display.
 *
 * @param amount - The amount in ETH (e.g. 0.18, 10, 0.001)
 * @param maxDecimals - Maximum decimals to show (default 4)
 * @returns Human-friendly string with trailing zeros trimmed
 *
 * @example
 * formatEthAmount(0.001)    // "0.001"
 * formatEthAmount(0.18)     // "0.18"
 * formatEthAmount(1.5)      // "1.5"
 * formatEthAmount(10)       // "10.0"
 * formatEthAmount(0)        // "0"
 * formatEthAmount(0.00005)  // "0.00005"  (auto-bumped to 6 decimals)
 */
export function formatEthAmount(amount: number, maxDecimals = 4): string {
  if (!Number.isFinite(amount)) return "0";
  if (amount === 0) return "0";

  // For tiny amounts, show more precision so we don't render misleading "0.0000".
  const decimals = amount > 0 && amount < 0.0001 ? 6 : maxDecimals;

  const fixed = amount.toFixed(decimals);

  // Trim trailing zeros: "10.0000" → "10.0", "1.5000" → "1.5"
  // Always keep at least one decimal so users see it's a fractional value.
  const trimmed = fixed.replace(/\.?0+$/, "");
  return trimmed.includes(".") ? trimmed : `${trimmed}.0`;
}

/**
 * Format a wei value (BigInt or string) as ETH for display.
 * Use this when you have raw wei from the contract or indexer.
 *
 * @example
 * formatWei(BigInt("1000000000000000"))  // "0.001"
 * formatWei("0")                         // "0"
 */
export function formatWei(wei: bigint | string | undefined | null, maxDecimals = 4): string {
  if (wei === undefined || wei === null || wei === "") return "0";
  try {
    const big = typeof wei === "bigint" ? wei : BigInt(wei);
    return formatEthAmount(Number(formatUnits(big, 18)), maxDecimals);
  } catch {
    return "0";
  }
}
