import Link from "next/link";

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
  tokenSymbol = "USDT",
}: CampaignCardProps) {
  const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  const clampedProgress = Math.min(progress, 100);

  return (
    <Link
      href={`/campaigns/${campaignId}`}
      className="group block card overflow-hidden"
    >
      {/* Image */}
      <div className="h-48 bg-slate-100 relative overflow-hidden">
        {imageUrl ? (
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

      <div className="p-6">
        {/* Title */}
        <h3 className="text-lg font-semibold mb-2 text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p className="text-sm text-slate-500 mb-4 line-clamp-2">{description}</p>
        )}

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>
              {currentAmount.toFixed(2)} {tokenSymbol}
            </span>
            <span>
              {targetAmount.toFixed(2)} {tokenSymbol}
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

        {/* Footer */}
        <div className="flex items-center justify-between">
          <StatusBadge status={status} />
          <span className="text-xs text-slate-500">{donationCount} donations</span>
        </div>
      </div>
    </Link>
  );
}

// ============================================================
//                     STATUS BADGE
// ============================================================

const statusStyles: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-500",
  active: "bg-emerald-500/10 text-emerald-600",
  released: "bg-indigo-500/10 text-indigo-600",
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
