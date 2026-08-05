import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/donations
 * List donations — optionally filtered by campaign, donor, or wallet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const donorUserId = searchParams.get("donorUserId");
    const walletAddress = searchParams.get("walletAddress");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};

    if (campaignId) where.campaignId = campaignId;
    if (donorUserId) where.donorUserId = donorUserId;
    if (walletAddress) {
      where.donorWallet = { walletAddress };
    }

    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
        where,
        include: {
          campaign: {
            select: {
              campaignId: true,
              campaignTitle: true,
              campaignStatus: true,
            },
          },
          donorUser: {
            select: { userId: true, fullName: true },
          },
          donorWallet: {
            select: { walletAddress: true },
          },
        },
        orderBy: { donatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.donation.count({ where }),
    ]);

    return NextResponse.json({
      donations,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching donations:", error);
    return NextResponse.json(
      { error: "Failed to fetch donations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/donations
 * Record a donation (called after on-chain transaction is confirmed)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      campaignId,
      donorUserId,
      donorWalletId,
      donationAmount,
      txHash,
      blockNumber,
      donatedAt,
    } = body;

    // Validation
    if (!campaignId || !donorUserId || !donorWalletId || !donationAmount || !txHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check for duplicate transaction hash
    const existing = await prisma.donation.findUnique({
      where: { txHash },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Donation with this transaction hash already exists" },
        { status: 409 }
      );
    }

    const donation = await prisma.donation.create({
      data: {
        campaignId,
        donorUserId,
        donorWalletId,
        donationAmount: parseFloat(donationAmount),
        txHash,
        blockNumber: blockNumber ? BigInt(blockNumber) : null,
        donationStatus: "confirmed",
        donatedAt: donatedAt ? new Date(donatedAt) : new Date(),
      },
    });

    return NextResponse.json({ donation }, { status: 201 });
  } catch (error) {
    console.error("Error recording donation:", error);
    return NextResponse.json(
      { error: "Failed to record donation" },
      { status: 500 }
    );
  }
}
