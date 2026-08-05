"use client";

import { useState, useEffect, useCallback } from "react";
import { CampaignCard } from "@/components/campaigns/CampaignCard";

interface Campaign {
  campaignId: string;
  campaignTitle: string;
  campaignDescription?: string;
  targetAmount: number;
  currentAmount: number;
  tokenSymbol: string;
  campaignStatus: string;
  images: { imageUrl: string }[];
  _count: { donations: number };
}

interface CampaignsResponse {
  campaigns: Campaign[];
  total: number;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (search) params.set("search", search);

      const res = await fetch(`/api/campaigns?${params.toString()}`);
      const data: CampaignsResponse = await res.json();
      setCampaigns(data.campaigns);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCampaigns();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchCampaigns]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900">
          Active <span className="gradient-text">Campaigns</span>
        </h1>
        <p className="mt-2 text-slate-500">
          Browse donation campaigns and contribute to causes you care about.
        </p>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none w-64"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 outline-none shadow-sm cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="released">Released</option>
        </select>

        <span className="ml-auto text-sm text-slate-400">
          {total} campaign{total !== 1 ? "s" : ""} found
        </span>
      </div>

      {/* Campaign Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="card overflow-hidden animate-fade-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="h-48 bg-slate-100 shimmer" />
              <div className="p-6">
                <div className="h-5 bg-slate-100 rounded w-3/4 mb-3" />
                <div className="space-y-2 mb-4">
                  <div className="h-3 bg-slate-50 rounded w-full" />
                  <div className="h-3 bg-slate-50 rounded w-5/6" />
                </div>
                <div className="mb-4">
                  <div className="h-2 bg-slate-100 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-6 bg-slate-100 rounded-full w-16" />
                  <div className="h-4 bg-slate-50 rounded w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-6xl mb-4">📭</div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">
            No campaigns found
          </h3>
          <p className="text-slate-500">
            {search
              ? "Try adjusting your search or filters."
              : "No campaigns have been created yet. Check back soon!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((campaign, index) => (
            <div
              key={campaign.campaignId}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <CampaignCard
                campaignId={campaign.campaignId}
                title={campaign.campaignTitle}
                description={campaign.campaignDescription}
                imageUrl={campaign.images[0]?.imageUrl}
                targetAmount={Number(campaign.targetAmount)}
                currentAmount={campaign.currentAmount}
                status={campaign.campaignStatus}
                donationCount={campaign._count.donations}
                tokenSymbol={campaign.tokenSymbol}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
