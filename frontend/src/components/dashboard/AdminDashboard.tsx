"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/campaigns/CampaignCard";
import { CreateCampaignModal } from "@/components/admin/CreateCampaignModal";
import { WalletProfilePanel } from "@/components/dashboard/WalletProfilePanel";
import { AddressDisplay } from "@/components/ui/AddressDisplay";

// -------------------------------------------------------------------
//  Types
// -------------------------------------------------------------------

interface Stats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalDonations: number;
  fundsReleased: number;
}

interface Campaign {
  campaignId: string;
  campaignTitle: string;
  targetAmount: number;
  currentAmount: number;
  campaignStatus: string;
  tokenSymbol: string;
  createdAt: string;
  campaignDeadline: string | null;
  beneficiaryWallet?: { walletAddress: string };
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

// -------------------------------------------------------------------
//  Component
// -------------------------------------------------------------------

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, campaignsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/campaigns"),
      ]);

      const statsData = await statsRes.json();
      const campaignsData = await campaignsRes.json();

      setStats(statsData);
      setCampaigns(campaignsData.campaigns || []);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const statCards = [
    { label: "Total Campaigns", value: stats?.totalCampaigns ?? "—", icon: "📋" },
    { label: "Active Campaigns", value: stats?.activeCampaigns ?? "—", icon: "🟢" },
    {
      label: "Total Donations",
      value: stats ? `${stats.totalDonations.toFixed(4)} USDT` : "—",
      icon: "💰",
    },
    {
      label: "Funds Released",
      value: stats ? `${stats.fundsReleased.toFixed(4)} USDT` : "—",
      icon: "✅",
    },
  ];

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
          <div
            key={stat.label}
            className="card p-5"
          >
            <span className="text-2xl">{stat.icon}</span>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {loading ? (
                <span className="inline-block h-7 w-20 bg-slate-100 rounded animate-pulse" />
              ) : (
                stat.value
              )}
            </p>
            <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
          </div>
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
                <th className="px-6 py-4 font-medium">Beneficiary</th>
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
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                      <StatusBadge status={campaign.campaignStatus} />
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      <AddressDisplay
                        address={campaign.beneficiaryWallet?.walletAddress}
                        kind="wallet"
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {formatDate(campaign.campaignDeadline)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/campaigns/${campaign.campaignId}`}
                        className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                      >
                        View →
                      </Link>
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
    </div>
  );
}
