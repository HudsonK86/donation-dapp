/**
 * Direct Deploy to Sepolia (bypasses Hardhat Ignition compiler mutex issue)
 *
 * Uses the pre-compiled contract artifacts from Hardhat and viem to deploy
 * directly to the Sepolia testnet.
 *
 * Usage:
 *   npx tsx scripts/deploy-sepolia.ts
 */

import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------------------------------
// Load .env manually
// --------------------------------------------------------------------------
async function loadEnv(): Promise<Record<string, string>> {
  const envPath = path.resolve(__dirname, "..", ".env");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const env: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return env;
  } catch (e) {
    console.error(`❌ Could not read .env at ${envPath}`);
    process.exit(1);
  }
}

// --------------------------------------------------------------------------
// Custom Sepolia chain (avoids viem's hardcoded RPC)
// --------------------------------------------------------------------------
const sepolia = defineChain({
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
});

async function main() {
  const env = await loadEnv();
  const privateKey = env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

  if (!privateKey) {
    console.error("❌ SEPOLIA_PRIVATE_KEY not found in .env");
    process.exit(1);
  }

  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(pk as `0x${string}`);

  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   Direct Deploy to Sepolia (viem)             ║");
  console.log("╚════════════════════════════════════════════════╝\n");
  console.log(`📍 Deployer: ${account.address}`);
  console.log(`🔗 RPC URL:  ${rpcUrl}`);

  // Load compiled artifact
  const artifactPath = path.resolve(
    __dirname,
    "..",
    "ignition",
    "deployments",
    "chain-31337",
    "artifacts",
    "DonationEscrowModule#DonationEscrow.json"
  );
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const { abi, bytecode } = artifact;

  if (!bytecode) {
    console.error("❌ Bytecode missing from artifact");
    process.exit(1);
  }

  // Set up viem clients
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Balance:  ${(Number(balance) / 1e18).toFixed(6)} SepoliaETH\n`);

  if (balance === 0n) {
    console.error("❌ No Sepolia ETH. Visit a faucet first.");
    process.exit(1);
  }

  // Deploy contract
  console.log("⏳ Deploying DonationEscrow...");
  const txHash = await walletClient.deployContract({
    abi,
    bytecode: bytecode as `0x${string}`,
    args: [],
  });

  console.log(`📤 Tx hash:  ${txHash}`);
  console.log(`🔍 Etherscan: https://sepolia.etherscan.io/tx/${txHash}\n`);
  console.log("⏳ Waiting for confirmation (this may take 15-60 seconds)...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    console.error("❌ Deployment transaction failed (reverted on chain).");
    process.exit(1);
  }

  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    console.error("❌ No contract address in receipt");
    process.exit(1);
  }

  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   ✅ DEPLOYMENT SUCCESSFUL                     ║");
  console.log("╚════════════════════════════════════════════════╝\n");
  console.log(`📍 Contract Address: ${contractAddress}`);
  console.log(`🔍 View on Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
  console.log(`📦 Block:    ${receipt.blockNumber.toString()}\n`);

  // Write deployed_addresses.json so sync-frontend-env works
  const deploymentDir = path.resolve(
    __dirname,
    "..",
    "ignition",
    "deployments",
    "chain-11155111"
  );
  await fs.mkdir(deploymentDir, { recursive: true });
  const deployedPath = path.join(deploymentDir, "deployed_addresses.json");
  await fs.writeFile(
    deployedPath,
    JSON.stringify({ "DonationEscrowModule#DonationEscrow": contractAddress }, null, 2) + "\n",
    "utf8"
  );
  console.log(`💾 Saved deployed address to: ${deployedPath}`);
  console.log("\n✨ Next step: run `npm run sync:frontend-env` to update frontend env\n");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});