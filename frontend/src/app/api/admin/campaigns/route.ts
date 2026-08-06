import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { config } from "@/utils/config";

function toPublicCampaignStatus(status: string) {
  if (status === "released" || status === "funded") return "released";
  if (status === "active") return "active";
  return status;
}

function isLocalHardhat() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ||
      process.env.NEXT_PUBLIC_RPC_URL?.includes("127.0.0.1") ||
      process.env.NEXT_PUBLIC_RPC_URL?.includes("localhost"))
  );
}

async function isLocalAdminWallet(walletAddress: string) {
  if (!isAddress(walletAddress)) return false;

  const normalizedAddress = getAddress(walletAddress).toLowerCase();

  if (normalizedAddress === config.adminWalletAddress) {
    return true;
  }

  const wallet = await prisma.wallet.findUnique({
    where: { walletAddress: normalizedAddress },
    include: { user: { select: { role: true } } },
  });

  return wallet?.user.role === "admin";
}

export async function GET(request: Request) {
  try {
    if (!isLocalHardhat()) {
      return NextResponse.json(
        { error: "Admin campaign list is only available in local development." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("walletAddress") || "";

    if (!(await isLocalAdminWallet(walletAddress))) {
      return NextResponse.json(
        { error: "Admin wallet is required." },
        { status: 403 }
      );
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        campaignStatus: { in: ["active", "released", "funded", "cancelled"] },
      },
      include: {
        creator: {
          select: { userId: true, fullName: true },
        },
        beneficiaryWallet: {
          select: {
            walletAddress: true,
            user: { select: { userId: true, fullName: true } },
          },
        },
        _count: {
          select: { donations: true },
        },
        donations: {
          select: { donationAmount: true },
        },
        blockchainEvents: {
          where: { eventName: "FundsReleased" },
          orderBy: { eventTimestamp: "desc" },
          take: 1,
        },
        statusHistory: {
          where: { newStatus: { in: ["released", "funded"] } },
          orderBy: { changedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const campaignsWithAmounts = campaigns.map((campaign) => {
      const {
        donations,
        onChainCampaignId,
        targetAmount,
        blockchainEvents,
        statusHistory,
        ...campaignWithoutDonations
      } = campaign;
      const totalDonated = donations.reduce(
        (sum, donation) => sum + Number(donation.donationAmount),
        0
      );
      const releasedAt =
        blockchainEvents[0]?.eventTimestamp.toISOString() ??
        statusHistory[0]?.changedAt.toISOString() ??
        null;

      return {
        ...campaignWithoutDonations,
        targetAmount: Number(targetAmount),
        tokenSymbol: "USDT",
        campaignStatus: toPublicCampaignStatus(campaign.campaignStatus),
        onChainCampaignId:
          onChainCampaignId != null ? Number(onChainCampaignId) : null,
        currentAmount: totalDonated,
        releasedAt,
      };
    });

    return NextResponse.json({
      campaigns: campaignsWithAmounts,
      total: campaignsWithAmounts.length,
    });
  } catch (error) {
    console.error("Error fetching admin campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin campaigns" },
      { status: 500 }
    );
  }
}
