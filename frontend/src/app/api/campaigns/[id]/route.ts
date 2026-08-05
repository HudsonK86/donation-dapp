import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toPublicCampaignStatus(status: string) {
  return status === "released" || status === "funded" ? "released" : "active";
}

/**
 * GET /api/campaigns/[id]
 * Fetch a single campaign by its UUID, including donations and blockchain events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { campaignId: id },
      include: {
        creator: {
          select: { userId: true, fullName: true },
          },
        beneficiaryUser: {
          select: { userId: true, fullName: true },
        },
        beneficiaryWallet: {
          select: { walletAddress: true },
        },
        images: {
          orderBy: { displayOrder: "asc" },
        },
        donations: {
          include: {
            donorUser: { select: { userId: true, fullName: true } },
            donorWallet: { select: { walletAddress: true } },
          },
          orderBy: { donatedAt: "desc" },
        },
        blockchainEvents: {
          orderBy: { eventTimestamp: "desc" },
          take: 50,
        },
        _count: {
          select: { donations: true },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Calculate current amount from donations
    const currentAmount = campaign.donations.reduce(
      (sum, d) => sum + Number(d.donationAmount),
      0
    );

    const donations = campaign.donations.map((donation) => ({
      ...donation,
      donationAmount: Number(donation.donationAmount),
      blockNumber: donation.blockNumber != null
        ? donation.blockNumber.toString()
        : null,
    }));

    const visibleBlockchainEvents = [];
    let fallbackCampaignCreatedShown = false;

    for (const event of campaign.blockchainEvents) {
      if (event.eventName !== "CampaignCreated") {
        visibleBlockchainEvents.push(event);
        continue;
      }

      if (campaign.createTxHash) {
        if (event.txHash === campaign.createTxHash) {
          visibleBlockchainEvents.push(event);
        }
        continue;
      }

      if (!fallbackCampaignCreatedShown) {
        visibleBlockchainEvents.push(event);
        fallbackCampaignCreatedShown = true;
      }
    }

    const blockchainEvents = visibleBlockchainEvents.map((event) => {
      const payload =
        event.payloadJson &&
        typeof event.payloadJson === "object" &&
        !Array.isArray(event.payloadJson)
          ? (event.payloadJson as Record<string, string | undefined>)
          : {};

      return {
        ...event,
        eventType: event.eventName,
        fromAddress:
          payload.donor ??
          payload.admin ??
          payload.beneficiary ??
          event.contractAddress,
        toAddress: payload.beneficiary ?? null,
        valueWei:
          payload.amount ??
          payload.totalAmount ??
          payload.targetAmount ??
          null,
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.eventTimestamp.toISOString(),
      };
    });

    return NextResponse.json({
      campaign: {
        ...campaign,
        targetAmount: Number(campaign.targetAmount),
        tokenSymbol: "USDT",
        campaignStatus: toPublicCampaignStatus(campaign.campaignStatus),
        onChainCampaignId: campaign.onChainCampaignId != null
          ? Number(campaign.onChainCampaignId)
          : null,
        donations,
        blockchainEvents,
        currentAmount,
      },
    });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}
