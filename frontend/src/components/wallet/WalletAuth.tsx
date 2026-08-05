"use client";
import { useAppKitAccount } from "@reown/appkit/react";
import { useEffect } from "react";

export function WalletAuth() {
  const { address, isConnected } = useAppKitAccount();

  useEffect(() => {
    if (isConnected && address) {
      // Find or create user by wallet address
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          chainId: 31337,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.isNew) {
            console.log("🆕 New user created:", data.user.userId);
          } else {
            console.log("✅ Existing user found:", data.user.userId);
          }
        })
        .catch((err) => {
          console.error("❌ Failed to sync wallet user:", err);
        });
    }
  }, [isConnected, address]);

  return null; // This component renders nothing — it's a side-effect only
}
