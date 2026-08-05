"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { StatusBadge } from "@/components/campaigns/CampaignCard";
import Link from "next/link";
import { WalletProfilePanel } from "@/components/dashboard/WalletProfilePanel";
import { AddressDisplay } from "@/components/ui/AddressDisplay";

interface Stats {
  totalDonated: number;
  campaignsDonated: number;
  campaignsReceived: number;
  received?: number;
  fundsReceived?: number;
  activeCampaigns: number;
}

interface StatCardItem {
  label: string;
  value: string | number;
  unit?: string;
  accentClass: string;
}

type UserDashboardTab = "My Donations" | "Beneficiary Campaigns";

interface Donation {
  donationId: string;
  campaignId: string;
  campaignTitle: string;
  amount: number;
  tokenSymbol: string;
  txHash: string;
  date: string;
}

interface BeneficiaryCampaign {
  campaignId: string;
  campaignTitle: string;
  targetAmount: number;
  currentAmount: number;
  tokenSymbol: string;
  status: string;
  createdAt: string;
  deadline: string | null;
  releasedAt?: string | null;
}

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

  return parsedDate.toLocaleDateString("en-GB");
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

export function UserDashboard() {
  const { address, isConnected } = useAppKitAccount();
  const [stats, setStats] = useState<Stats | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [beneficiaryCampaigns, setBeneficiaryCampaigns] = useState<BeneficiaryCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<UserDashboardTab>("My Donations");

  const fetchDashboardData = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoading(true);
    try {
      const userRes = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          chainId: 31337,
        }),
      });

      if (!userRes.ok) {
        throw new Error("Failed to link wallet before loading dashboard data.");
      }

      const res = await fetch(
        `/api/users/me/dashboard?walletAddress=${encodeURIComponent(address)}`
      );
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setDonations(data.donations);
        setBeneficiaryCampaigns(data.beneficiaryCampaigns || []);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDashboardData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchDashboardData]);

  const receivedAmount = stats?.received ?? stats?.fundsReceived ?? 0;
  const statCards = useMemo(
    () => [
      {
        label: "Campaigns Donated",
        value: stats?.campaignsDonated ?? "-",
        accentClass: "bg-slate-400",
      },
      {
        label: "Total Donated",
        value: stats ? formatStatAmount(stats.totalDonated) : "-",
        unit: stats ? "USDT" : undefined,
        accentClass: "bg-sky-400",
      },
      {
        label: "Campaigns Received",
        value: stats?.campaignsReceived ?? "-",
        accentClass: "bg-violet-400",
      },
      {
        label: "Received",
        value: stats ? formatStatAmount(receivedAmount) : "-",
        unit: stats ? "USDT" : undefined,
        accentClass: "bg-indigo-400",
      },
      {
        label: "Active Campaigns",
        value: stats?.activeCampaigns ?? "-",
        accentClass: "bg-emerald-400",
      },
    ] satisfies StatCardItem[],
    [receivedAmount, stats]
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold">
          My <span className="gradient-text">Dashboard</span>
        </h1>
        <p className="mt-2 text-gray-400">
          Track your donations and the campaigns you support or receive support through.
        </p>
      </div>

      <div className="mb-10">
        <WalletProfilePanel heading="My Profile" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-10">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} loading={loading} />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-8">
        {(["My Donations", "Beneficiary Campaigns"] as UserDashboardTab[]).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-indigo-500 text-indigo-500"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          )
        )}
      </div>

      {/* Tables based on active tab */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === "My Donations" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-400 bg-slate-50/50">
                  <th className="px-6 py-4 font-medium">Campaign</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Transaction Hash</th>
                  <th className="px-6 py-4 font-medium">Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {!isConnected ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">🔗</span>
                        <p className="text-sm">Connect your wallet to view your donation history.</p>
                        <div className="mt-2">
                          <appkit-button size="sm" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : donations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">📭</span>
                        <p className="text-sm">You haven&apos;t made any donations yet.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  donations.map((donation) => (
                    <tr key={donation.donationId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/campaigns/${donation.campaignId}`}
                          className="font-medium text-slate-800 transition-colors hover:text-indigo-600"
                        >
                          {donation.campaignTitle}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {donation.amount.toFixed(4)} {donation.tokenSymbol}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        <AddressDisplay
                          address={donation.txHash}
                          kind="transaction"
                        />
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {formatDateTime(donation.date) ?? "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "Beneficiary Campaigns" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-400 bg-slate-50/50">
                  <th className="px-6 py-4 font-medium">Campaign</th>
                  <th className="px-6 py-4 font-medium">Progress</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Created</th>
                  <th className="px-6 py-4 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {!isConnected ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">🔗</span>
                        <p className="text-sm">Connect your wallet to view your beneficiary campaigns.</p>
                        <div className="mt-2">
                          <appkit-button size="sm" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : beneficiaryCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">📭</span>
                        <p className="text-sm">You are not listed as a beneficiary for any campaigns.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  beneficiaryCampaigns.map((campaign) => (
                    <tr key={campaign.campaignId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/campaigns/${campaign.campaignId}`}
                          className="font-medium text-slate-800 transition-colors hover:text-indigo-600"
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
                              {campaign.currentAmount.toFixed(2)} /{" "}
                              {Number(campaign.targetAmount).toFixed(2)}{" "}
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
                          <StatusBadge status={campaign.status} />
                          {campaign.status === "released" && campaign.releasedAt && (
                            <span className="text-[11px] text-slate-400">
                              {formatDateTime(campaign.releasedAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {formatDate(campaign.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {formatDate(campaign.deadline)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
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
          {stat.unit ?? "USDT"}
        </p>
      </div>
    </div>
  );
}
