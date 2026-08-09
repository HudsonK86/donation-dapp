/**
 * Reindex script — Backfill missing on-chain links
 *
 * Finds campaigns in the DB that have a `createTxHash` but no
 * `onChainCampaignId` linked, and queries Sepolia to fill in the gap.
 *
 * Run with: npm run indexer:reindex
 */
import "dotenv/config";
import { createPublicClient, getAddress, http } from "viem";
import { sepolia } from "viem/chains";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

const client = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

async function main() {
  console.log("🔧 Reindex script — backfilling missing on-chain links\n");

  const campaigns = await prisma.campaign.findMany({
    where: {
      createTxHash: { not: null },
      OR: [
        { onChainCampaignId: null },
        { blockchainEvents: { none: { eventName: "CampaignCreated" } } },
      ],
    },
  });

  console.log(`Found ${campaigns.length} campaigns to backfill\n`);

  for (const c of campaigns) {
    if (!c.createTxHash) continue;

    console.log(`─────────────────────────────────────────`);
    console.log(`Campaign ID: ${c.campaignId}`);
    console.log(`Title: ${c.campaignTitle}`);
    console.log(`createTxHash: ${c.createTxHash}`);

    try {
      const receipt = await client.getTransactionReceipt({
        hash: c.createTxHash as `0x${string}`,
      });

      // Find campaign ID from logs
      let onChainCampaignId: bigint | null = null;
      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() !==
          (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").toLowerCase()
        ) {
          continue;
        }
        // Decode log to find campaignId
        const topics = log.topics;
        if (topics[0]) {
          // CampaignCreated event signature: keccak256("CampaignCreated(uint256,address,address,uint256,uint256)")
          // We can just call getCampaign on-chain instead.
        }
      }

      // Simpler: query getCampaignCount - 1 to get the latest campaign
      const count = await client.readContract({
        address: process.env
          .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`,
        abi: [
          {
            inputs: [],
            name: "getCampaignCount",
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "getCampaignCount",
      });

      // Try the last N campaigns to find a match
      const lookback = Number(count);
      for (let i = lookback - 1; i >= Math.max(0, lookback - 10); i--) {
        const result = await client.readContract({
          address: process.env
            .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`,
          abi: [
            {
              inputs: [{ type: "uint256" }],
              name: "getCampaign",
              outputs: [
                { type: "uint256" },
                { type: "address" },
                { type: "address" },
                { type: "uint256" },
                { type: "bool" },
                { type: "uint256" },
              ],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "getCampaign",
          args: [BigInt(i)],
        });

        const campaign = result as readonly [bigint, string, string, bigint, boolean, bigint];
        const [id, , beneficiary, targetAmount, , deadline] = campaign;

        // Match against DB row
        const dbBeneficiary = await prisma.wallet.findUnique({
          where: { walletId: c.beneficiaryWalletId ?? 0 },
        });

        if (
          dbBeneficiary &&
          getAddress(dbBeneficiary.walletAddress).toLowerCase() ===
            beneficiary.toLowerCase() &&
          Number(targetAmount) / 1e18 === Number(c.targetAmount) &&
          Number(deadline) * 1000 === c.campaignDeadline?.getTime()
        ) {
          onChainCampaignId = id;
          break;
        }
      }

      if (onChainCampaignId != null) {
        await prisma.campaign.update({
          where: { campaignId: c.campaignId },
          data: {
            onChainCampaignId,
            campaignStatus: c.campaignStatus === "draft" ? "active" : c.campaignStatus,
            publishedAt: c.publishedAt || new Date(),
          },
        });

        console.log(`  ✅ Linked to on-chain campaign ID: ${onChainCampaignId}`);
      } else {
        console.log(`  ⚠️  Could not match to on-chain campaign`);
      }
    } catch (err) {
      console.error(`  ❌ Error:`, err);
    }
  }

  console.log(`\n✅ Done`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
