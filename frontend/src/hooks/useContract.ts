"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { DONATION_ESCROW_ABI } from "@/utils/contract";
import { config } from "@/utils/config";

const contractConfig = {
  address: config.contractAddress as `0x${string}`,
  abi: DONATION_ESCROW_ABI,
} as const;

const CREATE_CAMPAIGN_GAS = BigInt(500_000);
const DONATE_GAS = BigInt(200_000);
const CLAIM_FUNDS_GAS = BigInt(200_000);
const UPDATE_CAMPAIGN_TERMS_GAS = BigInt(300_000);
const CANCEL_CAMPAIGN_GAS = BigInt(200_000);

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
      gas: CREATE_CAMPAIGN_GAS,
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
      gas: DONATE_GAS,
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
      gas: CLAIM_FUNDS_GAS,
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

/**
 * Update a campaign's on-chain terms before any donation is received
 */
export function useUpdateCampaignTerms() {
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();

  const updateCampaignTerms = (
    campaignId: bigint,
    beneficiary: string,
    targetAmountEth: string,
    deadlineSeconds: number
  ) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "updateCampaignTerms",
      args: [
        campaignId,
        beneficiary as `0x${string}`,
        parseEther(targetAmountEth),
        BigInt(deadlineSeconds),
      ],
      gas: UPDATE_CAMPAIGN_TERMS_GAS,
    });
  };

  return {
    updateCampaignTerms,
    hash,
    isPending,
    error,
  };
}

/**
 * Cancel a campaign before any donation is received
 */
export function useCancelCampaign() {
  const { data: hash, writeContractAsync, isPending, error } = useWriteContract();

  const cancelCampaign = (campaignId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "cancelCampaign",
      args: [campaignId],
      gas: CANCEL_CAMPAIGN_GAS,
    });
  };

  return {
    cancelCampaign,
    hash,
    isPending,
    error,
  };
}
