/**
 * Reset Local Database
 *
 * Use this whenever the local Hardhat node is restarted. Hardhat keeps chain
 * state only in memory, so the database must be reset too or old campaign IDs
 * will point at campaigns that no longer exist on-chain.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const allowNonLocalReset = process.env.ALLOW_NON_LOCAL_DB_RESET === "true";
  const looksLocal =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("0.0.0.0");

  if (!looksLocal && !allowNonLocalReset) {
    console.error("Refusing to reset a non-local database.");
    console.error("Set ALLOW_NON_LOCAL_DB_RESET=true only if you are certain.");
    process.exit(1);
  }
}

async function main() {
  assertLocalDatabase();

  console.log("Resetting local database...");
  console.log("This removes users, wallets, campaigns, donations, images, and indexed events.");

  const [
    blockchainEvents,
    donations,
    statusHistory,
    campaignImages,
    campaigns,
    wallets,
    users,
  ] = await prisma.$transaction([
    prisma.blockchainEvent.deleteMany(),
    prisma.donation.deleteMany(),
    prisma.campaignStatusHistory.deleteMany(),
    prisma.campaignImage.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.wallet.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("Local database reset complete:");
  console.log(`  Blockchain events: ${blockchainEvents.count}`);
  console.log(`  Donations:          ${donations.count}`);
  console.log(`  Status history:     ${statusHistory.count}`);
  console.log(`  Campaign images:    ${campaignImages.count}`);
  console.log(`  Campaigns:          ${campaigns.count}`);
  console.log(`  Wallets:            ${wallets.count}`);
  console.log(`  Users:              ${users.count}`);
}

main()
  .catch((error) => {
    console.error("Failed to reset local database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
