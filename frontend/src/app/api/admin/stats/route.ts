import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/stats
 * Aggregate stats for the admin dashboard
 */
export async function GET() {
  try {
    const [
      totalCampaigns,
      activeCampaigns,
      totalDonationsResult,
      releasedFundsResult,
    ] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { campaignStatus: "active" } }),
      prisma.donation.aggregate({ _sum: { donationAmount: true } }),
      prisma.donation.aggregate({
        _sum: { donationAmount: true },
        where: {
          campaign: { campaignStatus: "released" },
        },
      }),
    ]);

    return NextResponse.json({
      totalCampaigns,
      activeCampaigns,
      totalDonations: Number(totalDonationsResult._sum.donationAmount || 0),
      fundsReleased: Number(releasedFundsResult._sum.donationAmount || 0),
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
