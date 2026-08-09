"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "react-toastify";
import { formatEthAmount } from "@/utils/format";
import { getExplorerTxUrl } from "@/lib/contracts";

interface ProfileResponse {
  user: {
    fullName: string | null;
    email: string | null;
    profileBio: string | null;
    avatarUrl: string | null;
    role: string;
  } | null;
  isAdmin?: boolean;
}

interface ProfileStats {
  totalDonated: number;
  campaignsDonated: number;
  campaignsReceived: number;
  received?: number;
  fundsReceived?: number;
  activeCampaigns: number;
}

interface DashboardResponse {
  stats?: ProfileStats;
}

interface AddressDisplayProps {
  address?: string | null;
  kind?: "wallet" | "transaction";
  className?: string;
}

interface AddressProfileContextValue {
  openWalletProfile: (address: string) => void;
}

const AddressProfileContext = createContext<AddressProfileContextValue | null>(null);

export function shortenAddress(address?: string | null) {
  if (!address) return "-";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getInitials(name: string, address: string) {
  const cleanedName = name.trim();
  if (!cleanedName || cleanedName === "Unnamed Supporter") {
    return address.slice(2, 4).toUpperCase();
  }

  return cleanedName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function AddressProfileProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [profileAddress, setProfileAddress] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const openWalletProfile = useCallback((address: string) => {
    const normalizedAddress = address.trim();
    if (!normalizedAddress) return;

    setProfileAddress((currentAddress) =>
      currentAddress.toLowerCase() === normalizedAddress.toLowerCase()
        ? currentAddress
        : normalizedAddress
    );
  }, []);

  const closeProfile = useCallback(() => {
    setProfileAddress("");
    setProfile(null);
    setStats(null);
    setLoadingProfile(false);
  }, []);

  const handleModalCopy = useCallback(async () => {
    if (!profileAddress) return;

    try {
      await copyText(profileAddress);
      toast.success("Wallet address copied.");
    } catch {
      toast.error("Could not copy. Please try again.");
    }
  }, [profileAddress]);

  useEffect(() => {
    if (!profileAddress) {
      return;
    }

    let isCurrentRequest = true;

    async function loadProfile() {
      setLoadingProfile(true);
      setProfile(null);
      setStats(null);

      try {
        const encodedAddress = encodeURIComponent(profileAddress);
        const [profileRes, dashboardRes] = await Promise.all([
          fetch(`/api/users/me?walletAddress=${encodedAddress}`),
          fetch(`/api/users/me/dashboard?walletAddress=${encodedAddress}`),
        ]);

        if (!isCurrentRequest) return;

        if (profileRes.ok) {
          setProfile(await profileRes.json());
        }

        if (dashboardRes.ok) {
          const data: DashboardResponse = await dashboardRes.json();
          setStats(data.stats || null);
        }
      } catch (err) {
        if (!isCurrentRequest) return;
        console.error("Failed to load wallet profile:", err);
        toast.error("Profile could not be loaded.");
      } finally {
        if (isCurrentRequest) {
          setLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isCurrentRequest = false;
    };
  }, [profileAddress]);

  return (
    <AddressProfileContext.Provider value={{ openWalletProfile }}>
      {children}
      {profileAddress && (
        <ProfileModal
          address={profileAddress}
          loading={loadingProfile}
          profile={profile}
          stats={stats}
          onClose={closeProfile}
          onCopy={handleModalCopy}
        />
      )}
    </AddressProfileContext.Provider>
  );
}

export function AddressDisplay({
  address,
  kind = "wallet",
  className = "",
}: AddressDisplayProps) {
  const normalizedAddress = address?.trim() || "";
  const profileContext = useContext(AddressProfileContext);

  const handleCopy = async () => {
    if (!normalizedAddress) return;

    try {
      await copyText(normalizedAddress);
      toast.success(kind === "wallet" ? "Wallet address copied." : "Transaction hash copied.");
    } catch {
      toast.error("Could not copy. Please try again.");
    }
  };

  const openProfile = () => {
    if (!normalizedAddress || kind !== "wallet") return;
    profileContext?.openWalletProfile(normalizedAddress);
  };

  if (!normalizedAddress) {
    return <span className={className}>-</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {kind === "wallet" ? (
        <button
          type="button"
          onClick={openProfile}
          className="cursor-pointer rounded-sm font-mono text-inherit underline-offset-4 transition-colors hover:text-indigo-600 hover:underline"
        >
          {shortenAddress(normalizedAddress)}
        </button>
      ) : (
        <a
          href={getExplorerTxUrl(normalizedAddress)}
          target="_blank"
          rel="noopener noreferrer"
          title="View transaction on Etherscan"
          className="cursor-pointer rounded-sm font-mono text-inherit underline-offset-4 transition-colors hover:text-indigo-600 hover:underline"
        >
          {shortenAddress(normalizedAddress)}
        </a>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void handleCopy();
        }}
        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600"
        aria-label={kind === "wallet" ? "Copy wallet address" : "Copy transaction hash"}
        title={kind === "wallet" ? "Copy wallet address" : "Copy transaction hash"}
      >
        <CopyIcon />
      </button>
    </span>
  );
}

function ProfileModal({
  address,
  loading,
  profile,
  stats,
  onClose,
  onCopy,
}: {
  address: string;
  loading: boolean;
  profile: ProfileResponse | null;
  stats: ProfileStats | null;
  onClose: () => void;
  onCopy: () => void;
}) {
  const displayName = profile?.user?.fullName || (profile?.isAdmin ? "Admin" : "Unnamed Supporter");
  const email = profile?.user?.email || "No email added";
  const bio = profile?.user?.profileBio || "No profile info added yet.";
  const avatarUrl = profile?.user?.avatarUrl;
  const receivedAmount = stats?.received ?? stats?.fundsReceived ?? 0;
  const countStats = [
    { label: "Campaigns Donated", value: stats ? stats.campaignsDonated : "-" },
    { label: "Campaigns Received", value: stats ? stats.campaignsReceived : "-" },
    { label: "Active Campaigns", value: stats ? stats.activeCampaigns : "-" },
  ];
  const amountStats = [
    { label: "Total Donated", value: stats ? formatEthAmount(stats.totalDonated) : "-" },
    { label: "Received", value: stats ? formatEthAmount(receivedAmount) : "-" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-cyan-50 shadow-sm">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-bold text-indigo-500">
                  {getInitials(displayName, address)}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-indigo-500">
                Wallet Profile
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {displayName}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close profile"
            title="Close profile"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-400">Bio</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{bio}</p>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Wallet</p>
            <p className="mt-1 font-mono text-sm text-slate-700">{shortenAddress(address)}</p>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
          >
            <CopyIcon />
            Copy
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Activity Summary
          </p>

          <div className="mt-3 grid grid-cols-3 gap-3">
            {countStats.map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-bold leading-none text-slate-900">
                  {loading ? (
                    <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-100" />
                  ) : (
                    item.value
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {amountStats.map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 flex items-baseline gap-2 text-2xl font-bold leading-none text-slate-900">
                  {loading ? (
                    <span className="inline-block h-7 w-24 animate-pulse rounded bg-slate-100" />
                  ) : (
                    <>
                      <span>{item.value}</span>
                      <span className="text-xs font-semibold text-slate-400">
                        ETH
                      </span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 8h10v10H8z M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}
