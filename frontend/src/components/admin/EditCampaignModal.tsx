"use client";

import { useEffect, useRef, useState } from "react";
import { createPublicClient, getAddress, http, isAddress, type Hash } from "viem";
import { hardhat } from "viem/chains";
import { useUpdateCampaignTerms } from "@/hooks/useContract";
import { config } from "@/utils/config";
import { toast } from "react-toastify";

export interface EditableCampaign {
  campaignId: string;
  onChainCampaignId: number | null;
  campaignTitle: string;
  campaignDescription: string | null;
  targetAmount: number;
  currentAmount: number;
  campaignStatus: string;
  tokenSymbol: string;
  campaignDeadline: string | null;
  beneficiaryWallet?: { walletAddress: string } | null;
  imageUrl?: string | null;
  _count: { donations: number };
}

interface EditCampaignModalProps {
  isOpen: boolean;
  campaign: EditableCampaign | null;
  onClose: () => void;
  onSuccess: () => void;
}

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(config.rpcUrl),
});

function toDateInputValue(date: string | Date | null | undefined) {
  if (!date) return "";

  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDeadlineIso(dateValue: string) {
  return new Date(`${dateValue}T23:59:59`).toISOString();
}

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
    return "Unable to update campaign.";
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

export function EditCampaignModal({
  isOpen,
  campaign,
  onClose,
  onSuccess,
}: EditCampaignModalProps) {
  const { updateCampaignTerms, isPending } = useUpdateCampaignTerms();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [existingImageRemoved, setExistingImageRemoved] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toastIdRef = useRef<ReturnType<typeof toast.loading> | null>(null);

  const hasDonations = (campaign?._count.donations ?? 0) > 0;
  const isActive = campaign?.campaignStatus === "active";
  const canEditTerms =
    Boolean(campaign?.onChainCampaignId != null) && isActive && !hasDonations;
  const isBusy = isPending || saving || uploading || confirming;
  const existingImageUrl = campaign?.imageUrl ?? null;
  const imagePreview = previewUrl ?? (existingImageRemoved ? null : existingImageUrl);

  useEffect(() => {
    if (!isOpen || !campaign) return;

    const timer = window.setTimeout(() => {
      setTitle(campaign.campaignTitle);
      setDescription(campaign.campaignDescription ?? "");
      setBeneficiary(campaign.beneficiaryWallet?.walletAddress ?? "");
      setTargetAmount(String(campaign.targetAmount));
      setDeadlineDate(toDateInputValue(campaign.campaignDeadline));
      setFile(null);
      setPreviewUrl(null);
      setExistingImageRemoved(false);
      setFormError("");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [campaign, isOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen || !campaign) return null;

  const updateProgressToast = (
    message: string,
    type: "default" | "info" | "success" | "error",
    isLoading: boolean
  ) => {
    if (!toastIdRef.current) return;

    toast.update(toastIdRef.current, {
      render: message,
      type,
      isLoading,
      autoClose: isLoading ? false : 3500,
      closeOnClick: !isLoading,
    });
  };

  const uploadImage = async () => {
    if (!file) return null;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Image upload failed.");
      }

      const uploadData = await uploadRes.json();
      return typeof uploadData.url === "string" ? uploadData.url : null;
    } finally {
      setUploading(false);
    }
  };

  const runPreflight = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/campaigns/${campaign.campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        preflightOnly: true,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || "Campaign edit is not allowed.");
    }
  };

  const saveCampaign = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/campaigns/${campaign.campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || "Failed to update campaign.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const closeModal = () => {
    if (isBusy) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    setFormError("");

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setFormError("Campaign title is required.");
      return;
    }

    const initialBeneficiary = campaign.beneficiaryWallet?.walletAddress ?? "";
    const initialDeadlineDate = toDateInputValue(campaign.campaignDeadline);
    const beneficiaryChanged =
      beneficiary.trim().toLowerCase() !== initialBeneficiary.toLowerCase();
    const targetChanged = Number(targetAmount) !== Number(campaign.targetAmount);
    const deadlineChanged = deadlineDate !== initialDeadlineDate;
    const termsChanged = beneficiaryChanged || targetChanged || deadlineChanged;

    if (termsChanged && !canEditTerms) {
      setFormError("Campaign terms can only be changed before any donation.");
      return;
    }

    const payload: Record<string, unknown> = {
      campaignTitle: trimmedTitle,
      campaignDescription: trimmedDescription,
    };

    let normalizedBeneficiary = "";
    let deadlineIso = "";
    let deadlineSeconds = 0;

    if (termsChanged) {
      if (!isAddress(beneficiary.trim())) {
        setFormError("Valid beneficiary wallet address is required.");
        return;
      }

      const targetValue = Number(targetAmount);
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        setFormError("Target amount must be greater than 0.");
        return;
      }

      if (!deadlineDate) {
        setFormError("Campaign deadline is required.");
        return;
      }

      deadlineIso = getDeadlineIso(deadlineDate);
      deadlineSeconds = Math.floor(new Date(deadlineIso).getTime() / 1000);

      if (new Date(deadlineIso) <= new Date()) {
        setFormError("Campaign deadline must be in the future.");
        return;
      }

      normalizedBeneficiary = getAddress(beneficiary.trim());
      payload.beneficiaryWalletAddress = normalizedBeneficiary;
      payload.targetAmount = targetAmount;
      payload.campaignDeadline = deadlineIso;
    }

    try {
      setSaving(true);

      await runPreflight(payload);

      const finalImageUrl = await uploadImage();
      if (finalImageUrl) {
        payload.imageUrl = finalImageUrl;
      }

      if (termsChanged) {
        toastIdRef.current = toast.loading(
          "Transaction submitted. Waiting for local chain confirmation...",
          { toastId: `update-campaign-${campaign.campaignId}` }
        );
        setConfirming(true);

        const txHash = await updateCampaignTerms(
          BigInt(campaign.onChainCampaignId!),
          normalizedBeneficiary,
          targetAmount,
          deadlineSeconds
        );
        const receipt = await waitForReceipt(txHash);

        if (receipt.status !== "success") {
          throw new Error("The campaign update transaction was reverted.");
        }

        payload.termsTxHash = txHash;
        updateProgressToast(
          "On-chain campaign update confirmed. Saving database record...",
          "info",
          true
        );
      }

      await saveCampaign(payload);

      if (toastIdRef.current) {
        updateProgressToast("Campaign updated successfully.", "success", false);
        toastIdRef.current = null;
      } else {
        toast.success("Campaign updated successfully.");
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to update campaign:", err);
      const message = getErrorMessage(err);

      if (toastIdRef.current) {
        updateProgressToast(message, "error", false);
        toastIdRef.current = null;
      } else {
        toast.error(message);
      }

      setFormError(message);
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={closeModal}
      />

      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xl animate-fade-in">
        <h2 className="mb-6 text-xl font-bold text-slate-900">Edit Campaign</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Campaign Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Campaign Image
            </label>

            {imagePreview ? (
              <div className="relative w-full max-w-full overflow-hidden rounded-xl bg-slate-100">
                <div className="flex h-48 w-full items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="Campaign preview"
                    style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setFile(null);
                    setPreviewUrl(null);
                    setExistingImageRemoved(true);
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 transition-colors hover:border-indigo-400 hover:bg-indigo-50/30">
                <span className="mb-2 text-2xl">📸</span>
                <span className="text-sm font-medium text-slate-600">
                  Click to upload an image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the campaign purpose..."
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Beneficiary Wallet Address *
            </label>
            <input
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              disabled={!canEditTerms}
              placeholder="0x..."
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Target Amount (ETH) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                disabled={!canEditTerms}
                placeholder="10.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Deadline *
              </label>
              <input
                type="date"
                min={toDateInputValue(new Date())}
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                disabled={!canEditTerms}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-red-500">{formError}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isBusy}
              className="flex-1 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending
                ? "Confirm in Wallet..."
                : confirming
                ? "Confirming on Chain..."
                : uploading
                ? "Uploading Image..."
                : saving
                ? "Saving..."
                : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={isBusy}
              className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
