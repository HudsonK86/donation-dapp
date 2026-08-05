"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 glass">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">DC</span>
          </div>
          <span className="text-xl font-bold gradient-text">DonateChain</span>
        </Link>

        {/* Navigation links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                pathname === link.href
                  ? "bg-indigo-500/10 text-indigo-600"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Wallet Connect Button — Reown AppKit renders this */}
        <div className="flex items-center gap-3">
          <appkit-button size="sm" />
        </div>
      </nav>
    </header>
  );
}
