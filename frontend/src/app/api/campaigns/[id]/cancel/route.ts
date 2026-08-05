import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/utils/config";
import { DONATION_ESCROW_ABI } from "@/utils/contract";
import { createPublicClient, decodeEventLog, http } from "viem";
import { hardhat } from "viem/chains";

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(config.rpcUrl),
});

async function verifyCampaignCancelTransaction({
  transactionHash,
  onChainCampaignId,
}: {
  transactionHash: string;
  onChainCampaignId: bigint;
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

      if (decoded.eventName !== "CampaignCancelled") continue;

      const args = decoded.args as {
        campaignId?: bigint;
      };

      return args.campaignId === onChainCampaignId;
    } catch {
      continue;
    }
  }

  return false;
}

export async function POST(
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
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.campaignStatus !== "active") {
      return NextResponse.json(
        { error: "Only active campaigns can be cancelled." },
        { status: 400 }
      );
    }

    if (campaign._count.donations > 0) {
      return NextResponse.json(
        { error: "Campaigns with donations cannot be cancelled." },
        { status: 400 }
      );
    }

    if (campaign.onChainCampaignId == null) {
      return NextResponse.json(
        { error: "Campaign is not linked to an on-chain campaign." },
        { status: 400 }
      );
    }

    if (preflightOnly) {
      return NextResponse.json({ ok: true });
    }

    const cancelTxHash =
      typeof body.cancelTxHash === "string" ? body.cancelTxHash : "";

    const verifiedCancel = await verifyCampaignCancelTransaction({
      transactionHash: cancelTxHash,
      onChainCampaignId: campaign.onChainCampaignId,
    });

    if (!verifiedCancel) {
      return NextResponse.json(
        { error: "The on-chain campaign cancel transaction could not be verified." },
        { status: 400 }
      );
    }

    const updatedCampaign = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.update({
        where: { campaignId: id },
        data: { campaignStatus: "cancelled" },
      });

      await tx.campaignStatusHistory.create({
        data: {
          campaignId: id,
          oldStatus: campaign.campaignStatus,
          newStatus: "cancelled",
        },
      });

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
    console.error("Error cancelling campaign:", error);
    return NextResponse.json(
      { error: "Failed to cancel campaign" },
      { status: 500 }
    );
  }
}
