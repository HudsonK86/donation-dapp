import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toPublicCampaignStatus(status: string) {
  return status === "released" || status === "funded" ? "released" : "active";
}

/**
 * GET /api/campaigns
 * List campaigns with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};

    if (status === "active") {
      where.campaignStatus = "active";
    } else if (status === "released") {
      where.campaignStatus = { in: ["released", "funded"] };
    } else {
      where.campaignStatus = { in: ["active", "released", "funded"] };
    }

    if (search) {
      where.campaignTitle = {
        contains: search,
        mode: "insensitive",
      };
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
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
            take: 1,
          },
          _count: {
            select: { donations: true },
          },
          donations: {
            select: { donationAmount: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.campaign.count({ where }),
    ]);

    // Calculate currentAmount from donations for each campaign
    const campaignsWithAmounts = campaigns.map((c) => {
      const totalDonated = c.donations.reduce(
        (sum, d) => sum + Number(d.donationAmount),
        0
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { donations, onChainCampaignId, targetAmount, ...campaignWithoutDonations } = c;
      return {
        ...campaignWithoutDonations,
        targetAmount: Number(targetAmount),
        tokenSymbol: "USDT",
        campaignStatus: toPublicCampaignStatus(c.campaignStatus),
        onChainCampaignId: onChainCampaignId != null ? Number(onChainCampaignId) : null,
        currentAmount: totalDonated,
      };
    });

    return NextResponse.json({
      campaigns: campaignsWithAmounts,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns
 * Create a new campaign (admin only — called after on-chain tx)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      creatorUserId,
      beneficiaryUserId,
      beneficiaryWalletId,
      beneficiaryWalletAddress,
      campaignTitle,
      campaignDescription,
      targetAmount,
      tokenSymbol,
      onChainCampaignId,
      createTxHash,
      campaignDeadline,
      imageUrl,
    } = body;

    // Validation
    if (!creatorUserId || !campaignTitle || !targetAmount) {
      return NextResponse.json(
        { error: "Missing required fields: creatorUserId, campaignTitle, targetAmount" },
        { status: 400 }
      );
    }

    let normalizedOnChainCampaignId: bigint | null = null;
    if (onChainCampaignId != null) {
      try {
        normalizedOnChainCampaignId = BigInt(onChainCampaignId);
      } catch {
        return NextResponse.json(
          { error: "Invalid on-chain campaign ID" },
          { status: 400 }
        );
      }
    }

    if (createTxHash) {
      const existingCampaign = await prisma.campaign.findFirst({
        where: { createTxHash },
        include: {
          creator: { select: { userId: true, fullName: true } },
          images: true,
        },
      });

      if (existingCampaign) {
        return NextResponse.json({
          campaign: {
            ...existingCampaign,
            targetAmount: Number(existingCampaign.targetAmount),
            onChainCampaignId: existingCampaign.onChainCampaignId != null
              ? Number(existingCampaign.onChainCampaignId)
              : null,
          },
        });
      }
    }

    if (normalizedOnChainCampaignId != null) {
      const existingOnChainCampaign = await prisma.campaign.findUnique({
        where: { onChainCampaignId: normalizedOnChainCampaignId },
      });

      if (existingOnChainCampaign) {
        return NextResponse.json(
          {
            error:
              "This local chain campaign ID is already linked to a different database campaign. Restarting Hardhat without resetting local data can reuse on-chain IDs.",
          },
          { status: 409 }
        );
      }
    }

    let finalBeneficiaryUserId = beneficiaryUserId || null;
    let finalBeneficiaryWalletId = beneficiaryWalletId || null;

    if (!finalBeneficiaryWalletId && beneficiaryWalletAddress) {
      const normalizedBeneficiaryAddress = String(beneficiaryWalletAddress).toLowerCase();

      const existingWallet = await prisma.wallet.findUnique({
        where: { walletAddress: normalizedBeneficiaryAddress },
        include: { user: true },
      });

      if (existingWallet) {
        finalBeneficiaryUserId = existingWallet.userId;
        finalBeneficiaryWalletId = existingWallet.walletId;
      } else {
        const beneficiaryUser = await prisma.user.create({
          data: {
            role: "user",
            accountStatus: "active",
            wallets: {
              create: {
                walletAddress: normalizedBeneficiaryAddress,
                chainId: 31337,
                isPrimary: true,
                walletLabel: "Beneficiary Wallet",
              },
            },
          },
          include: { wallets: true },
        });

        finalBeneficiaryUserId = beneficiaryUser.userId;
        finalBeneficiaryWalletId = beneficiaryUser.wallets[0]?.walletId || null;
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        creatorUserId,
        beneficiaryUserId: finalBeneficiaryUserId,
        beneficiaryWalletId: finalBeneficiaryWalletId,
        campaignTitle,
        campaignDescription: campaignDescription || null,
        targetAmount: parseFloat(targetAmount),
        tokenSymbol: tokenSymbol || "USDT",
        onChainCampaignId: normalizedOnChainCampaignId,
        createTxHash: createTxHash || null,
        campaignStatus: normalizedOnChainCampaignId != null ? "active" : "draft",
        campaignDeadline: campaignDeadline ? new Date(campaignDeadline) : null,
        publishedAt: normalizedOnChainCampaignId != null ? new Date() : null,
        images: imageUrl ? {
          create: [{ imageUrl }]
        } : undefined,
      },
      include: {
        creator: { select: { userId: true, fullName: true } },
        images: true,
      },
    });

    // Create initial status history entry
    await prisma.campaignStatusHistory.create({
      data: {
        campaignId: campaign.campaignId,
        oldStatus: null,
        newStatus: campaign.campaignStatus,
      },
    });

    return NextResponse.json({
      campaign: {
        ...campaign,
        targetAmount: Number(campaign.targetAmount),
        onChainCampaignId: campaign.onChainCampaignId != null
          ? Number(campaign.onChainCampaignId)
          : null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
