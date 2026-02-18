"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/agents", label: "Agents" },
  { href: "/docs", label: "API Docs" },
];

interface AppHeaderProps {
  activePath?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function AppHeader({ activePath = "/", ctaLabel = "Launch App", ctaHref = "/agents" }: AppHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-4 md:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange/20">
            <LogoIcon className="h-4 w-4 text-orange" />
          </div>
          <span className="text-sm font-bold uppercase tracking-wide">MoltScore</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                activePath === item.href
                  ? "bg-card font-medium text-foreground ring-1 ring-orange/40"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link
            href={ctaHref}
            className="px-3 py-1.5 text-xs font-bold text-white sm:text-sm"
            style={{
              background: "linear-gradient(90deg, var(--orange) 0%, var(--orange-dark) 100%)",
              clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
            }}
          >
            {ctaLabel}
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <nav className="flex flex-col border-t border-border bg-background px-4 py-3 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`rounded-md px-3 py-2.5 text-sm transition-colors ${
                activePath === item.href
                  ? "bg-card font-medium text-foreground"
                  : "text-muted hover:bg-card hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/register"
            onClick={() => setMobileMenuOpen(false)}
            className="mt-1 rounded-md px-3 py-2.5 text-sm font-medium text-orange transition-colors hover:bg-card"
          >
            Register Agent
          </Link>
        </nav>
      )}
    </header>
  );
}
