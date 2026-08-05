"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useDonate, useClaimFunds } from "@/hooks/useContract";
import { StatusBadge } from "@/components/campaigns/CampaignCard";
import { AddressDisplay, shortenAddress } from "@/components/ui/AddressDisplay";
import { toast } from "react-toastify";

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
  images: { imageUrl: string }[];
  creator?: { fullName: string | null };
  beneficiaryUser?: { fullName: string | null };
  beneficiaryWallet?: { walletAddress: string };
  donations: Donation[];
  blockchainEvents: BlockchainEvent[];
  _count: { donations: number };
}

// -------------------------------------------------------------------
//  Helpers
// -------------------------------------------------------------------

function formatTokenAmount(wei: string | undefined) {
  if (!wei) return "—";
  return (Number(wei) / 1e18).toFixed(4);
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

  // Record donation on success
  useEffect(() => {
    if (isSuccess && hash && hash !== recordedTxRef.current && address) {
      recordedTxRef.current = hash;
      
      toast.success(
        <div>
          ✅ Donation confirmed!<br />
          <span className="font-mono text-[10px]">Tx: {shortenAddress(hash)}</span>
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
              donationAmount: amount,
              txHash: hash,
            }),
          });

          // 3. Refetch campaign
          fetchCampaign();
        } catch (err) {
          console.error("Failed to record donation in DB:", err);
        }
      };

      recordDonation();
    }
  }, [isSuccess, hash, address, amount, campaignId, fetchCampaign]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast.error(`Transaction failed: ${error.message.slice(0, 100)}`);
    }
  }, [error]);

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
          <span className="font-mono text-[10px]">Tx: {shortenAddress(claimHash)}</span>
        </div>
      );
      const timer = setTimeout(() => fetchCampaign(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isClaimSuccess, claimHash, fetchCampaign]);

  // Handle donate
  const handleDonate = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (campaign?.onChainCampaignId == null) {
      toast.error("This campaign is not yet on-chain.");
      return;
    }
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
            {campaign.images[0] ? (
              <img
                src={campaign.images[0].imageUrl}
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

            {campaign.blockchainEvents.length === 0 && campaign.donations.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                No transactions recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-400">
                      <th className="pb-3 font-medium">Event</th>
                      <th className="pb-3 font-medium">From</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    {campaign.blockchainEvents.map((event) => (
                      <tr key={event.eventId} className="border-b border-slate-50">
                        <td className="py-3">
                          <EventBadge type={event.eventType} />
                        </td>
                        <td className="py-3 text-xs">
                          <AddressDisplay
                            address={event.fromAddress}
                            kind="wallet"
                            className="text-slate-600"
                          />
                        </td>
                        <td className="py-3">
                          {formatTokenAmount(event.valueWei)} USDT
                        </td>
                        <td className="py-3 text-xs text-indigo-500">
                          <AddressDisplay
                            address={event.txHash}
                            kind="transaction"
                          />
                        </td>
                      </tr>
                    ))}
                    {campaign.blockchainEvents.length === 0 &&
                      campaign.donations.map((d) => (
                        <tr key={d.donationId} className="border-b border-slate-50">
                          <td className="py-3">
                            <EventBadge type="DonationReceived" />
                          </td>
                          <td className="py-3 text-xs">
                            <AddressDisplay
                              address={d.donorWallet?.walletAddress}
                              kind="wallet"
                              className="text-slate-600"
                            />
                          </td>
                          <td className="py-3">{Number(d.donationAmount).toFixed(4)} USDT</td>
                          <td className="py-3 text-xs text-indigo-500">
                            <AddressDisplay
                              address={d.txHash}
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
                {campaign.currentAmount.toFixed(4)} USDT
              </p>
              <p className="text-sm text-slate-500 mt-1">
                raised of {Number(campaign.targetAmount).toFixed(2)} USDT goal
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
                <p className="text-lg font-bold text-slate-900">{campaign.blockchainEvents.length}</p>
                <p className="text-xs text-slate-500">Transactions</p>
              </div>
            </div>

            {/* Donate Form */}
            {campaign.campaignStatus === "active" && !isDeadlinePassed && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Donation Amount (USDT)
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
                  disabled={!isConnected || isPending || isConfirming}
                  className="w-full rounded-xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!isConnected
                    ? "Connect Wallet to Donate"
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
                  All funds have been released to the beneficiary.
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

function EventBadge({ type }: { type: string }) {
  const style = eventStyles[type] || "bg-slate-50 text-slate-500";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {type}
    </span>
  );
}
