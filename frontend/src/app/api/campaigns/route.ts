import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toPublicCampaignStatus(status: string, deadline: Date | null | undefined) {
  if (status === "released" || status === "funded") return "released";
  if (status === "active" && deadline && new Date() > deadline) return "releasing";
  if (status === "active") return "active";
  return status;
}

function isLocalHardhat() {
  return (
    process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ||
    process.env.NEXT_PUBLIC_RPC_URL?.includes("127.0.0.1") ||
    process.env.NEXT_PUBLIC_RPC_URL?.includes("localhost")
  );
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
    } else if (status === "expired") {
      where.campaignStatus = "active";
      where.campaignDeadline = { lt: new Date() };
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
        take: limit,
        skip: offset,
      }),
      prisma.campaign.count({ where }),
    ]);

    // Calculate currentAmount from donations for each campaign
    const campaignsWithAmounts = campaigns.map((c) => {
      const {
        donations,
        onChainCampaignId,
        targetAmount,
        blockchainEvents,
        statusHistory,
        ...campaignWithoutDonations
      } = c;
      const totalDonated = donations.reduce(
        (sum, d) => sum + Number(d.donationAmount),
        0
      );
      const releasedAt =
        blockchainEvents[0]?.eventTimestamp.toISOString() ??
        statusHistory[0]?.changedAt.toISOString() ??
        null;

      return {
        ...campaignWithoutDonations,
        targetAmount: Number(targetAmount),
        tokenSymbol: "ETH",
        campaignStatus: toPublicCampaignStatus(c.campaignStatus, c.campaignDeadline),
        onChainCampaignId: onChainCampaignId != null ? Number(onChainCampaignId) : null,
        currentAmount: totalDonated,
        releasedAt,
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
 * Create a new campaign (admin only — called after on-chain transaction)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      creatorUserId,
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
        if (!isLocalHardhat()) {
          return NextResponse.json(
            {
              error:
                "This on-chain campaign ID is already linked to a different database campaign.",
            },
            { status: 409 }
          );
        }

        await prisma.campaign.update({
          where: { campaignId: existingOnChainCampaign.campaignId },
          data: {
            onChainCampaignId: null,
            campaignStatus: "archived",
          },
        });

        await prisma.campaignStatusHistory.create({
          data: {
            campaignId: existingOnChainCampaign.campaignId,
            oldStatus: existingOnChainCampaign.campaignStatus,
            newStatus: "archived",
          },
        });
      }
    }

    let finalBeneficiaryWalletId = beneficiaryWalletId || null;

    if (!finalBeneficiaryWalletId && beneficiaryWalletAddress) {
      const normalizedBeneficiaryAddress = String(beneficiaryWalletAddress).toLowerCase();

      const existingWallet = await prisma.wallet.findUnique({
        where: { walletAddress: normalizedBeneficiaryAddress },
      });

      if (existingWallet) {
        finalBeneficiaryWalletId = existingWallet.walletId;
      } else {
        const beneficiaryUser = await prisma.user.create({
          data: {
            role: "user",
            wallets: {
              create: {
                walletAddress: normalizedBeneficiaryAddress,
                chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111),
                isPrimary: true,
                walletLabel: "Beneficiary Wallet",
              },
            },
          },
          include: { wallets: true },
        });

        finalBeneficiaryWalletId = beneficiaryUser.wallets[0]?.walletId ?? null;
      }
    }

    if (!finalBeneficiaryWalletId) {
      return NextResponse.json(
        { error: "A beneficiary wallet (beneficiaryWalletId or beneficiaryWalletAddress) is required." },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        creatorUserId,
        beneficiaryWalletId: finalBeneficiaryWalletId,
        campaignTitle,
        campaignDescription: campaignDescription || null,
        imageUrl: imageUrl || null,
        targetAmount: parseFloat(targetAmount),
        tokenSymbol: tokenSymbol || "ETH",
        onChainCampaignId: normalizedOnChainCampaignId,
        createTxHash: createTxHash || null,
        campaignStatus: normalizedOnChainCampaignId != null ? "active" : "draft",
        campaignDeadline: campaignDeadline ? new Date(campaignDeadline) : null,
        publishedAt: normalizedOnChainCampaignId != null ? new Date() : null,
      },
      include: {
        creator: { select: { userId: true, fullName: true } },
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
