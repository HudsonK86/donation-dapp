/**
 * Event Indexer — Blockchain Event Listener
 *
 * This script listens for smart contract events on the Sepolia testnet
 * and syncs them to the PostgreSQL database via Prisma.
 *
 * Events monitored:
 *   - CampaignCreated
 *   - CampaignUpdated
 *   - CampaignCancelled
 *   - DonationReceived
 *   - FundsReleased
 *
 * Usage:
 *   npx tsx scripts/indexer.ts
 */

import "dotenv/config";
import {
  createPublicClient,
  decodeEventLog,
  formatEther,
  getAddress,
  http,
  type Log,
} from "viem";
import { sepolia } from "viem/chains";
import { PrismaClient } from "@prisma/client";
import { DONATION_ESCROW_ABI } from "../src/utils/contract";

const prisma = new PrismaClient();

// Configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

if (!CONTRACT_ADDRESS) {
  console.error("❌ NEXT_PUBLIC_CONTRACT_ADDRESS environment variable is not set.");
  process.exit(1);
}

// Create Viem public client
const client = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// For DonationReceived the frontend POST can take 30+ seconds on cold
// compile (Next.js dev mode compiles the API route on first request, which
// can take 15+ seconds). The previous 5-second window caused the indexer
// to give up before the off-chain donation row was written, resulting in
// the donation being visible on-chain but missing from the database.
//
// The 60-second window below matches the CampaignCreated handling above
// and comfortably covers cold-compile latency while still failing fast on
// genuinely missing transactions.
const MATCH_ATTEMPTS = 60;
const MATCH_DELAY_MS = 1000; // 60s total window for the slow DB write
const REPLAY_CHUNK_SIZE = BigInt(2_000);

// For CampaignCreated the frontend POST can take 30+ seconds (image
// upload + DB write). Use an extended lookup window, then fall back to the
// on-chain campaign ID; startup replay provides another recovery path.
//
// The indexer will:
//  1. Try the primary lookup (createTxHash) for the extended retry window.
//  2. Fall back to on-chain ID lookup so newly-orphaned campaigns are
//     picked up here even if the createTxHash race is lost.
const EXTENDED_ATTEMPTS = 60;
const EXTENDED_DELAY_MS = 1000; // 60s total window for the slow DB write

// Lookup a campaign row by its on-chain create transaction hash. With the
// single-step creation flow (POST /api/campaigns after the on-chain tx
// confirms), this lookup normally succeeds on the first attempt because
// the DB write happens within a few hundred milliseconds of the on-chain
// event being emitted. The retry loop is kept as a safety net for slow
// Prisma queries or transient DB hiccups.
async function findCampaignByCreateTxHash(txHash: string) {
  for (let attempt = 1; attempt <= EXTENDED_ATTEMPTS; attempt += 1) {
    const campaign = await prisma.campaign.findFirst({
      where: { createTxHash: txHash },
    });

    if (campaign) return campaign;
    if (attempt < EXTENDED_ATTEMPTS) await sleep(EXTENDED_DELAY_MS);
  }

  return null;
}

// Fallback lookup: if we can't find a campaign by createTxHash (e.g. the
// race between on-chain event emission and DB write slipped past the
// retry window above), try matching by the on-chain campaign ID. This
// recovers CampaignCreated events that would otherwise be silently
// dropped.
//
// Only campaigns in `draft` or `active` status are considered — archived
// or cancelled campaigns with a stale onChainCampaignId (e.g. after a
// Hardhat restart) are skipped so we don't accidentally reattach events
// to a campaign that was deliberately removed from the chain.
async function findCampaignByOnChainId(onChainCampaignId: bigint) {
  for (let attempt = 1; attempt <= EXTENDED_ATTEMPTS; attempt += 1) {
    const campaign = await prisma.campaign.findFirst({
      where: {
        onChainCampaignId,
        campaignStatus: { in: ["draft", "active"] },
      },
    });

    if (campaign) return campaign;
    if (attempt < EXTENDED_ATTEMPTS) await sleep(EXTENDED_DELAY_MS);
  }

  return null;
}

type ContractEventLog = {
  args: Record<string, unknown>;
  transactionHash?: `0x${string}` | null;
  logIndex?: number | null;
  blockNumber?: bigint | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findDonationByTxHash(txHash: string) {
  for (let attempt = 1; attempt <= MATCH_ATTEMPTS; attempt += 1) {
    const donation = await prisma.donation.findUnique({
      where: { txHash },
    });

    if (donation) return donation;
    if (attempt < MATCH_ATTEMPTS) await sleep(MATCH_DELAY_MS);
  }

  return null;
}

async function resolveBeneficiaryWallet(walletAddress: string) {
  const normalizedAddress = getAddress(walletAddress).toLowerCase();

  const existingWallet = await prisma.wallet.findUnique({
    where: { walletAddress: normalizedAddress },
    select: { walletId: true },
  });

  if (existingWallet) {
    return { beneficiaryWalletId: existingWallet.walletId };
  }

  const user = await prisma.user.create({
    data: {
      role: "user",
      wallets: {
        create: {
          walletAddress: normalizedAddress,
          chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111),
          isPrimary: true,
        },
      },
    },
    include: {
      wallets: {
        where: { walletAddress: normalizedAddress },
        take: 1,
      },
    },
  });

  const createdWalletId = user.wallets[0]?.walletId;
  if (!createdWalletId) {
    throw new Error("Failed to create beneficiary wallet");
  }
  return { beneficiaryWalletId: createdWalletId };
}

// ============================================================
//                    EVENT HANDLERS
// ============================================================

async function handleCampaignCreated(log: ContractEventLog) {
  const { campaignId, admin, beneficiary, targetAmount, deadline } = log.args as {
    campaignId: bigint;
    admin: string;
    beneficiary: string;
    targetAmount: bigint;
    deadline: bigint;
  };

  console.log(`📋 CampaignCreated — ID: ${campaignId}, Admin: ${admin}, Beneficiary: ${beneficiary}`);

  try {
    if (!log.transactionHash || log.logIndex == null || log.blockNumber == null) {
      console.log("  ⚠️ CampaignCreated log is missing transaction metadata; skipping");
      return;
    }

    // Primary lookup: match by createTxHash. The frontend writes
    // createTxHash after the on-chain tx confirms, which usually happens
    // within a few hundred milliseconds of the event being emitted, so
    // this lookup normally succeeds on the first poll.
    let campaign = await findCampaignByCreateTxHash(log.transactionHash);

    // Fallback lookup: if createTxHash didn't match (race window slipped
    // past the retry loop above), try matching by on-chain campaign ID.
    if (!campaign) {
      campaign = await findCampaignByOnChainId(campaignId);
    }

    if (campaign) {
      const oldStatus = campaign.campaignStatus;
      const updatedCampaign = await prisma.campaign.update({
        where: { campaignId: campaign.campaignId },
        data: {
          onChainCampaignId: campaignId,
          campaignStatus: oldStatus === "draft" ? "active" : oldStatus,
          publishedAt: campaign.publishedAt || new Date(),
        },
      });

      if (oldStatus !== updatedCampaign.campaignStatus) {
        await prisma.campaignStatusHistory.create({
          data: {
            campaignId: updatedCampaign.campaignId,
            oldStatus,
            newStatus: updatedCampaign.campaignStatus,
          },
        });
      }

      // Store blockchain event
      await prisma.blockchainEvent.upsert({
        where: {
          txHash_logIndex: {
            txHash: log.transactionHash,
            logIndex: log.logIndex,
          },
        },
        update: {},
        create: {
          campaignId: updatedCampaign.campaignId,
          eventName: "CampaignCreated",
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          contractAddress: CONTRACT_ADDRESS,
          payloadJson: {
            campaignId: campaignId.toString(),
            admin,
            beneficiary,
            targetAmount: targetAmount.toString(),
            deadline: deadline.toString(),
          },
          eventTimestamp: new Date(),
        },
      });

      console.log(`  ✅ Indexed CampaignCreated event for campaign ${updatedCampaign.campaignId}`);
    } else {
      console.log(`  ⚠️ No matching off-chain campaign found for create transaction ${log.transactionHash}`);
    }
  } catch (error) {
    console.error("  ❌ Error handling CampaignCreated:", error);
    throw error;
  }
}

async function handleCampaignUpdated(log: ContractEventLog) {
  const { campaignId, beneficiary, targetAmount, deadline } = log.args as {
    campaignId: bigint;
    beneficiary: string;
    targetAmount: bigint;
    deadline: bigint;
  };

  console.log(`✏️ CampaignUpdated — ID: ${campaignId}, Beneficiary: ${beneficiary}`);

  try {
    if (!log.transactionHash || log.logIndex == null || log.blockNumber == null) {
      console.log("  ⚠️ CampaignUpdated log is missing transaction metadata; skipping");
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { onChainCampaignId: campaignId },
    });

    if (!campaign) {
      console.log(`  ⚠️ No matching campaign for on-chain ID ${campaignId}`);
      return;
    }

    const beneficiaryWallet = await resolveBeneficiaryWallet(beneficiary);

    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { campaignId: campaign.campaignId },
        data: {
          beneficiaryWalletId: beneficiaryWallet.beneficiaryWalletId,
          targetAmount: Number(formatEther(targetAmount)),
          campaignDeadline: new Date(Number(deadline) * 1000),
        },
      });

      await tx.blockchainEvent.upsert({
        where: {
          txHash_logIndex: {
            txHash: log.transactionHash!,
            logIndex: log.logIndex!,
          },
        },
        update: {},
        create: {
          campaignId: campaign.campaignId,
          eventName: "CampaignUpdated",
          txHash: log.transactionHash!,
          logIndex: log.logIndex!,
          blockNumber: log.blockNumber!,
          contractAddress: CONTRACT_ADDRESS,
          payloadJson: {
            campaignId: campaignId.toString(),
            beneficiary,
            targetAmount: targetAmount.toString(),
            deadline: deadline.toString(),
          },
          eventTimestamp: new Date(),
        },
      });
    });

    console.log(`  ✅ Indexed CampaignUpdated event for campaign ${campaign.campaignId}`);
  } catch (error) {
    console.error("  ❌ Error handling CampaignUpdated:", error);
    throw error;
  }
}

async function handleCampaignCancelled(log: ContractEventLog) {
  const { campaignId, admin } = log.args as {
    campaignId: bigint;
    admin: string;
  };

  console.log(`🛑 CampaignCancelled — ID: ${campaignId}, Admin: ${admin}`);

  try {
    if (!log.transactionHash || log.logIndex == null || log.blockNumber == null) {
      console.log("  ⚠️ CampaignCancelled log is missing transaction metadata; skipping");
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { onChainCampaignId: campaignId },
    });

    if (!campaign) {
      console.log(`  ⚠️ No matching campaign for on-chain ID ${campaignId}`);
      return;
    }

    const oldStatus = campaign.campaignStatus;

    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { campaignId: campaign.campaignId },
        data: { campaignStatus: "cancelled" },
      });

      if (oldStatus !== "cancelled") {
        await tx.campaignStatusHistory.create({
          data: {
            campaignId: campaign.campaignId,
            oldStatus,
            newStatus: "cancelled",
          },
        });
      }

      await tx.blockchainEvent.upsert({
        where: {
          txHash_logIndex: {
            txHash: log.transactionHash!,
            logIndex: log.logIndex!,
          },
        },
        update: {},
        create: {
          campaignId: campaign.campaignId,
          eventName: "CampaignCancelled",
          txHash: log.transactionHash!,
          logIndex: log.logIndex!,
          blockNumber: log.blockNumber!,
          contractAddress: CONTRACT_ADDRESS,
          payloadJson: {
            campaignId: campaignId.toString(),
            admin,
          },
          eventTimestamp: new Date(),
        },
      });
    });

    console.log(`  ✅ Indexed CampaignCancelled event for campaign ${campaign.campaignId}`);
  } catch (error) {
    console.error("  ❌ Error handling CampaignCancelled:", error);
    throw error;
  }
}

async function handleDonationReceived(log: ContractEventLog) {
  const { campaignId, donor, amount, totalDonated } = log.args as {
    campaignId: bigint;
    donor: string;
    amount: bigint;
    totalDonated: bigint;
  };

  console.log(`💰 DonationReceived — Campaign: ${campaignId}, Donor: ${donor}, Amount: ${amount}`);

  try {
    if (!log.transactionHash || log.logIndex == null || log.blockNumber == null) {
      console.log("  ⚠️ DonationReceived log is missing transaction metadata; skipping");
      return;
    }

    const donation = await findDonationByTxHash(log.transactionHash);

    if (!donation) {
      console.log(`  ⚠️ No matching off-chain donation found for transaction ${log.transactionHash}`);
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { campaignId: donation.campaignId },
    });

    if (!campaign) {
      console.log(`  ⚠️ No matching campaign for donation ${donation.donationId}`);
      return;
    }

    // Update campaign's cached amount
    await prisma.campaign.update({
      where: { campaignId: campaign.campaignId },
      data: {
        currentAmountCached: Number(totalDonated) / 1e18, // Convert wei to ETH
      },
    });

    // Store blockchain event
      await prisma.blockchainEvent.upsert({
        where: {
          txHash_logIndex: {
            txHash: log.transactionHash,
            logIndex: log.logIndex,
          },
        },
        update: {},
        create: {
          campaignId: campaign.campaignId,
          donationId: donation.donationId,
          eventName: "DonationReceived",
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          contractAddress: CONTRACT_ADDRESS,
          payloadJson: {
            campaignId: campaignId.toString(),
          donor,
          amount: amount.toString(),
          totalDonated: totalDonated.toString(),
        },
        eventTimestamp: new Date(),
      },
    });

    console.log(`  ✅ Indexed DonationReceived event, updated cached amount`);
  } catch (error) {
    console.error("  ❌ Error handling DonationReceived:", error);
    throw error;
  }
}

async function handleFundsReleased(log: ContractEventLog) {
  const { campaignId, beneficiary, totalAmount } = log.args as {
    campaignId: bigint;
    beneficiary: string;
    totalAmount: bigint;
  };

  console.log(`🔓 FundsReleased — Campaign: ${campaignId}, Beneficiary: ${beneficiary}, Amount: ${totalAmount}`);

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { onChainCampaignId: campaignId },
    });

    if (!campaign) {
      console.log(`  ⚠️ No matching campaign for on-chain ID ${campaignId}`);
      return;
    }

    const oldStatus = campaign.campaignStatus;

    // Update campaign status to 'released'
    await prisma.campaign.update({
      where: { campaignId: campaign.campaignId },
      data: {
        campaignStatus: "released",
        currentAmountCached: Number(totalAmount) / 1e18,
      },
    });

    // Record status change
    await prisma.campaignStatusHistory.create({
      data: {
        campaignId: campaign.campaignId,
        oldStatus,
        newStatus: "released",
      },
    });

    // Store blockchain event
    await prisma.blockchainEvent.upsert({
      where: {
        txHash_logIndex: {
          txHash: log.transactionHash!,
          logIndex: log.logIndex!,
        },
      },
      update: {},
      create: {
        campaignId: campaign.campaignId,
        eventName: "FundsReleased",
        txHash: log.transactionHash!,
        logIndex: log.logIndex!,
        blockNumber: log.blockNumber!,
        contractAddress: CONTRACT_ADDRESS,
        payloadJson: {
          campaignId: campaignId.toString(),
          beneficiary,
          totalAmount: totalAmount.toString(),
        },
        eventTimestamp: new Date(),
      },
    });

    console.log(`  ✅ Indexed FundsReleased event, campaign status updated to 'released'`);
  } catch (error) {
    console.error("  ❌ Error handling FundsReleased:", error);
    throw error;
  }
}

async function handleDonationEscrowLog(log: Log) {
  try {
    if (!log.transactionHash || log.logIndex == null) {
      return;
    }

    const existingEvent = await prisma.blockchainEvent.findUnique({
      where: {
        txHash_logIndex: {
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        },
      },
      select: { eventId: true },
    });

    if (existingEvent) {
      return;
    }

    const decoded = decodeEventLog({
      abi: DONATION_ESCROW_ABI,
      data: log.data,
      topics: log.topics,
    });

    const parsedLog = {
      ...log,
      args: decoded.args as Record<string, unknown>,
    };

    switch (decoded.eventName) {
      case "CampaignCreated":
        await handleCampaignCreated(parsedLog);
        break;
      case "CampaignUpdated":
        await handleCampaignUpdated(parsedLog);
        break;
      case "CampaignCancelled":
        await handleCampaignCancelled(parsedLog);
        break;
      case "DonationReceived":
        await handleDonationReceived(parsedLog);
        break;
      case "FundsReleased":
        await handleFundsReleased(parsedLog);
        break;
      default:
        break;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("not found on ABI")
    ) {
      return;
    }

    console.error("  ⚠️ Unable to decode DonationEscrow log:", {
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      error,
    });
    throw error;
  }
}

async function processLogs(logs: Log[]) {
  const orderedLogs = [...logs].sort((left, right) => {
    const blockComparison =
      (left.blockNumber ?? BigInt(0)) - (right.blockNumber ?? BigInt(0));
    if (blockComparison !== BigInt(0)) {
      return blockComparison < BigInt(0) ? -1 : 1;
    }
    return (left.logIndex ?? 0) - (right.logIndex ?? 0);
  });

  for (const log of orderedLogs) {
    await handleDonationEscrowLog(log);
  }
}

async function replayUnindexedLogs() {
  const latestBlock = await client.getBlockNumber();
  const earliestIndexed = await prisma.blockchainEvent.aggregate({
    _min: { blockNumber: true },
  });
  const startBlock = earliestIndexed._min.blockNumber ?? latestBlock;

  console.log(
    `🔄 Replaying unindexed logs from block ${startBlock} to ${latestBlock}...`,
  );

  for (
    let fromBlock = startBlock;
    fromBlock <= latestBlock;
    fromBlock += REPLAY_CHUNK_SIZE
  ) {
    const candidateToBlock = fromBlock + REPLAY_CHUNK_SIZE - BigInt(1);
    const toBlock = candidateToBlock < latestBlock
      ? candidateToBlock
      : latestBlock;
    const logs = await client.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock,
      toBlock,
    });

    await processLogs(logs);
  }

  console.log("✅ Historical event replay complete.");
}

// ============================================================
//                     MAIN LISTENER
// ============================================================

async function startIndexer() {
  console.log("🔗 Starting Event Indexer...");
  console.log(`   Contract: ${CONTRACT_ADDRESS}`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log("");

  await replayUnindexedLogs();

  // Watch raw contract logs and decode them with the ABI. This is more robust
  // when the contract emits multiple events in one transaction.
  client.watchEvent({
    address: CONTRACT_ADDRESS,
    onLogs: (logs) => {
      void processLogs(logs).catch((error) => {
        console.error("❌ Live event processing failed:", error);
        process.exit(1);
      });
    },
    onError: (error) => {
      console.error("❌ Event watcher failed:", error);
      process.exit(1);
    },
  });

  console.log("👂 Listening for events...");
  console.log("   Press Ctrl+C to stop.");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down indexer...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

startIndexer().catch((error) => {
  console.error("❌ Indexer failed to start:", error);
  process.exit(1);
});
