/**
 * Sync Frontend Environment Variables
 *
 * Reads deployed contract addresses from Hardhat Ignition output
 * and writes them to the frontend's .env.local file.
 *
 * Usage:
 *   npx tsx scripts/sync-frontend-env.ts
 *
 * Run this after deploying contracts with Hardhat Ignition:
 *   npx hardhat ignition deploy ignition/modules/DonationEscrow.ts --network localhost
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const lines = content.split(/\r?\n/);
  let inserted = false;

  const nextLines = lines.flatMap((existingLine) => {
    if (!existingLine.startsWith(`${key}=`)) {
      return [existingLine];
    }

    if (inserted) {
      return [];
    }

    inserted = true;
    return [line];
  });

  if (inserted) {
    return nextLines.join("\n");
  }

  const suffix = content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

async function main() {
  // Read deployed addresses from Ignition
  const deployedPath = path.resolve(
    __dirname,
    "..",
    "ignition",
    "deployments",
    "chain-31337",
    "deployed_addresses.json"
  );

  let deployed: Record<string, string>;
  try {
    const raw = await fs.readFile(deployedPath, "utf8");
    deployed = JSON.parse(raw);
  } catch {
    console.error("❌ Could not read deployed addresses.");
    console.error(`   Expected file: ${deployedPath}`);
    console.error("   Did you run: npx hardhat ignition deploy ... --network localhost?");
    process.exit(1);
  }

  // Find the DonationEscrow address (try common Ignition naming patterns)
  const escrowAddress =
    deployed["DonationEscrowModule#DonationEscrow"] ||
    deployed["DonationEscrow#DonationEscrow"] ||
    Object.values(deployed).find((addr) => typeof addr === "string" && addr.startsWith("0x"));

  if (!escrowAddress) {
    console.error("❌ DonationEscrow address not found in deployed_addresses.json");
    console.error("   Available keys:", Object.keys(deployed));
    process.exit(1);
  }

  // Update frontend .env
  const envPath = path.resolve(__dirname, "..", "..", "frontend", ".env");
  let env = "";
  try {
    env = await fs.readFile(envPath, "utf8");
  } catch {
    // File doesn't exist yet — start fresh
    console.log("📄 Creating new frontend/.env");
  }

  env = upsertEnvLine(env, "NEXT_PUBLIC_CONTRACT_ADDRESS", escrowAddress);
  env = upsertEnvLine(env, "NEXT_PUBLIC_RPC_URL", "http://127.0.0.1:8545");
  env = upsertEnvLine(env, "NEXT_PUBLIC_CHAIN_ID", "31337");

  await fs.writeFile(envPath, env, "utf8");

  console.log("");
  console.log("✅ Updated frontend/.env with deployed addresses:");
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`);
  console.log(`   NEXT_PUBLIC_CHAIN_ID=31337`);
  console.log("");
}

main().catch((err) => {
  console.error("❌ Failed to sync frontend env:", err);
  process.exit(1);
});
