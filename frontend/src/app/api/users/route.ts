import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/utils/config";

/**
 * POST /api/users
 * Find or create a user by wallet address (wallet-based auth for regular users)
 */
export async function POST(request: NextRequest) {
  try {
    let body: { walletAddress?: unknown; chainId?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Valid JSON body is required" },
        { status: 400 }
      );
    }

    const { walletAddress, chainId } = body;

    if (typeof walletAddress !== "string" || !walletAddress.trim()) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.trim().toLowerCase();
    const parsedChainId = typeof chainId === "number"
      ? chainId
      : Number(chainId) || 31337;

    // Check if wallet already exists
    const existingWallet = await prisma.wallet.findUnique({
      where: { walletAddress: normalizedAddress },
      include: {
        user: true,
      },
    });

    if (existingWallet) {
      if (
        config.adminWalletAddress &&
        normalizedAddress === config.adminWalletAddress &&
        existingWallet.user.role !== "admin"
      ) {
        const adminUser = await prisma.user.update({
          where: { userId: existingWallet.userId },
          data: { role: "admin" },
        });

        return NextResponse.json({
          user: adminUser,
          wallet: existingWallet,
          isNew: false,
        });
      }

      return NextResponse.json({
        user: existingWallet.user,
        wallet: existingWallet,
        isNew: false,
      });
    }

    // Create new user + wallet
    const user = await prisma.user.create({
      data: {
        role: config.adminWalletAddress &&
          normalizedAddress === config.adminWalletAddress
          ? "admin"
          : "user",
        wallets: {
          create: {
            walletAddress: normalizedAddress,
            chainId: parsedChainId,
            isPrimary: true,
            walletLabel: "Primary Wallet",
          },
        },
      },
      include: {
        wallets: true,
      },
    });

    return NextResponse.json(
      {
        user,
        wallet: user.wallets[0],
        isNew: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in user lookup/creation:", error);
    return NextResponse.json(
      { error: "Failed to process user" },
      { status: 500 }
    );
  }
}
