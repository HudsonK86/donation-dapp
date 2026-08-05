"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import { useState, useEffect, useCallback } from "react";

interface UserInfo {
  userId: string;
  role: string;
  fullName: string | null;
  email: string | null;
  profileBio: string | null;
  avatarUrl: string | null;
}

interface UseAdminAuthReturn {
  isAdmin: boolean;
  isLoading: boolean;
  isConnected: boolean;
  address: string | undefined;
  user: UserInfo | null;
  refetch: () => void;
}

/**
 * Hook that checks whether the connected wallet belongs to an admin user.
 * Queries /api/users/me with the wallet address to determine role.
 */
export function useAdminAuth(): UseAdminAuthReturn {
  const { address, isConnected } = useAppKitAccount();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  const checkAdminStatus = useCallback(async () => {
    if (!isConnected || !address) {
      setIsAdmin(false);
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/users/me?walletAddress=${address}`);
      const data = await res.json();

      setIsAdmin(data.isAdmin === true);
      setUser(data.user || null);
    } catch (error) {
      console.error("Failed to check admin status:", error);
      setIsAdmin(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAdminStatus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkAdminStatus]);

  return {
    isAdmin,
    isLoading,
    isConnected,
    address,
    user,
    refetch: checkAdminStatus,
  };
}
