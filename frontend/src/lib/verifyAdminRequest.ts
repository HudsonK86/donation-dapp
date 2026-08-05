import { getAddress, isAddress, verifyMessage } from "viem";
import { prisma } from "@/lib/prisma";
import { config } from "@/utils/config";
import { buildAdminActionMessage } from "@/utils/adminMessage";

export interface AdminAuthPayload {
  walletAddress?: unknown;
  action?: unknown;
  timestamp?: unknown;
  message?: unknown;
  signature?: unknown;
}

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export async function verifyAdminRequest(payload: AdminAuthPayload) {
  const walletAddress =
    typeof payload.walletAddress === "string" ? payload.walletAddress : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  const timestamp =
    typeof payload.timestamp === "number" ? payload.timestamp : Number.NaN;
  const message = typeof payload.message === "string" ? payload.message : "";
  const signature =
    typeof payload.signature === "string" ? payload.signature : "";

  if (!isAddress(walletAddress) || !action || !Number.isFinite(timestamp)) {
    return false;
  }

  if (Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }

  const normalizedAddress = getAddress(walletAddress);
  const expectedMessage = buildAdminActionMessage(
    normalizedAddress,
    action,
    timestamp
  );

  if (message !== expectedMessage) {
    return false;
  }

  const signatureMatches = await verifyMessage({
    address: normalizedAddress,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);

  if (!signatureMatches) {
    return false;
  }

  const wallet = await prisma.wallet.findUnique({
    where: { walletAddress: normalizedAddress.toLowerCase() },
    include: { user: { select: { role: true } } },
  });

  return (
    wallet?.user.role === "admin" ||
    normalizedAddress.toLowerCase() === config.adminWalletAddress
  );
}
