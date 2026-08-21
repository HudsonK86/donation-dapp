"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "react-toastify";
import { config } from "@/utils/config";

interface WalletProfile {
  fullName: string | null;
  email: string | null;
  profileBio: string | null;
  avatarUrl: string | null;
}

export interface ProfileStat {
  label: string;
  value: string | number;
  helper?: string;
}

interface WalletProfilePanelProps {
  heading?: string;
  stats?: ProfileStat[];
  statsLoading?: boolean;
}

function initialsFor(name: string | null | undefined, address: string | undefined) {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }

  return address ? address.slice(2, 4).toUpperCase() : "U";
}

export function WalletProfilePanel({
  heading = "Profile",
  stats = [],
  statsLoading = false,
}: WalletProfilePanelProps) {
  const { address, isConnected } = useAppKitAccount();
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const displayName = profile?.fullName?.trim() || "Unnamed Supporter";
  const displayEmail = profile?.email?.trim() || "No email added";
  const displayBio = profile?.profileBio?.trim() || "No profile info added yet.";
  const displayAvatarUrl = profile?.avatarUrl || "";

  const displayInitials = useMemo(
    () => initialsFor(profile?.fullName, address),
    [address, profile?.fullName]
  );

  const draftInitials = useMemo(
    () => initialsFor(fullName || profile?.fullName, address),
    [address, fullName, profile?.fullName]
  );

  const resetDraft = useCallback((nextProfile: WalletProfile | null) => {
    setFullName(nextProfile?.fullName || "");
    setEmail(nextProfile?.email || "");
    setProfileBio(nextProfile?.profileBio || "");
    setAvatarUrl(nextProfile?.avatarUrl || "");
  }, []);

  const applyProfile = useCallback(
    (nextProfile: WalletProfile | null) => {
      setProfile(nextProfile);
      resetDraft(nextProfile);
    },
    [resetDraft]
  );

  const ensureWalletUser = useCallback(async () => {
    if (!address) return null;

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: address,
        chainId: config.chainId,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to link wallet to user profile.");
    }

    return res.json();
  }, [address]);

  const fetchProfile = useCallback(async () => {
    if (!isConnected || !address) {
      applyProfile(null);
      return;
    }

    setLoading(true);
    try {
      await ensureWalletUser();

      const res = await fetch(
        `/api/users/me?walletAddress=${encodeURIComponent(address)}`
      );
      if (!res.ok) {
        throw new Error("Failed to load wallet profile.");
      }

      const data = await res.json();
      applyProfile(data.user || null);
    } catch (err) {
      console.error("Failed to load wallet profile:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to load wallet profile."
      );
    } finally {
      setLoading(false);
    }
  }, [address, applyProfile, ensureWalletUser, isConnected]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProfile();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchProfile]);

  const handleEditOpen = () => {
    resetDraft(profile);
    setIsEditing(true);
  };

  const handleEditClose = () => {
    if (saving || uploading) return;
    resetDraft(profile);
    setIsEditing(false);
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Avatar upload failed.");
      }

      const data = await res.json();
      setAvatarUrl(data.url);
      toast.success("Avatar uploaded");
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      toast.error(err instanceof Error ? err.message : "Avatar upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!address) {
      toast.error("Connect wallet before saving profile.");
      return;
    }

    setSaving(true);
    try {
      await ensureWalletUser();

      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          fullName,
          email,
          profileBio,
          avatarUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save profile.");
      }

      applyProfile(data.user || null);
      setIsEditing(false);
      toast.success("Profile saved");
    } catch (err) {
      console.error("Failed to save profile:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const renderAvatar = (
    currentAvatarUrl: string,
    initials: string,
    sizeClass: string
  ) => (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white bg-cover bg-center text-3xl font-bold text-indigo-500 shadow-sm`}
      style={{
        backgroundImage: currentAvatarUrl ? `url(${currentAvatarUrl})` : undefined,
      }}
    >
      {!currentAvatarUrl && initials}
    </div>
  );

  return (
    <>
      <section className="card overflow-hidden">
        {!isConnected ? (
          <div className="px-8 py-8">
            <div className="grid grid-cols-[112px_1fr_auto] items-center gap-6">
              {renderAvatar("", "U", "h-28 w-28")}
              <div>
                <p className="text-sm font-semibold text-indigo-500">{heading}</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Connect wallet to load your profile
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Your public profile will appear here after your wallet is connected.
                </p>
              </div>
              <appkit-button size="sm" />
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 bg-gradient-to-r from-white via-indigo-50/50 to-cyan-50/50 px-8 py-8">
              <div className="grid grid-cols-[132px_1fr_auto] items-center gap-6">
                {loading ? (
                  <div className="h-32 w-32 animate-pulse rounded-xl bg-slate-100" />
                ) : (
                  renderAvatar(displayAvatarUrl, displayInitials, "h-32 w-32")
                )}

                <div>
                  <p className="text-sm font-semibold text-indigo-500">{heading}</p>
                  {loading ? (
                    <div className="mt-3 space-y-3">
                      <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
                      <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
                      <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
                    </div>
                  ) : (
                    <>
                      <h2 className="mt-2 text-3xl font-bold text-slate-900">
                        {displayName}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        {displayEmail}
                      </p>
                      <p style={{ whiteSpace: 'pre-wrap' }} className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
                        {displayBio}
                      </p>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleEditOpen}
                  disabled={loading}
                  className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit Profile
                </button>
              </div>
            </div>

            {stats.length > 0 && (
              <div className="grid grid-cols-5 border-b border-slate-100 bg-white">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border-r border-slate-100 px-6 py-5 last:border-r-0"
                  >
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {statsLoading ? (
                        <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-100" />
                      ) : (
                        stat.value
                      )}
                    </p>
                    {stat.helper && (
                      <p className="mt-1 text-xs text-slate-500">{stat.helper}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-6 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-sm font-semibold text-indigo-500">{heading}</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  Edit Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={handleEditClose}
                disabled={saving || uploading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="grid max-h-[calc(100vh-14rem)] grid-cols-[180px_1fr] gap-8 overflow-y-auto px-6 py-6">
              <div>
                {renderAvatar(avatarUrl, draftInitials, "h-40 w-40")}
                <label className="mt-4 flex w-40 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  {uploading ? "Uploading..." : "Change Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                    disabled={uploading || saving}
                  />
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="mt-2 w-40 rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    disabled={saving}
                  >
                    Remove Photo
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-600">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your display name"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-600">
                    Bio
                  </label>
                  <textarea
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    placeholder="Short profile information for donors and beneficiaries."
                    rows={6}
                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button
                type="button"
                onClick={handleEditClose}
                disabled={saving || uploading}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || uploading || loading}
                className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
