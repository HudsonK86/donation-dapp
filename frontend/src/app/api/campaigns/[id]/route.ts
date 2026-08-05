import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/utils/config";
import { DONATION_ESCROW_ABI } from "@/utils/contract";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  parseEther,
} from "viem";
import { hardhat } from "viem/chains";

function toPublicCampaignStatus(status: string) {
  if (status === "released" || status === "funded") return "released";
  if (status === "active") return "active";
  return status;
}

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(config.rpcUrl),
});

async function resolveBeneficiaryWallet(walletAddress: string) {
  const normalizedAddress = getAddress(walletAddress).toLowerCase();

  const existingWallet = await prisma.wallet.findUnique({
    where: { walletAddress: normalizedAddress },
    include: { user: true },
  });

  if (existingWallet) {
    return {
      beneficiaryUserId: existingWallet.userId,
      beneficiaryWalletId: existingWallet.walletId,
    };
  }

  const beneficiaryUser = await prisma.user.create({
    data: {
      role: "user",
      accountStatus: "active",
      wallets: {
        create: {
          walletAddress: normalizedAddress,
          chainId: config.chainId,
          isPrimary: true,
          walletLabel: "Beneficiary Wallet",
        },
      },
    },
    include: { wallets: true },
  });

  return {
    beneficiaryUserId: beneficiaryUser.userId,
    beneficiaryWalletId: beneficiaryUser.wallets[0]?.walletId ?? null,
  };
}

async function verifyCampaignUpdateTransaction({
  transactionHash,
  onChainCampaignId,
  beneficiaryWalletAddress,
  targetAmount,
  deadlineSeconds,
}: {
  transactionHash: string;
  onChainCampaignId: bigint;
  beneficiaryWalletAddress: string;
  targetAmount: number;
  deadlineSeconds: number;
}) {
  if (!transactionHash.startsWith("0x")) return false;

  const receipt = await publicClient
    .getTransactionReceipt({ hash: transactionHash as `0x${string}` })
    .catch(() => null);

  if (!receipt || receipt.status !== "success") return false;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: DONATION_ESCROW_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== "CampaignUpdated") continue;

      const args = decoded.args as {
        campaignId?: bigint;
        beneficiary?: string;
        targetAmount?: bigint;
        deadline?: bigint;
      };

      return (
        args.campaignId === onChainCampaignId &&
        args.beneficiary?.toLowerCase() ===
          getAddress(beneficiaryWalletAddress).toLowerCase() &&
        args.targetAmount === parseEther(String(targetAmount)) &&
        args.deadline === BigInt(deadlineSeconds)
      );
    } catch {
      continue;
    }
  }

  return false;
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

/**
 * PATCH /api/campaigns/[id]
 * Update editable campaign data from the admin dashboard.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const preflightOnly = body.preflightOnly === true;

    const campaign = await prisma.campaign.findUnique({
      where: { campaignId: id },
      include: {
        _count: { select: { donations: true } },
        images: {
          orderBy: { displayOrder: "asc" },
          take: 1,
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (
      ["released", "funded", "cancelled", "archived"].includes(
        campaign.campaignStatus
      )
    ) {
      return NextResponse.json(
        { error: "This campaign can no longer be edited." },
        { status: 400 }
      );
    }

    const campaignTitle =
      typeof body.campaignTitle === "string" ? body.campaignTitle.trim() : "";
    const campaignDescription =
      typeof body.campaignDescription === "string" &&
      body.campaignDescription.trim()
        ? body.campaignDescription.trim()
        : null;

    if (!campaignTitle) {
      return NextResponse.json(
        { error: "Campaign title is required" },
        { status: 400 }
      );
    }

    const includesTermUpdate =
      "beneficiaryWalletAddress" in body ||
      "targetAmount" in body ||
      "campaignDeadline" in body;

    if (includesTermUpdate && campaign._count.donations > 0) {
      return NextResponse.json(
        { error: "Campaign terms cannot be changed after donations are received." },
        { status: 400 }
      );
    }

    const updateData: {
      campaignTitle: string;
      campaignDescription: string | null;
      beneficiaryUserId?: string | null;
      beneficiaryWalletId?: string | null;
      targetAmount?: number;
      campaignDeadline?: Date;
    } = {
      campaignTitle,
      campaignDescription,
    };

    if (includesTermUpdate) {
      const beneficiaryWalletAddress =
        typeof body.beneficiaryWalletAddress === "string"
          ? body.beneficiaryWalletAddress.trim()
          : "";
      const targetAmount = Number(body.targetAmount);
      const campaignDeadline =
        typeof body.campaignDeadline === "string"
          ? new Date(body.campaignDeadline)
          : null;

      if (!isAddress(beneficiaryWalletAddress)) {
        return NextResponse.json(
          { error: "Valid beneficiary wallet address is required" },
          { status: 400 }
        );
      }

      if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
        return NextResponse.json(
          { error: "Target amount must be greater than 0" },
          { status: 400 }
        );
      }

      if (!campaignDeadline || Number.isNaN(campaignDeadline.getTime())) {
        return NextResponse.json(
          { error: "Valid campaign deadline is required" },
          { status: 400 }
        );
      }

      if (campaignDeadline <= new Date()) {
        return NextResponse.json(
          { error: "Campaign deadline must be in the future" },
          { status: 400 }
        );
      }

      if (campaign.onChainCampaignId == null) {
        return NextResponse.json(
          { error: "Campaign is not linked to an on-chain campaign." },
          { status: 400 }
        );
      }

      const deadlineSeconds = Math.floor(campaignDeadline.getTime() / 1000);

      if (preflightOnly) {
        return NextResponse.json({ ok: true });
      }

      const termsTxHash =
        typeof body.termsTxHash === "string" ? body.termsTxHash : "";
      const verifiedTermsUpdate = await verifyCampaignUpdateTransaction({
        transactionHash: termsTxHash,
        onChainCampaignId: campaign.onChainCampaignId,
        beneficiaryWalletAddress,
        targetAmount,
        deadlineSeconds,
      });

      if (!verifiedTermsUpdate) {
        return NextResponse.json(
          { error: "The on-chain campaign update transaction could not be verified." },
          { status: 400 }
        );
      }

      const beneficiary = await resolveBeneficiaryWallet(beneficiaryWalletAddress);
      updateData.beneficiaryUserId = beneficiary.beneficiaryUserId;
      updateData.beneficiaryWalletId = beneficiary.beneficiaryWalletId;
      updateData.targetAmount = targetAmount;
      updateData.campaignDeadline = campaignDeadline;
    }

    if (preflightOnly) {
      return NextResponse.json({ ok: true });
    }

    const imageUrl =
      typeof body.imageUrl === "string" && body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;

    const updatedCampaign = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.update({
        where: { campaignId: id },
        data: updateData,
        include: {
          creator: { select: { userId: true, fullName: true } },
          beneficiaryWallet: { select: { walletAddress: true } },
          images: {
            orderBy: { displayOrder: "asc" },
          },
          _count: { select: { donations: true } },
        },
      });

      if (imageUrl) {
        const firstImage = campaign.images[0];
        if (firstImage) {
          await tx.campaignImage.update({
            where: { imageId: firstImage.imageId },
            data: { imageUrl },
          });
        } else {
          await tx.campaignImage.create({
            data: {
              campaignId: id,
              imageUrl,
              displayOrder: 0,
            },
          });
        }
      }

      return updated;
    });

    return NextResponse.json({
      campaign: {
        ...updatedCampaign,
        targetAmount: Number(updatedCampaign.targetAmount),
        onChainCampaignId:
          updatedCampaign.onChainCampaignId != null
            ? Number(updatedCampaign.onChainCampaignId)
            : null,
      },
    });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}
