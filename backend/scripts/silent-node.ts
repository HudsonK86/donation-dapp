/**
 * Silent Hardhat Node wrapper.
 *
 * Spawns `hardhat node` and suppresses three categories of noise that
 * wagmi / AppKit / ethers / Reown produce while polling the local RPC.
 * Real transactions, deploys, and meaningful errors are still logged.
 *
 * Usage:
 *   tsx scripts/silent-node.ts         # start in foreground
 *   npm run node:silent                # via the package.json alias
 *
 * Filtered patterns:
 *   1. eth_chainId, eth_accounts, eth_getBlockByNumber, eth_blockNumber,
 *      eth_getBalance, eth_getFilterChanges, eth_getTransactionReceipt,
 *      eth_getTransactionByHash, eth_getCode, eth_getTransactionCount,
 *      eth_getStorageAt, eth_unsubscribe, eth_subscribe, eth_gasPrice,
 *      eth_maxPriorityFeePerGas, hardhat_*
 *      -> read-only polling; not interesting
 *   2. eth_call <unrecognized-selector> / <UnrecognizedContract> /
 *      "Transaction reverted without a reason" / "StackUnderflow" /
 *      "WARNING: Calling an account which is not a contract"
 *      -> wagmi multicall probing; harmless
 *   3. eth_estimateGas
 *      -> wallet preflight; harmless
 *
 * Kept:
 *   - Hardhat startup banner (accounts, listener URLs)
 *   - Contract deployment reports
 *   - eth_sendRawTransaction / eth_sendTransaction blocks
 *   - Hardhat errors / warnings
 */

import { spawn } from "node:child_process";

const HARDHAT_CMD = "npx";
const HARDHAT_ARGS = ["hardhat", "node"];

const child = spawn(HARDHAT_CMD, HARDHAT_ARGS, {
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});

// Patterns that should be completely removed from the output stream.
const SUPPRESS_LINE = /^\s*(eth_chainId|eth_accounts|eth_getBlockByNumber|eth_blockNumber|eth_getBalance|eth_getFilterChanges|eth_getTransactionReceipt|eth_getTransactionByHash|eth_getCode|eth_getTransactionCount|eth_getStorageAt|eth_unsubscribe|eth_subscribe|eth_gasPrice|eth_maxPriorityFeePerGas|hardhat_)/;

// Block-style suppressors: a "header" line followed by indented "body" lines
// that should be removed together until the next blank line.
const BLOCK_HEADERS = [
  /^eth_call\b/,
  /^eth_estimateGas\b/,
];

const SUPPRESS_INLINE = [
  /WARNING: Calling an account which is not a contract/,
  /<unrecognized-selector>/,
  /<UnrecognizedContract>/,
  /Transaction reverted without a reason/,
  /TransactionExecutionError: StackUnderflow/,
  /WARNING:.*not a contract/,
];

let buffer: string[] = [];

function flush() {
  if (buffer.length === 0) return;
  const text = buffer.join("\n");
  buffer = [];

  // Drop standalone RPC method lines.
  if (SUPPRESS_LINE.test(text)) {
    return;
  }

  // Drop blocks whose header matches a known noisy pattern.
  if (BLOCK_HEADERS.some((re) => re.test(text))) {
    // Only suppress if the block contains any noisy inline marker.
    if (SUPPRESS_INLINE.some((re) => re.test(text))) {
      return;
    }
  }

  // Drop entire block if any inline marker appears.
  if (SUPPRESS_INLINE.some((re) => re.test(text))) {
    return;
  }

  process.stdout.write(text + "\n");
}

function consume(chunk: string) {
  // Split into lines but keep the last partial line in the buffer.
  const lines = chunk.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    buffer.push(line);
    // A blank line marks the end of a logical block.
    if (line.trim() === "") {
      flush();
    }
  }
  // The last element is a partial line (or empty for a trailing newline).
  // If the chunk ended with a newline, the last element is "": flush now.
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    flush();
  } else {
    buffer.push(lines[lines.length - 1]);
  }
}

child.stdout.on("data", (chunk: Buffer) => consume(chunk.toString()));
child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

child.on("exit", (code, signal) => {
  // Flush any remaining buffered output before propagating the exit.
  flush();
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

// Forward SIGINT/SIGTERM to the child so Ctrl+C still works.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
