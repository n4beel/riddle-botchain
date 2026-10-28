"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";
import { app } from "@/lib/app-config";

export interface NavItem {
  href: string;
  label: string;
}

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Scroll Shelf" },
  { href: "/new", label: "Inscribe Riddle" },
  { href: "/me", label: "My Guesses & Till" },
];

export default function PageShell({
  children,
  title,
  subtitle,
}: PageShellProps) {
  const pathname = usePathname();
  const links = footerLinks();

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Top Banner & Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[var(--bg-surface)] border-b border-[var(--border-default)] shadow-[0_2px_8px_rgba(45,30,18,0.05)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 md:h-16 gap-3">
            {/* Brand Logo & Title */}
            <Link
              href="/"
              className="flex items-center gap-2.5 text-decoration-none group select-none"
            >
              <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-heading text-xs shadow-sm group-hover:scale-105 transition-transform">
                §
              </div>
              <div className="flex flex-col">
                <span className="font-heading font-bold text-base md:text-lg tracking-wider text-[var(--text-primary)]">
                  {app.name}
                </span>
                <span className="text-[10px] md:text-[11px] text-[var(--text-muted)] -mt-0.5 tracking-tight hidden sm:inline">
                  {app.tagline}
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 font-heading text-xs uppercase tracking-wider">
              {DEFAULT_NAV.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "px-3 py-1.5 rounded-[2px] transition-colors",
                      isActive
                        ? "bg-[#EDE0BE] text-[var(--text-primary)] font-semibold shadow-[inset_0_1px_2px_rgba(45,30,18,0.1)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#F5E8C7]",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Wallet & Network Controls */}
            <div className="flex items-center gap-2">
              <NetworkBadge />
              <div className="w-[140px] sm:w-[160px]">
                <ConnectButton />
              </div>
            </div>
          </div>

          {/* Mobile Navigation Row */}
          <nav className="flex md:hidden items-center justify-around py-2 border-t border-[var(--border-subtle)] font-heading text-[11px] uppercase tracking-wide">
            {DEFAULT_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "px-2.5 py-1 rounded-[2px]",
                    isActive
                      ? "bg-[#EDE0BE] text-[var(--text-primary)] font-semibold"
                      : "text-[var(--text-secondary)]",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        {(title || subtitle) && (
          <header className="mb-6 md:mb-8 text-center sm:text-left">
            {title && (
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-wide">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="font-serif text-sm sm:text-base text-[var(--text-secondary)] mt-1.5 italic">
                {subtitle}
              </p>
            )}
          </header>
        )}
        {children}
      </main>

      {/* Contractual Three-Link Footer */}
      <footer className="mt-auto border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-5 text-xs text-[var(--text-muted)] font-serif">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <BuiltOnBotChain />
          </div>

          <div className="flex items-center gap-4 text-[12px] font-mono">
            <a
              href={links.site}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-4 transition-colors"
            >
              botchain.ai
            </a>
            <span className="text-[var(--border-default)]" aria-hidden="true">
              •
            </span>
            <a
              href={links.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-4 transition-colors"
            >
              scan.botchain.ai
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
