/**
 * Database Seed Script
 *
 * Creates an initial admin user using the Sepolia deployer wallet.
 * This ensures the developer can access /admin immediately after setup.
 *
 * Sepolia Deployer (from backend/.env SEPOLIA_PRIVATE_KEY):
 *   Address: 0xf4E1ADaa1E92DAaa937D15403F04fAEe24d441D5
 *
 * Usage:
 *   npx tsx prisma/seed.ts
 *   — or —
 *   npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Sepolia deployer wallet — used as the default admin
const ADMIN_WALLET_ADDRESS = "0xf4e1adaa1e92daaa937d15403f04faee24d441d5";
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
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111),
      isPrimary: true,
      walletLabel: "Admin Wallet (Sepolia Deployer)",
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
  console.log("   1. Import your Sepolia deployer wallet into MetaMask");
  console.log("      (private key from backend/.env -> SEPOLIA_PRIVATE_KEY)");
  console.log("   2. Connect wallet and go to /admin");
  console.log("");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });