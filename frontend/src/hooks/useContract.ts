"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { DONATION_ESCROW_ABI } from "@/utils/contract";
import { config } from "@/utils/config";

const contractConfig = {
  address: config.contractAddress as `0x${string}`,
  abi: DONATION_ESCROW_ABI,
} as const;

// ============================================================
//                      READ HOOKS
// ============================================================

/**
 * Get a campaign by its on-chain ID
 */
export function useGetCampaign(campaignId: bigint | undefined) {
  return useReadContract({
    ...contractConfig,
    functionName: "getCampaign",
    args: campaignId !== undefined ? [campaignId] : undefined,
    query: {
      enabled: campaignId !== undefined,
    },
  });
}

/**
 * Get the total number of campaigns
 */
export function useGetCampaignCount() {
  return useReadContract({
    ...contractConfig,
    functionName: "getCampaignCount",
  });
}

// ============================================================
//                      WRITE HOOKS
// ============================================================

/**
 * Create a new campaign on-chain
 */
export function useCreateCampaign() {
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();

  const createCampaign = (beneficiary: string, targetAmountEth: string, deadlineSeconds: number) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "createCampaign",
      args: [beneficiary as `0x${string}`, parseEther(targetAmountEth), BigInt(deadlineSeconds)],
    });
  };

  return {
    createCampaign,
    hash,
    isPending,
    error,
  };
}

/**
 * Donate to a campaign on-chain
 */
export function useDonate() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const donate = (campaignId: bigint, amountEth: string) => {
    writeContract({
      ...contractConfig,
      functionName: "donateToCampaign",
      args: [campaignId],
      value: parseEther(amountEth),
    });
  };

  return {
    donate,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

/**
 * Claim funds from a campaign after the deadline has passed
 */
export function useClaimFunds() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const claimFunds = (campaignId: bigint) => {
    writeContract({
      ...contractConfig,
      functionName: "claimFunds",
      args: [campaignId],
    });
  };

  return {
    claimFunds,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}
