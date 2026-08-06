/**
 * Unit tests for the silent-node filter.
 *
 * We re-implement the buffer logic from silent-node.ts here so the
 * tests don't depend on running a child process.
 */

type LineSink = (line: string) => void;

function createFilter() {
  const SUPPRESS_LINE = /^\s*(eth_chainId|eth_accounts|eth_getBlockByNumber|eth_blockNumber|eth_getBalance|eth_getFilterChanges|eth_getTransactionReceipt|eth_getTransactionByHash|eth_getCode|eth_getTransactionCount|eth_getStorageAt|eth_unsubscribe|eth_subscribe|eth_gasPrice|eth_maxPriorityFeePerGas|hardhat_)/;
  const BLOCK_HEADERS = [/^eth_call\b/, /^eth_estimateGas\b/];
  const SUPPRESS_INLINE = [
    /WARNING: Calling an account which is not a contract/,
    /<unrecognized-selector>/,
    /<UnrecognizedContract>/,
    /Transaction reverted without a reason/,
    /TransactionExecutionError: StackUnderflow/,
    /WARNING:.*not a contract/,
  ];

  let buffer: string[] = [];
  let out: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    buffer = [];
    if (SUPPRESS_LINE.test(text)) return;
    if (BLOCK_HEADERS.some((re) => re.test(text)) && SUPPRESS_INLINE.some((re) => re.test(text))) return;
    if (SUPPRESS_INLINE.some((re) => re.test(text))) return;
    out.push(text);
  };

  const consume = (chunk: string) => {
    const lines = chunk.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      buffer.push(lines[i]);
      if (lines[i].trim() === "") flush();
    }
    if (lines.length > 1 && lines[lines.length - 1] === "") {
      flush();
    } else {
      buffer.push(lines[lines.length - 1]);
    }
  };

  return {
    consume,
    flush,
    output: () => out,
  };
}

let failures = 0;
let ok = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}

console.log("silent-node filter tests");

// Test 1: noisy eth_call block is suppressed.
{
  const f = createFilter();
  f.consume(`eth_call\n  Contract call:       DonationEscrow#<unrecognized-selector>\n  From:                0xf39...2266\n  To:                  0x5fb...0aa3\n  Error: Transaction reverted without a reason\n\n`);
  f.flush();
  assert(f.output().length === 0, "noisy eth_call block is suppressed");
}

// Test 2: real eth_sendRawTransaction block is kept.
{
  const f = createFilter();
  f.consume(`eth_sendRawTransaction\n  Contract call:       DonationEscrow#createCampaign\n  Transaction:         0x0c1c...e602\n  From:                0xf39...2266\n  Gas used:            163357 of 500000\n  Block #2:            0x7c0a...0a016\n\n`);
  f.flush();
  assert(f.output().length === 1, "real tx block is kept");
  assert(f.output()[0].includes("createCampaign"), "kept block contains tx name");
}

// Test 3: deploy banner is kept.
{
  const f = createFilter();
  f.consume(`eth_sendTransaction\n  Contract deployment: DonationEscrow\n  Contract address:    0x5fbdb231...0aa3\n  Transaction:         0xcae2...7105\n  From:                0xf39...2266\n  Value:               0 ETH\n  Gas used:            1050002 of 1050002\n  Block #1:            0x719a...2357\n\n`);
  f.flush();
  assert(f.output().length === 1, "deploy banner is kept");
}

// Test 4: standalone RPC method lines are dropped.
{
  const f = createFilter();
  f.consume("eth_chainId\nhardhat_metadata\neth_accounts\neth_blockNumber\n");
  f.flush();
  assert(f.output().length === 0, "read-only polling is dropped");
}

// Test 5: WARNING about not a contract is dropped.
{
  const f = createFilter();
  f.consume(`eth_call\n  WARNING: Calling an account which is not a contract\n  From:                0xf39...2266\n  To:                  0x9fe4...6e0\n\n`);
  f.flush();
  assert(f.output().length === 0, "not-a-contract warning block is dropped");
}

// Test 6: StackUnderflow deployment block is dropped.
{
  const f = createFilter();
  f.consume(`eth_call\n  Contract deployment: <UnrecognizedContract>\n  Contract address:    0xe7f1...0512\n  From:                0xf39...2266\n  TransactionExecutionError: StackUnderflow\n\n`);
  f.flush();
  assert(f.output().length === 0, "StackUnderflow block is dropped");
}

// Test 7: Hardhat startup banner is kept.
{
  const f = createFilter();
  f.consume(`Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/\n\nAccounts\n========\n\nAccount #0:  0xf39...2266 (10000 ETH)\n\n`);
  f.flush();
  assert(f.output().length > 0, "startup banner is kept");
  assert(f.output().some((l) => l.includes("Account #0")), "accounts are kept");
}

// Test 8: Empty buffer flush does nothing.
{
  const f = createFilter();
  f.flush();
  assert(f.output().length === 0, "empty flush is a no-op");
}

console.log(`\n${ok} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
