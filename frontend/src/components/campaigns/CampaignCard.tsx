import Link from "next/link";
import { formatEthAmount } from "@/utils/format";

interface CampaignCardProps {
  campaignId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  targetAmount: number;
  currentAmount: number;
  status: string;
  donationCount: number;
  tokenSymbol?: string;
  deadline?: string | null;
}

export function CampaignCard({
  campaignId,
  title,
  description,
  imageUrl,
  targetAmount,
  currentAmount,
  status,
  donationCount,
  tokenSymbol = "ETH",
  deadline,
}: CampaignCardProps) {
  const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  const clampedProgress = Math.min(progress, 100);

  return (
    <Link
      href={`/campaigns/${campaignId}`}
      className="group flex h-full flex-col card overflow-hidden"
    >
      {/* Image */}
      <div className="h-48 bg-slate-100 relative overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl">🎯</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        {/* Title */}
        <h3 className="mb-2 min-h-[3.5rem] text-lg font-semibold leading-7 text-slate-900 transition-colors line-clamp-2 group-hover:text-indigo-600">
          {title}
        </h3>

        {/* Description */}
        <p
          className={`mb-4 min-h-10 text-sm leading-5 text-slate-500 line-clamp-2 ${
            description ? "" : "invisible"
          }`}
        >
          {description || "No description provided."}
        </p>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>
              {formatEthAmount(currentAmount)} {tokenSymbol}
            </span>
            <span>
              {formatEthAmount(targetAmount)} {tokenSymbol}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full gradient-primary rounded-full transition-all duration-700"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <p className="text-right text-xs text-slate-400 mt-1">
            {clampedProgress.toFixed(0)}%
          </p>
        </div>

        {/* Deadline */}
        <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
            Deadline
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            {formatDeadline(deadline)}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between">
          <StatusBadge status={status} />
          <span className="text-xs text-slate-500">{donationCount} donations</span>
        </div>
      </div>
    </Link>
  );
}

function formatDeadline(deadline: string | null | undefined) {
  if (!deadline) return "No deadline";

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return "No deadline";

  return date.toLocaleDateString("en-GB");
}

// ============================================================
//                     STATUS BADGE
// ============================================================

const statusStyles: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-500",
  active: "bg-emerald-500/10 text-emerald-600",
  expired: "bg-amber-500/10 text-amber-600",
  released: "bg-indigo-500/10 text-indigo-600",
  cancelled: "bg-slate-500/10 text-slate-500",
  archived: "bg-slate-500/10 text-slate-500",
  confirmed: "bg-slate-500/10 text-slate-500",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || statusStyles.draft;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${style}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
