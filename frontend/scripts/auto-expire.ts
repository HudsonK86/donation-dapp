/**
 * Auto-expire cron script — Cancels zero-donation campaigns after deadline
 *
 * Finds campaigns that:
 *   - Are still "active"
 *   - Have passed their deadline
 *   - Have zero donations
 *
 * And sets them to "cancelled" directly in the DB.
 * No on-chain transaction needed since nothing was ever escrowed.
 *
 * Run with: npx tsx scripts/auto-expire.ts
 * Recommended: schedule via cron every minute
 *   * * * * * cd /path/to/frontend && npx tsx scripts/auto-expire.ts >> logs/auto-expire.log 2>&1
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const expiredZeroDonation = await prisma.campaign.findMany({
    where: {
      campaignStatus: "active",
      campaignDeadline: { not: null, lt: now },
      donations: { none: {} },
    },
  });

  if (expiredZeroDonation.length === 0) {
    console.log(`[${now.toISOString()}] No zero-donation expired campaigns found.`);
    return;
  }

  console.log(
    `[${now.toISOString()}] Found ${expiredZeroDonation.length} zero-donation expired campaign(s) to cancel:`
  );

  for (const campaign of expiredZeroDonation) {
    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { campaignId: campaign.campaignId },
        data: { campaignStatus: "cancelled" },
      });

      await tx.campaignStatusHistory.create({
        data: {
          campaignId: campaign.campaignId,
          oldStatus: campaign.campaignStatus,
          newStatus: "cancelled",
        },
      });
    });

    console.log(
      `  ✅ Cancelled campaign "${campaign.campaignTitle}" (${campaign.campaignId})`
    );
  }

  console.log(`Done.`);
}

main()
  .catch((e) => {
    console.error("Auto-expire error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
