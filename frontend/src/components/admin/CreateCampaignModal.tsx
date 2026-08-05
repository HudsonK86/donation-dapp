"use client";

import { useState, useRef } from "react";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  parseEther,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { hardhat } from "viem/chains";
import { useCreateCampaign } from "@/hooks/useContract";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { config } from "@/utils/config";
import { DONATION_ESCROW_ABI } from "@/utils/contract";
import { toast } from "react-toastify";

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const publicClient = createPublicClient({
  chain: hardhat,
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

async function ensureDonationEscrowReady() {
  if (!isAddress(config.contractAddress)) {
    throw new Error(
      "DonationEscrow contract address is missing or invalid. Check NEXT_PUBLIC_CONTRACT_ADDRESS."
    );
  }

  const contractAddress = getAddress(config.contractAddress);

  let contractCode: string | undefined;
  try {
    contractCode = await publicClient.getCode({
      address: contractAddress,
    });
  } catch {
    throw new Error(
      `Cannot reach Hardhat RPC at ${config.rpcUrl}. Start the Hardhat node and try again.`
    );
  }

  if (!contractCode || contractCode === "0x") {
    throw new Error(
      `No DonationEscrow contract is deployed at ${contractAddress}. Check NEXT_PUBLIC_CONTRACT_ADDRESS, then restart the Next.js dev server.`
    );
  }

  try {
    await publicClient.readContract({
      address: contractAddress,
      abi: DONATION_ESCROW_ABI,
      functionName: "getCampaignCount",
    });
  } catch {
    throw new Error(
      `The contract at ${contractAddress} does not look like DonationEscrow. Redeploy the contract, sync the frontend env, then restart Next.js.`
    );
  }
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCampaignModalProps) {
  const { user } = useAdminAuth();
  const { createCampaign, isPending } = useCreateCampaign();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [checkingContract, setCheckingContract] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<Hash | null>(null);
  const activeTxRef = useRef<Hash | null>(null);
  const txToastIdRef = useRef<ReturnType<typeof toast.loading> | null>(null);
  const isBusy = isPending || checkingContract || isConfirming || saving || uploading;

  const getCreatedCampaignId = (txReceipt: TransactionReceipt) => {
    for (const log of txReceipt.logs) {
      if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: DONATION_ESCROW_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName !== "CampaignCreated") {
          continue;
        }

        const campaignId = (decoded.args as { campaignId?: unknown })
          .campaignId;

        return typeof campaignId === "bigint" ? campaignId : null;
      } catch {
        continue;
      }
    }

    return null;
  };

  const getLatestCampaignIdFallback = async (
    expectedBeneficiary: string,
    expectedTargetAmount: string,
    expectedDeadlineSeconds: number
  ) => {
    const campaignCount = await publicClient.readContract({
      address: config.contractAddress as `0x${string}`,
      abi: DONATION_ESCROW_ABI,
      functionName: "getCampaignCount",
    });

    if (campaignCount === BigInt(0)) {
      return null;
    }

    const candidateId = campaignCount - BigInt(1);
    const candidate = await publicClient.readContract({
      address: config.contractAddress as `0x${string}`,
      abi: DONATION_ESCROW_ABI,
      functionName: "getCampaign",
      args: [candidateId],
    });

    const campaign = candidate as unknown as {
      beneficiary?: string;
      targetAmount?: bigint;
      deadline?: bigint;
    } & readonly unknown[];

    const candidateBeneficiary =
      campaign.beneficiary ?? (campaign[2] as string | undefined);
    const candidateTargetAmount =
      campaign.targetAmount ?? (campaign[3] as bigint | undefined);
    const candidateDeadline =
      campaign.deadline ?? (campaign[5] as bigint | undefined);

    if (
      candidateBeneficiary?.toLowerCase() ===
        expectedBeneficiary.toLowerCase() &&
      candidateTargetAmount === parseEther(expectedTargetAmount) &&
      candidateDeadline === BigInt(expectedDeadlineSeconds)
    ) {
      return candidateId;
    }

    return null;
  };

  const getTransactionErrorMessage = (err: unknown) => {
    if (!(err instanceof Error)) {
      return "Unable to create campaign.";
    }

    if (
      err.message.includes("User rejected") ||
      err.message.includes("User denied") ||
      err.message.includes("rejected the request")
    ) {
      return "Transaction was cancelled in the wallet.";
    }

    return err.message.slice(0, 180);
  };

  const updateProgressToast = (
    message: string,
    type: "default" | "info" | "success" | "error",
    isLoading: boolean
  ) => {
    if (!txToastIdRef.current) {
      return;
    }

    toast.update(txToastIdRef.current, {
      render: message,
      type,
      isLoading,
      autoClose: isLoading ? false : 3500,
      closeOnClick: !isLoading,
    });
  };

  // Save to DB once on-chain tx succeeds
  const saveToDatabase = async (
    txHash: string,
    finalImageUrl: string | null,
    onChainCampaignId: bigint,
    deadlineSeconds: number
  ) => {
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorUserId: user?.userId,
          campaignTitle: title,
          campaignDescription: description,
          targetAmount,
          tokenSymbol: "USDT",
          onChainCampaignId: onChainCampaignId.toString(),
          beneficiaryWalletAddress: getAddress(beneficiary.trim()),
          createTxHash: txHash,
          campaignDeadline: new Date(deadlineSeconds * 1000).toISOString(),
          imageUrl: finalImageUrl,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to save campaign");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    setFormError("");

    if (!title.trim()) {
      setFormError("Campaign title is required.");
      return;
    }
    if (!isAddress(beneficiary.trim())) {
      setFormError("Valid beneficiary address (0x...) is required.");
      return;
    }

    const targetAmountValue = Number(targetAmount);
    if (!targetAmount || !Number.isFinite(targetAmountValue) || targetAmountValue <= 0) {
      setFormError("Target amount must be greater than 0.");
      return;
    }

    const durationDayCount = Number(durationDays);
    if (!Number.isInteger(durationDayCount) || durationDayCount <= 0) {
      setFormError("Duration must be at least 1 day.");
      return;
    }

    try {
      setCheckingContract(true);
      await ensureDonationEscrowReady();
    } catch (err) {
      const message = getTransactionErrorMessage(err);
      setFormError(message);
      toast.error(message, { toastId: "contract-check-error" });
      return;
    } finally {
      setCheckingContract(false);
    }

    let finalImageUrl = null;
    if (file) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) throw new Error("Image upload failed");
        const uploadData = await uploadRes.json();
        finalImageUrl = uploadData.url;
      } catch (err) {
        console.error(err);
        setFormError("Failed to upload image. Please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const normalizedBeneficiary = getAddress(beneficiary.trim());
    const deadlineSeconds = Math.floor(Date.now() / 1000) + durationDayCount * 86400;

    try {
      const txHash = await createCampaign(
        normalizedBeneficiary,
        targetAmount,
        deadlineSeconds
      );

      activeTxRef.current = txHash;
      setSubmittedTxHash(txHash);
      setIsConfirming(true);
      txToastIdRef.current = toast.loading(
        "Transaction submitted. Waiting for local chain confirmation...",
        { toastId: `create-campaign-${txHash}` }
      );

      const receipt = await waitForReceipt(txHash);

      if (receipt.status !== "success") {
        throw new Error("The campaign transaction was reverted.");
      }

      const onChainCampaignId =
        getCreatedCampaignId(receipt) ??
        (await getLatestCampaignIdFallback(
          normalizedBeneficiary,
          targetAmount,
          deadlineSeconds
        ));

      if (onChainCampaignId == null) {
        throw new Error(
          "Campaign ID could not be read from the transaction receipt."
        );
      }

      setIsConfirming(false);
      updateProgressToast(
        "On-chain campaign confirmed. Saving database record...",
        "info",
        true
      );

      await saveToDatabase(
        txHash,
        finalImageUrl,
        onChainCampaignId,
        deadlineSeconds
      );

      updateProgressToast("Campaign successfully created!", "success", false);
      txToastIdRef.current = null;
      onSuccess();
      resetForm();
      onClose();
    } catch (err) {
      console.error("Failed to create campaign:", err);
      const message = getTransactionErrorMessage(err);

      if (txToastIdRef.current) {
        updateProgressToast(message, "error", false);
        txToastIdRef.current = null;
      } else {
        toast.error(message, { toastId: "create-campaign-error" });
      }

      setFormError(message);
    } finally {
      setIsConfirming(false);
      activeTxRef.current = null;
    }
  };

  function resetForm() {
    setTitle("");
    setDescription("");
    setBeneficiary("");
    setTargetAmount("");
    setDurationDays("30");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFormError("");
    setSubmittedTxHash(null);
    activeTxRef.current = null;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={() => {
          if (!isBusy) onClose();
        }}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 p-8 animate-fade-in">
        <h2 className="text-xl font-bold text-slate-900 mb-6">
          Create New Campaign
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Campaign Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Clean Water for Village X"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Campaign Image
            </label>
            <div className="flex items-center gap-4">
              <label className="flex-1 cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <span className="text-2xl mb-2">📸</span>
                <span className="text-sm font-medium text-slate-600">
                  {file ? file.name : "Click to upload an image"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {previewUrl && (
                <div className="h-24 w-24 rounded-xl overflow-hidden shadow-sm shrink-0">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the campaign purpose..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
            />
          </div>

          {/* Beneficiary Address */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Beneficiary Wallet Address *
            </label>
            <input
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-mono"
            />
          </div>

          {/* Target Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Target Amount (USDT) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="10.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Duration (Days) *
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="30"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
          </div>

          {/* Errors */}
          {formError && (
            <p className="text-xs text-red-500">{formError}</p>
          )}
          {/* Status */}
          {submittedTxHash && (isConfirming || saving) && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
              {isConfirming
                ? "Transaction submitted. Waiting for local chain confirmation..."
                : "On-chain campaign confirmed. Saving to database..."}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isBusy}
              className="flex-1 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending
                ? "Confirm in Wallet..."
                : checkingContract
                ? "Checking Contract..."
                : isConfirming
                ? "Confirming on Chain..."
                : uploading
                ? "Uploading Image..."
                : saving
                ? "Saving..."
                : "Create Campaign"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              disabled={isBusy}
              className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
