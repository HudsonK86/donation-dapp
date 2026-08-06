import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/utils/config";

/**
 * GET /api/users/me?walletAddress=0x...
 * Returns the user profile and role for a given wallet address.
 * Used by the frontend to determine admin access.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("walletAddress");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress query parameter is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Check database first
    const wallet = await prisma.wallet.findUnique({
      where: { walletAddress: normalizedAddress },
      include: {
        user: {
          select: {
            userId: true,
            role: true,
            fullName: true,
            email: true,
            profileBio: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (wallet && wallet.user) {
      return NextResponse.json({
        user: wallet.user,
        wallet: {
          walletId: wallet.walletId,
          walletAddress: wallet.walletAddress,
          chainId: wallet.chainId,
          isPrimary: wallet.isPrimary,
        },
        isAdmin: wallet.user.role === "admin",
      });
    }

    // Fallback: check env-based admin wallet (for bootstrapping without DB seed)
    if (config.adminWalletAddress && normalizedAddress === config.adminWalletAddress) {
      return NextResponse.json({
        user: null,
        wallet: null,
        isAdmin: true,
        source: "env",
      });
    }

    return NextResponse.json(
      { error: "User not found", isAdmin: false },
      { status: 404 }
    );
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/me
 * Updates the profile linked to a connected wallet address.
 */
export async function PATCH(request: NextRequest) {
  try {
    const {
      walletAddress,
      fullName,
      email,
      profileBio,
      avatarUrl,
    } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = String(walletAddress).toLowerCase();

    const wallet = await prisma.wallet.findUnique({
      where: { walletAddress: normalizedAddress },
      include: { user: true },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet is not linked to a user yet" },
        { status: 404 }
      );
    }

    const normalizedEmail = typeof email === "string" && email.trim()
      ? email.trim()
      : null;

    const user = await prisma.user.update({
      where: { userId: wallet.userId },
      data: {
        fullName: typeof fullName === "string" && fullName.trim()
          ? fullName.trim()
          : null,
        email: normalizedEmail,
        profileBio: typeof profileBio === "string" && profileBio.trim()
          ? profileBio.trim()
          : null,
        avatarUrl: typeof avatarUrl === "string" && avatarUrl.trim()
          ? avatarUrl.trim()
          : null,
      },
      select: {
        userId: true,
        role: true,
        fullName: true,
        email: true,
        profileBio: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({
      user,
      wallet: {
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
        chainId: wallet.chainId,
        isPrimary: wallet.isPrimary,
      },
      isAdmin: user.role === "admin",
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
