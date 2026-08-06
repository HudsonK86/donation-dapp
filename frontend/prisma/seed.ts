/**
 * Database Seed Script
 *
 * Creates an initial admin user with the first Hardhat account wallet.
 * This ensures the developer can access /admin immediately after setup.
 *
 * Hardhat Account #0:
 *   Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 * Usage:
 *   npx tsx prisma/seed.ts
 *   — or —
 *   npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Hardhat's first account — used as the default admin
const ADMIN_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_WALLET_ID = "00000000-0000-0000-0000-000000000010";

async function main() {
  console.log("🌱 Seeding database...\n");

  // Upsert admin user
  const admin = await prisma.user.upsert({
    where: { userId: ADMIN_USER_ID },
    update: {
      role: "admin",
      fullName: "Admin",
    },
    create: {
      userId: ADMIN_USER_ID,
      role: "admin",
      fullName: "Admin",
      email: "admin@donatechain.local",
    },
  });

  console.log(`✅ Admin user created/updated:`);
  console.log(`   User ID:  ${admin.userId}`);
  console.log(`   Role:     ${admin.role}`);
  console.log(`   Name:     ${admin.fullName}`);
  console.log("");

  // Upsert admin wallet (linked to admin user)
  const wallet = await prisma.wallet.upsert({
    where: { walletAddress: ADMIN_WALLET_ADDRESS },
    update: {
      userId: admin.userId,
      isPrimary: true,
    },
    create: {
      walletId: ADMIN_WALLET_ID,
      userId: admin.userId,
      walletAddress: ADMIN_WALLET_ADDRESS,
      chainId: 31337,
      isPrimary: true,
      walletLabel: "Admin Wallet (Hardhat #0)",
    },
  });

  console.log(`✅ Admin wallet linked:`);
  console.log(`   Wallet:   ${wallet.walletAddress}`);
  console.log(`   Chain ID: ${wallet.chainId}`);
  console.log(`   Primary:  ${wallet.isPrimary}`);
  console.log("");

  console.log("🌱 Seeding complete!");
  console.log("");
  console.log("📌 To access admin dashboard:");
  console.log("   1. Import Hardhat Account #0 into MetaMask");
  console.log("   2. Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  console.log("   3. Connect wallet and go to /admin");
  console.log("");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
