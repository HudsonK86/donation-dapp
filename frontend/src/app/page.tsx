import Link from "next/link";
import { CONTRACTS, getExplorerUrl } from "@/lib/contracts";

export default function HomePage() {
  const escrow = CONTRACTS.donationEscrow;
  const escrowUrl = getExplorerUrl(escrow);

  return (
    <div className="relative overflow-hidden">
      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32 lg:py-40 section-gradient-hero">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-indigo-400/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-sm text-indigo-600 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Powered by Blockchain Technology
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-slate-900">
            <span className="block">Transparent Donations,</span>
            <span className="block gradient-text mt-2">Verified On-Chain</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500 leading-relaxed">
            DonateChain uses smart contract escrow to ensure every donation is
            traceable, accountable, and automatically released to beneficiaries
            when campaign targets are met.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/campaigns"
              className="rounded-xl bg-indigo-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 transition-all duration-200 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
            >
              Browse Campaigns
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
            >
              My Dashboard
            </Link>
          </div>

          {/* Verify Our Smart Contract — trust strip */}
          <div className="mt-14 mx-auto max-w-2xl text-left">
            <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                <span className="text-lg">🔗</span>
                <span>Verify Our Smart Contract</span>
              </div>

              <p className="text-sm text-slate-500 mb-4">
                All donations are held by an on-chain escrow. No middlemen, no
                hidden fees — anyone can audit the contract on Etherscan.
              </p>

              <a
                href={escrowUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 hover:border-indigo-300 hover:bg-white transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    {escrow.name}
                  </div>
                  <div className="font-mono text-sm text-slate-700 truncate">
                    {escrow.address}
                  </div>
                </div>
                <span className="text-indigo-600 text-sm font-medium whitespace-nowrap group-hover:translate-x-0.5 transition">
                  View on Etherscan ↗
                </span>
              </a>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  🌐 <strong className="text-slate-700">Network:</strong>{" "}
                  {escrow.network}
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  🔢 <strong className="text-slate-700">Chain ID:</strong>{" "}
                  {escrow.chainId}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative px-6 py-24 section-gradient-alt">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold mb-16 text-slate-900">
            How It <span className="gradient-text">Works</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create Campaign",
                description:
                  "Administrators create donation campaigns with a target amount and beneficiary wallet address.",
                icon: "📋",
              },
              {
                step: "02",
                title: "Donate with Wallet",
                description:
                  "Donors connect their crypto wallet and send ETH directly to the smart contract escrow.",
                icon: "💰",
              },
              {
                step: "03",
                title: "Auto-Release Funds",
                description:
                  "When the target is reached, the smart contract automatically releases all funds to the beneficiary.",
                icon: "🔓",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="card relative p-8"
              >
                <div className="absolute -top-4 left-6 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-600">
                  Step {item.step}
                </div>
                <div className="text-4xl mb-4 mt-2">{item.icon}</div>
                <h3 className="text-xl font-semibold mb-3 text-slate-900">{item.title}</h3>
                <p className="text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative px-6 py-24 section-gradient-hero">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold mb-16 text-slate-900">
            Built for <span className="gradient-text">Trust</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Full Traceability",
                description: "Every donation is recorded on-chain with a verifiable transaction hash.",
                icon: "🔍",
              },
              {
                title: "Smart Contract Escrow",
                description: "Funds are held securely until the campaign target is met.",
                icon: "🔒",
              },
              {
                title: "Automatic Release",
                description: "No manual intervention — funds release automatically to beneficiaries.",
                icon: "⚡",
              },
              {
                title: "Real-Time Tracking",
                description: "Watch donation progress update in real-time on the blockchain.",
                icon: "📊",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="card p-6"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="text-sm font-semibold mb-2 text-slate-900">{feature.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="section-gradient-footer px-6 py-8">
        <div className="mx-auto max-w-6xl flex items-center justify-between text-sm text-slate-500">
          <p>© 2026 DonateChain. Blockchain Donation Platform.</p>
          <p>Built with Next.js, Solidity & deployed on Sepolia Testnet</p>
        </div>
      </footer>
    </div>
  );
}
