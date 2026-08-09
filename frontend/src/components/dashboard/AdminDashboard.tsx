"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createPublicClient, http, type Hash } from "viem";
import { sepolia } from "viem/chains";
import { StatusBadge } from "@/components/campaigns/CampaignCard";
import { CreateCampaignModal } from "@/components/admin/CreateCampaignModal";
import {
  EditCampaignModal,
  type EditableCampaign,
} from "@/components/admin/EditCampaignModal";
import { WalletProfilePanel } from "@/components/dashboard/WalletProfilePanel";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useCancelCampaign } from "@/hooks/useContract";
import { config } from "@/utils/config";
import { toast } from "react-toastify";
import { formatEthAmount } from "@/utils/format";

// -------------------------------------------------------------------
//  Types
// -------------------------------------------------------------------

interface Stats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalDonations: number;
  fundsReleased: number;
}

interface StatCardItem {
  label: string;
  value: string | number;
  unit?: string;
  accentClass: string;
}

interface Campaign {
  campaignId: string;
  onChainCampaignId: number | null;
  campaignTitle: string;
  campaignDescription: string | null;
  targetAmount: number;
  currentAmount: number;
  campaignStatus: string;
  tokenSymbol: string;
  createdAt: string;
  campaignDeadline: string | null;
  releasedAt?: string | null;
  beneficiaryWallet?: { walletAddress: string };
  imageUrl?: string | null;
  _count: { donations: number };
}

// -------------------------------------------------------------------
//  Helpers
// -------------------------------------------------------------------

function getProgressPercent(currentAmount: number, targetAmount: number) {
  if (targetAmount <= 0) return 0;
  return Math.min((currentAmount / targetAmount) * 100, 100);
}

function formatProgressLabel(currentAmount: number, targetAmount: number) {
  if (targetAmount <= 0) return "0%";
  return `${Math.round((currentAmount / targetAmount) * 100)}%`;
}

function formatDate(date: string | null) {
  if (!date) return "No deadline";

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "No deadline";

  return parsedDate.toLocaleDateString();
}

function formatDateTime(date: string | null | undefined) {
  if (!date) return null;

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatStatAmount(amount: number) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(config.rpcUrl),
});

async function waitForReceipt(txHash: Hash) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Timed out waiting for the local blockchain confirmation."));
    }, 60_000);
  });

  try {
    return await Promise.race([
      publicClient.waitForTransactionReceipt({
        hash: txHash,
        pollingInterval: 500,
      }),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getErrorMessage(err: unknown) {
  if (!(err instanceof Error)) {
    return "Something went wrong.";
  }

  if (
    err.message.includes("User rejected") ||
    err.message.includes("User denied") ||
    err.message.includes("rejected the request")
  ) {
    return "Transaction was cancelled in the wallet.";
  }

  return err.message.slice(0, 180);
}

// -------------------------------------------------------------------
//  Component
// -------------------------------------------------------------------

export function AdminDashboard() {
  const { address } = useAdminAuth();
  const { cancelCampaign, isPending: isCancelPending } = useCancelCampaign();
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [pendingCancelCampaign, setPendingCancelCampaign] =
    useState<Campaign | null>(null);
  const [cancellingCampaignId, setCancellingCampaignId] = useState<string | null>(
    null
  );
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    try {
      const [statsRes, campaignsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch(`/api/admin/campaigns?walletAddress=${encodeURIComponent(address)}`),
      ]);

      const statsData = await statsRes.json();
      const campaignsData = await campaignsRes.json();

      if (!statsRes.ok) {
        throw new Error(statsData?.error || "Failed to fetch admin stats.");
      }

      if (!campaignsRes.ok) {
        throw new Error(campaignsData?.error || "Failed to fetch campaigns.");
      }

      setStats(statsData);
      setCampaigns(campaignsData.campaigns || []);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
      toast.error(getErrorMessage(err), { toastId: "admin-fetch-error" });
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const handleCancelCampaign = useCallback(
    async (campaign: Campaign) => {
      if (campaign.campaignStatus !== "active") {
        toast.error("Only active campaigns can be cancelled.");
        return;
      }

      if (campaign._count.donations > 0) {
        toast.error("Campaigns with donations cannot be cancelled.");
        return;
      }

      if (campaign.onChainCampaignId == null) {
        toast.error("This campaign is not linked to an on-chain campaign.");
        return;
      }

      setPendingCancelCampaign(null);
      setCancellingCampaignId(campaign.campaignId);
      let toastId: ReturnType<typeof toast.loading> | null = null;

      try {
        const preflightRes = await fetch(
          `/api/campaigns/${campaign.campaignId}/cancel`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preflightOnly: true }),
          }
        );
        const preflightData = await preflightRes.json().catch(() => null);

        if (!preflightRes.ok) {
          throw new Error(preflightData?.error || "Campaign cannot be cancelled.");
        }

        const txHash = await cancelCampaign(BigInt(campaign.onChainCampaignId));
        toastId = toast.loading(
          "Transaction submitted. Waiting for local chain confirmation...",
          { toastId: `cancel-campaign-${campaign.campaignId}` }
        );

        const receipt = await waitForReceipt(txHash);
        if (receipt.status !== "success") {
          throw new Error("The campaign cancel transaction was reverted.");
        }

        toast.update(toastId, {
          render: "On-chain campaign cancelled. Updating database record...",
          type: "info",
          isLoading: true,
          autoClose: false,
        });

        const res = await fetch(`/api/campaigns/${campaign.campaignId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelTxHash: txHash }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Failed to cancel campaign.");
        }

        toast.update(toastId, {
          render: "Campaign cancelled successfully.",
          type: "success",
          isLoading: false,
          autoClose: 3500,
          closeOnClick: true,
        });

        await fetchData();
      } catch (err) {
        console.error("Failed to cancel campaign:", err);
        const message = getErrorMessage(err);

        if (toastId) {
          toast.update(toastId, {
            render: message,
            type: "error",
            isLoading: false,
            autoClose: 3500,
            closeOnClick: true,
          });
        } else {
          toast.error(message, { toastId: "cancel-campaign-error" });
        }
      } finally {
        setCancellingCampaignId(null);
      }
    },
    [cancelCampaign, fetchData]
  );

  const statCards = [
    {
      label: "Total Campaigns",
      value: stats?.totalCampaigns ?? "—",
      accentClass: "bg-slate-400",
    },
    {
      label: "Active Campaigns",
      value: stats?.activeCampaigns ?? "—",
      accentClass: "bg-emerald-400",
    },
    {
      label: "Total Donations",
      value: stats ? formatStatAmount(stats.totalDonations) : "—",
      unit: stats ? "ETH" : undefined,
      accentClass: "bg-sky-400",
    },
    {
      label: "Funds Released",
      value: stats ? formatStatAmount(stats.fundsReleased) : "—",
      unit: stats ? "ETH" : undefined,
      accentClass: "bg-indigo-400",
    },
  ] satisfies StatCardItem[];

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold">
          Admin <span className="gradient-text">Dashboard</span>
        </h1>
        <p className="mt-2 text-gray-400">
          Manage campaigns and view platform statistics.
        </p>
      </div>

      <div className="mb-10">
        <WalletProfilePanel heading="Admin Profile" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} loading={loading} />
        ))}
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold text-slate-900">Campaign Management</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 transition-all duration-200"
        >
          + Create Campaign
        </button>
      </div>

      {/* Campaigns Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400 bg-slate-50/50">
                <th className="px-6 py-4 font-medium">Campaign</th>
                <th className="px-6 py-4 font-medium">Progress</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium">Deadline</th>
                <th className="px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Loading skeleton rows
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-4xl">📋</span>
                      <p className="text-sm">
                        No campaigns yet. Create your first campaign to get started.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => (
                  <tr
                    key={campaign.campaignId}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/campaigns/${campaign.campaignId}`}
                        className="font-medium text-slate-800 hover:text-indigo-600 transition-colors"
                      >
                        {campaign.campaignTitle}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="min-w-36">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-slate-700">
                            {formatProgressLabel(
                              campaign.currentAmount,
                              Number(campaign.targetAmount)
                            )}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatEthAmount(campaign.currentAmount)} /{" "}
                            {formatEthAmount(Number(campaign.targetAmount))}{" "}
                            {campaign.tokenSymbol}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${getProgressPercent(
                                campaign.currentAmount,
                                Number(campaign.targetAmount)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={campaign.campaignStatus} />
                        {campaign.campaignStatus === "released" && campaign.releasedAt && (
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(campaign.releasedAt)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {formatDate(campaign.campaignDeadline)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingCampaign(campaign)}
                          disabled={campaign.campaignStatus !== "active"}
                          className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-indigo-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-300"
                        >
                          Edit
                        </button>
                        <span className="text-slate-200">|</span>
                        <button
                          type="button"
                          onClick={() => setPendingCancelCampaign(campaign)}
                          disabled={
                            campaign.campaignStatus !== "active" ||
                            campaign._count.donations > 0 ||
                            cancellingCampaignId === campaign.campaignId ||
                            isCancelPending
                          }
                          title={
                            campaign._count.donations > 0
                              ? "Campaigns with donations cannot be cancelled"
                              : undefined
                          }
                          className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-300"
                        >
                          {cancellingCampaignId === campaign.campaignId
                            ? "Cancelling..."
                            : "Cancel"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => fetchData()}
      />

      <EditCampaignModal
        isOpen={Boolean(editingCampaign)}
        campaign={editingCampaign as EditableCampaign | null}
        onClose={() => setEditingCampaign(null)}
        onSuccess={() => {
          setEditingCampaign(null);
          void fetchData();
        }}
      />

      <CancelCampaignConfirmModal
        campaign={pendingCancelCampaign}
        isBusy={
          Boolean(
            pendingCancelCampaign &&
              cancellingCampaignId === pendingCancelCampaign.campaignId
          ) || isCancelPending
        }
        onClose={() => setPendingCancelCampaign(null)}
        onConfirm={() => {
          if (pendingCancelCampaign) {
            void handleCancelCampaign(pendingCancelCampaign);
          }
        }}
      />
    </div>
  );
}

function CancelCampaignConfirmModal({
  campaign,
  isBusy,
  onClose,
  onConfirm,
}: {
  campaign: Campaign | null;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!campaign) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        disabled={isBusy}
        aria-label="Close cancel confirmation"
      />

      <div className="relative mx-4 w-full max-w-md animate-fade-in rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-red-500">
            Cancel Campaign
          </p>
          <h2 className="text-2xl font-bold text-slate-900">
            Cancel this campaign?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This campaign has no donations. It will be hidden from the public
            campaigns page and kept in the admin dashboard as cancelled.
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
            Campaign
          </p>
          <p className="mt-1 font-semibold text-slate-900">
            {campaign.campaignTitle}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
            <div>
              <p className="font-medium text-slate-400">Target</p>
              <p className="mt-1 text-slate-700">
                {formatEthAmount(campaign.targetAmount)} {campaign.tokenSymbol}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-400">Deadline</p>
              <p className="mt-1 text-slate-700">
                {formatDate(campaign.campaignDeadline)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep Campaign
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? "Cancelling..." : "Cancel Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  stat,
  loading,
}: {
  stat: StatCardItem;
  loading: boolean;
}) {
  return (
    <div className="card min-h-[132px] p-5">
      <div className="flex h-10 items-start justify-between gap-3">
        <p className="max-w-[10rem] text-xs font-semibold uppercase leading-5 tracking-[0.08em] text-slate-400">
          {stat.label}
        </p>
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${stat.accentClass}`} />
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex h-9 items-end">
            <div className="h-8 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        ) : (
          <div className="flex h-9 items-end">
            <p className="whitespace-nowrap text-3xl font-bold tabular-nums leading-none text-slate-900">
              {stat.value}
            </p>
          </div>
        )}
        <p className={`mt-2 h-4 text-xs font-semibold uppercase leading-4 tracking-[0.08em] text-slate-400 ${stat.unit ? "" : "invisible"}`}>
          {stat.unit ?? "ETH"}
        </p>
      </div>
    </div>
  );
}
