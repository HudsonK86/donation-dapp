"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { parseEther } from "viem";
import { useDonate, useClaimFunds, useGetCampaign } from "@/hooks/useContract";
import { StatusBadge } from "@/components/campaigns/CampaignCard";
import { AddressDisplay, shortenAddress } from "@/components/ui/AddressDisplay";
import { toast } from "react-toastify";
import { formatEthAmount, formatWei } from "@/utils/format";

// -------------------------------------------------------------------
//  Types
// -------------------------------------------------------------------

interface Donation {
  donationId: string;
  donationAmount: number;
  txHash: string;
  donatedAt: string;
  donorWallet?: { walletAddress: string };
  donorUser?: { fullName: string | null };
}

interface BlockchainEvent {
  eventId: string;
  eventType: string;
  fromAddress: string;
  toAddress?: string;
  valueWei?: string;
  txHash: string;
  blockNumber: string;
  blockTimestamp?: string;
}

interface Campaign {
  campaignId: string;
  onChainCampaignId: number | null;
  campaignTitle: string;
  campaignDescription?: string;
  targetAmount: number;
  currentAmount: number;
  tokenSymbol: string;
  campaignStatus: string;
  campaignDeadline?: string | null;
  createTxHash?: string;
  createdAt: string;
  imageUrl?: string | null;
  creator?: { fullName: string | null };
  beneficiaryWallet?: { walletAddress: string };
  donations: Donation[];
  blockchainEvents: BlockchainEvent[];
  _count: { donations: number };
}

interface TransactionRow {
  id: string;
  eventType: string;
  fromAddress?: string;
  amountText: string;
  txHash: string;
  dateText: string;
  sortTime: number;
}

// -------------------------------------------------------------------
//  Helpers
// -------------------------------------------------------------------

function formatTokenAmount(wei: string | undefined) {
  if (!wei) return "—";
  return formatWei(wei);
}

function formatDisplayDate(value: string | undefined) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getContractField<T>(value: unknown, field: string, tupleIndex: number) {
  if (Array.isArray(value)) {
    return value[tupleIndex] as T | undefined;
  }

  if (value && typeof value === "object" && field in value) {
    return (value as Record<string, unknown>)[field] as T | undefined;
  }

  return undefined;
}

function buildTransactionRows(campaign: Campaign): TransactionRow[] {
  const indexedDonationHashes = new Set(
    campaign.blockchainEvents
      .filter((event) => event.eventType === "DonationReceived")
      .map((event) => event.txHash.toLowerCase())
  );

  const eventRows = campaign.blockchainEvents.map((event) => ({
    id: `event-${event.eventId}`,
    eventType: event.eventType,
    fromAddress: event.fromAddress,
    amountText: `${formatTokenAmount(event.valueWei)} ETH`,
    txHash: event.txHash,
    dateText: formatDisplayDate(event.blockTimestamp),
    sortTime: event.blockTimestamp
      ? new Date(event.blockTimestamp).getTime()
      : 0,
  }));

  const donationRows = campaign.donations
    .filter((donation) => !indexedDonationHashes.has(donation.txHash.toLowerCase()))
    .map((donation) => ({
      id: `donation-${donation.donationId}`,
      eventType: "DonationReceived",
      fromAddress: donation.donorWallet?.walletAddress,
      amountText: `${formatEthAmount(Number(donation.donationAmount))} ETH`,
      txHash: donation.txHash,
      dateText: formatDisplayDate(donation.donatedAt),
      sortTime: new Date(donation.donatedAt).getTime(),
    }));

  return [...eventRows, ...donationRows].sort((a, b) => b.sortTime - a.sortTime);
}

// -------------------------------------------------------------------
//  Page Component
// -------------------------------------------------------------------

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const { address, isConnected } = useAppKitAccount();
  const { donate, hash, isPending, isConfirming, isSuccess, error } = useDonate();
  const { claimFunds, hash: claimHash, isPending: isClaimPending, isConfirming: isClaimConfirming, isSuccess: isClaimSuccess, error: claimError } = useClaimFunds();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const recordedTxRef = useRef<string | null>(null);
  const recordedClaimTxRef = useRef<string | null>(null);
  const refreshTimersRef = useRef<number[]>([]);
  const campaignOnChainId = campaign?.onChainCampaignId != null
    ? BigInt(campaign.onChainCampaignId)
    : undefined;
  const {
    data: onChainCampaign,
    isLoading: isOnChainLoading,
    isError: isOnChainError,
  } = useGetCampaign(campaignOnChainId);

  // Fetch campaign data
  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error("Campaign not found");
      const data = await res.json();
      setCampaign(data.campaign);
    } catch (err) {
      console.error("Failed to fetch campaign:", err);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCampaign();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchCampaign]);

  const refetchCampaignNowAndSoon = useCallback(() => {
    refreshTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    refreshTimersRef.current = [];

    void fetchCampaign();

    for (const delay of [1000, 2500, 5000]) {
      const timer = window.setTimeout(() => {
        void fetchCampaign();
      }, delay);
      refreshTimersRef.current.push(timer);
    }
  }, [fetchCampaign]);

  useEffect(() => {
    return () => {
      refreshTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  // Record donation on success
  useEffect(() => {
    if (isSuccess && hash && hash !== recordedTxRef.current && address) {
      recordedTxRef.current = hash;
      const submittedAmount = amount;
      
      toast.success(
        <div>
          ✅ Donation confirmed!<br />
          <span className="font-mono text-[10px]">Transaction: {shortenAddress(hash)}</span>
        </div>
      );

      const recordDonation = async () => {
        try {
          // 1. Ensure user exists
          const userRes = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress: address }),
          });
          const userData = await userRes.json();

          if (!userRes.ok) throw new Error(userData.error || "Failed to fetch user");

          // 2. Record donation
          await fetch("/api/donations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaignId,
              donorUserId: userData.user.userId,
              donorWalletId: userData.wallet.walletId,
              donationAmount: submittedAmount,
              txHash: hash,
            }),
          });

          setAmount("");
          refetchCampaignNowAndSoon();
        } catch (err) {
          console.error("Failed to record donation in DB:", err);
          setAmount("");
          refetchCampaignNowAndSoon();
        }
      };

      recordDonation();
    }
  }, [isSuccess, hash, address, amount, campaignId, refetchCampaignNowAndSoon]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast.error(`Transaction failed: ${error.message.slice(0, 100)}`);
      window.setTimeout(() => {
        setAmount("");
        refetchCampaignNowAndSoon();
      }, 0);
    }
  }, [error, refetchCampaignNowAndSoon]);

  useEffect(() => {
    if (claimError) {
      toast.error(`Claim failed: ${claimError.message.slice(0, 100)}`);
    }
  }, [claimError]);

  // Refetch after successful claim
  useEffect(() => {
    if (isClaimSuccess && claimHash && claimHash !== recordedClaimTxRef.current) {
      recordedClaimTxRef.current = claimHash;
      toast.success(
        <div>
          ✅ Claim transaction confirmed!<br />
          <span className="font-mono text-[10px]">Transaction: {shortenAddress(claimHash)}</span>
        </div>
      );
      const timer = setTimeout(() => fetchCampaign(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isClaimSuccess, claimHash, fetchCampaign]);

  const onChainTargetAmount = getContractField<bigint>(
    onChainCampaign,
    "targetAmount",
    3
  );
  const onChainBeneficiary = getContractField<string>(
    onChainCampaign,
    "beneficiary",
    2
  );
  const onChainIsActive = getContractField<boolean>(
    onChainCampaign,
    "isActive",
    6
  );
  const onChainIsReleased = getContractField<boolean>(
    onChainCampaign,
    "isReleased",
    7
  );
  const expectedTargetAmount = campaign
    ? parseEther(String(campaign.targetAmount))
    : undefined;
  const expectedBeneficiary = campaign?.beneficiaryWallet?.walletAddress?.toLowerCase();
  const isOnChainDifferent =
    !!onChainCampaign &&
    ((expectedTargetAmount !== undefined &&
      onChainTargetAmount !== undefined &&
      onChainTargetAmount !== expectedTargetAmount) ||
      (!!expectedBeneficiary &&
        !!onChainBeneficiary &&
        onChainBeneficiary.toLowerCase() !== expectedBeneficiary));
  const onChainAvailabilityMessage =
    campaign?.onChainCampaignId == null
      ? "This campaign is not yet on-chain."
      : isOnChainLoading
        ? "Checking current smart contract campaign..."
        : isOnChainError || isOnChainDifferent
          ? "This database campaign is no longer linked to the current Sepolia contract. Go back to Campaigns and open the newly created campaign."
          : onChainIsReleased
            ? "Funds have already been released on chain."
            : onChainIsActive === false
              ? "This campaign is not active on chain."
              : null;

  // Handle donate
  const handleDonate = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (onChainAvailabilityMessage) {
      toast.error(onChainAvailabilityMessage);
      return;
    }
    if (campaign?.onChainCampaignId == null) return;
    donate(BigInt(campaign.onChainCampaignId), amount);
  };

  // Handle claim
  const handleClaim = () => {
    if (campaign?.onChainCampaignId != null) {
      claimFunds(BigInt(campaign.onChainCampaignId));
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-slate-100 rounded w-40" />
          <div className="h-72 bg-slate-100 rounded-2xl" />
          <div className="h-40 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Not found
  if (!campaign) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Campaign Not Found</h2>
        <p className="text-slate-500 mb-6">This campaign may have been removed or doesn&apos;t exist.</p>
        <Link href="/campaigns" className="text-indigo-600 hover:underline text-sm">
          ← Back to Campaigns
        </Link>
      </div>
    );
  }

  const progress = Number(campaign.targetAmount) > 0
    ? (campaign.currentAmount / Number(campaign.targetAmount)) * 100
    : 0;
  const clampedProgress = Math.min(progress, 100);

  const isDeadlinePassed = campaign.campaignDeadline
    ? new Date() > new Date(campaign.campaignDeadline)
    : false;
  const transactionRows = buildTransactionRows(campaign);
  const releasedDateText = transactionRows.find(
    (transaction) => transaction.eventType === "FundsReleased"
  )?.dateText;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Back button */}
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-8"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Campaigns
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Campaign Image */}
          <div className="card overflow-hidden">
            {campaign.imageUrl ? (
              <img
                src={campaign.imageUrl}
                alt={campaign.campaignTitle}
                className="w-full h-72 object-cover"
              />
            ) : (
              <div className="h-72 bg-gradient-to-br from-indigo-50 to-cyan-50 flex items-center justify-center">
                <span className="text-6xl">🎯</span>
              </div>
            )}
          </div>

          {/* Campaign Info */}
          <div className="card p-8">
            <div className="flex items-center gap-3 mb-4">
              <StatusBadge status={campaign.campaignStatus} />
              {campaign.onChainCampaignId != null && (
                <span className="text-xs text-slate-400">
                  On-Chain #{campaign.onChainCampaignId}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-4">
              {campaign.campaignTitle}
            </h1>

            {campaign.campaignDescription && (
              <p className="text-slate-500 leading-relaxed mb-6">
                {campaign.campaignDescription}
              </p>
            )}

            {/* Campaign Details Grid */}
            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-400 mb-1">Created By</p>
                <p className="text-sm font-medium text-slate-700">
                  {campaign.creator?.fullName || "Admin"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Beneficiary</p>
                <AddressDisplay
                  address={campaign.beneficiaryWallet?.walletAddress}
                  kind="wallet"
                  className="text-sm text-slate-600"
                />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Created</p>
                <p className="text-sm text-slate-700">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Deadline</p>
                <p className="text-sm text-slate-700">
                  {campaign.campaignDeadline ? new Date(campaign.campaignDeadline).toLocaleDateString() : "No deadline"}
                </p>
              </div>
            </div>
          </div>

          {/* Transaction History */}
          <div className="card p-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Transaction History</h2>

            {transactionRows.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                No transactions recorded yet.
              </p>
            ) : (
              <div className="max-h-[530px] overflow-auto pr-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-100 text-left text-slate-400">
                      <th className="pb-3 font-medium">Event</th>
                      <th className="pb-3 font-medium">From</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Transaction Hash</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    {transactionRows.map((transaction) => (
                      <tr key={transaction.id} className="border-b border-slate-50">
                        <td className="py-3">
                          <EventBadge type={transaction.eventType} />
                          <p className="mt-1 text-[11px] text-slate-400">
                            {transaction.dateText}
                          </p>
                        </td>
                        <td className="py-3 text-xs">
                          <AddressDisplay
                            address={transaction.fromAddress}
                            kind="wallet"
                            className="text-slate-600"
                          />
                        </td>
                        <td className="py-3">
                          {transaction.amountText}
                        </td>
                        <td className="py-3 text-xs text-indigo-500">
                          <AddressDisplay
                            address={transaction.txHash}
                            kind="transaction"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — Donation Panel */}
        <div className="space-y-6">
          <div className="card p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Donation Progress</h2>

            {/* Amount Display */}
            <div className="text-center mb-6">
              <p className="text-3xl font-bold gradient-text">
                {formatEthAmount(campaign.currentAmount)} ETH
              </p>
              <p className="text-sm text-slate-500 mt-1">
                raised of {formatEthAmount(Number(campaign.targetAmount))} ETH goal
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full gradient-primary rounded-full transition-all duration-700"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
              <p className="text-right text-xs text-slate-400 mt-1">
                {clampedProgress.toFixed(0)}%
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{campaign._count.donations}</p>
                <p className="text-xs text-slate-500">Donations</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{transactionRows.length}</p>
                <p className="text-xs text-slate-500">Transactions</p>
              </div>
            </div>

            {/* Donate Form */}
            {campaign.campaignStatus === "active" && !isDeadlinePassed && (
              <div className="space-y-4">
                {onChainAvailabilityMessage && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
                    {onChainAvailabilityMessage}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Donation Amount (ETH)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>

                {/* Error and success messages handled via toast */}

                <button
                  onClick={handleDonate}
                  disabled={
                    !isConnected ||
                    isPending ||
                    isConfirming ||
                    Boolean(onChainAvailabilityMessage)
                  }
                  className="w-full rounded-xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!isConnected
                    ? "Connect Wallet to Donate"
                    : onChainAvailabilityMessage
                    ? "Campaign Unavailable"
                    : isPending
                    ? "Confirm in Wallet..."
                    : isConfirming
                    ? "Confirming on Chain..."
                    : "Donate Now"}
                </button>

                <p className="text-xs text-slate-400 text-center">
                  Funds are held in smart contract escrow until the target is reached.
                </p>
              </div>
            )}

            {/* Claim Funds Form */}
            {campaign.campaignStatus === "active" && isDeadlinePassed && (
              <div className="space-y-4">
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-4 text-center">
                  <p className="text-sm font-medium text-orange-700">⏳ Deadline Passed</p>
                  <p className="text-xs text-orange-600 mt-1">
                    This campaign has ended. Funds can now be claimed.
                  </p>
                </div>
                {/* Error and success messages handled via toast */}

                <button
                  onClick={handleClaim}
                  disabled={!isConnected || isClaimPending || isClaimConfirming}
                  className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 hover:bg-orange-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!isConnected
                    ? "Connect Wallet to Claim"
                    : isClaimPending
                    ? "Confirm in Wallet..."
                    : isClaimConfirming
                    ? "Confirming on Chain..."
                    : "Claim Funds"}
                </button>
              </div>
            )}

            {campaign.campaignStatus === "released" && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 text-center">
                <p className="text-sm font-medium text-indigo-700">✅ Funds Released</p>
                <p className="text-xs text-indigo-600 mt-1">
                  All funds have been released to the beneficiary
                  {releasedDateText ? ` on ${releasedDateText}.` : "."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
//  Event Badge Component
// -------------------------------------------------------------------

const eventStyles: Record<string, string> = {
  CampaignCreated: "bg-blue-50 text-blue-600",
  DonationReceived: "bg-emerald-50 text-emerald-600",
  FundsReleased: "bg-indigo-50 text-indigo-600",
};

const eventLabels: Record<string, string> = {
  CampaignCreated: "Campaign Created",
  DonationReceived: "Donation Received",
  FundsReleased: "Funds Released",
};

function EventBadge({ type }: { type: string }) {
  const style = eventStyles[type] || "bg-slate-50 text-slate-500";
  const label = eventLabels[type] || type;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
