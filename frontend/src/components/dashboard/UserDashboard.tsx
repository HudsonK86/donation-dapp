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

type UserDashboardTab = "My Donations" | "Beneficiary Campaigns";

interface Donation {
  donationId: string;
  campaignTitle: string;
  amount: number;
  tokenSymbol: string;
  status: string;
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
  deadline: string | null;
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
        icon: "📋",
      },
      {
        label: "Total Donated",
        value: stats ? `${stats.totalDonated.toFixed(4)} USDT` : "-",
        icon: "💰",
      },
      {
        label: "Campaigns Received",
        value: stats?.campaignsReceived ?? "-",
        icon: "🤝",
      },
      {
        label: "Received",
        value: stats ? `${receivedAmount.toFixed(4)} USDT` : "-",
        icon: "✅",
      },
      {
        label: "Active Campaigns",
        value: stats?.activeCampaigns ?? "-",
        icon: "🟢",
      },
    ],
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
          <div key={stat.label} className="card p-5">
            <span className="text-2xl">{stat.icon}</span>
            <p className="mt-2 text-2xl font-bold leading-tight text-slate-900">
              {loading ? (
                <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-100" />
              ) : (
                stat.value
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
          </div>
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
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Tx Hash</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {!isConnected ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
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
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : donations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">📭</span>
                        <p className="text-sm">You haven&apos;t made any donations yet.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  donations.map((donation) => (
                    <tr key={donation.donationId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {donation.campaignTitle}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {donation.amount.toFixed(4)} {donation.tokenSymbol}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={donation.status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        <AddressDisplay
                          address={donation.txHash}
                          kind="transaction"
                        />
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {new Date(donation.date).toLocaleDateString()}
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
                  <th className="px-6 py-4 font-medium">Target</th>
                  <th className="px-6 py-4 font-medium">Raised</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Deadline</th>
                  <th className="px-6 py-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {!isConnected ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
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
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : beneficiaryCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">📭</span>
                        <p className="text-sm">You are not listed as a beneficiary for any campaigns.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  beneficiaryCampaigns.map((campaign) => (
                    <tr key={campaign.campaignId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {campaign.campaignTitle}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {campaign.targetAmount.toFixed(4)} {campaign.tokenSymbol}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {campaign.currentAmount.toFixed(4)} {campaign.tokenSymbol}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {campaign.deadline ? new Date(campaign.deadline).toLocaleDateString() : "No Deadline"}
                      </td>
                      <td className="px-6 py-4">
                        <Link 
                          href={`/campaigns/${campaign.campaignId}`}
                          className="text-indigo-500 hover:text-indigo-600 font-medium text-xs bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                        >
                          View Campaign
                        </Link>
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
