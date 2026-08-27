import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toPublicCampaignStatus(status: string, deadline: Date | null | undefined) {
  if (status === "released" || status === "funded") return "released";
  if (status === "active" && deadline && new Date() > deadline) return "expired";
  if (status === "active") return "active";
  return status;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("walletAddress");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    const wallet = await prisma.wallet.findUnique({
      where: { walletAddress: normalizedAddress },
      include: { user: true },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userId = wallet.user.userId;

    // 1. Total Donated (sum of all donations by user)
    const donationsAggr = await prisma.donation.aggregate({
      where: { donorUserId: userId },
      _sum: { donationAmount: true },
    });
    const totalDonated = Number(donationsAggr._sum.donationAmount || 0);

    // 2. Campaigns Donated (count of distinct campaigns)
    const campaignsDonatedGroup = await prisma.donation.groupBy({
      by: ["campaignId"],
      where: { donorUserId: userId },
    });
    const campaignsDonated = campaignsDonatedGroup.length;

    // 3. Funds Received (sum of targets for 'released' campaigns where user is beneficiary)
    const fundsReceivedAggr = await prisma.campaign.aggregate({
      where: {
        beneficiaryWallet: { userId },
        campaignStatus: "released",
      },
      _sum: { targetAmount: true },
    });
    const fundsReceived = Number(fundsReceivedAggr._sum.targetAmount || 0);

    // 4. Active Campaigns (where user is beneficiary)
    const activeCampaigns = await prisma.campaign.count({
      where: {
        beneficiaryWallet: { userId },
        campaignStatus: "active",
      },
    });

    // 5. Recent Donations
    const recentDonations = await prisma.donation.findMany({
      where: { donorUserId: userId },
      include: {
        campaign: {
          select: { campaignTitle: true, tokenSymbol: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const formattedDonations = recentDonations.map((d) => ({
      donationId: d.donationId,
      campaignId: d.campaignId,
      campaignTitle: d.campaign.campaignTitle,
      amount: Number(d.donationAmount),
      tokenSymbol: "ETH",
      txHash: d.txHash,
      date: d.createdAt.toISOString(),
    }));

    // 6. Beneficiary Campaigns
    const beneficiaryCampaignsRaw = await prisma.campaign.findMany({
      where: { beneficiaryWallet: { userId } },
      include: {
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

    const formattedBeneficiaryCampaigns = beneficiaryCampaignsRaw.map((c) => {
      const totalDonated = c.donations.reduce(
        (sum, d) => sum + Number(d.donationAmount),
        0
      );
      return {
        campaignId: c.campaignId,
        campaignTitle: c.campaignTitle,
        targetAmount: Number(c.targetAmount),
        currentAmount: totalDonated,
        tokenSymbol: "ETH",
        status: toPublicCampaignStatus(c.campaignStatus, c.campaignDeadline),
        createdAt: c.createdAt.toISOString(),
        deadline: c.campaignDeadline ? c.campaignDeadline.toISOString() : null,
        releasedAt:
          c.blockchainEvents[0]?.eventTimestamp.toISOString() ??
          c.statusHistory[0]?.changedAt.toISOString() ??
          null,
      };
    });

    return NextResponse.json({
      stats: {
        totalDonated,
        campaignsDonated,
        campaignsReceived: beneficiaryCampaignsRaw.length,
        received: fundsReceived,
        fundsReceived,
        activeCampaigns,
      },
      donations: formattedDonations,
      beneficiaryCampaigns: formattedBeneficiaryCampaigns,
    });
  } catch (error) {
    console.error("Error fetching user dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
