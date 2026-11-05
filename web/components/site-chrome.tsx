"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { buttonPrimary, shell } from "@/lib/ui";
import { cn } from "@/lib/utils";

const navItems = [
  ["How it works", "#how"],
  ["Privacy", "#privacy"],
  ["FAQ", "#faq"],
] as const;

function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Memory AI home"
      className={cn(
        "inline-flex shrink-0 items-center gap-2 font-bold tracking-[-0.04em] text-ink",
        small ? "text-xl" : "text-2xl",
      )}
    >
      <img
        src="/images/logo.png"
        width={small ? 32 : 38}
        height={small ? 32 : 38}
        alt=""
        className="rounded-[10px]"
      />
      <span>
        Memory<span className="ml-0.5 text-accent-ink">ai</span>
      </span>
    </Link>
  );
}

/* Shared header. On the home page the section links are in-page anchors and
   "Join early access" focuses the hero email; elsewhere they lead back home. */
export function SiteHeader({
  onHome = false,
  current,
}: {
  onHome?: boolean;
  current?: "blog";
}) {
  const [open, setOpen] = useState(false);
  const base = onHome ? "" : "/";
  const focusSignup = () => {
    setOpen(false);
    if (!onHome) return;
    window.setTimeout(
      () =>
        document
          .getElementById("waitlist-email")
          ?.focus({ preventScroll: true }),
      100,
    );
  };
  const links = [
    ...navItems.map(([label, hash]) => [label, `${base}${hash}`] as const),
    ["Blog", "/blog"] as const,
  ];
  return (
    <>
      <a
        href="#main"
        className="fixed -top-20 left-6 z-[100] rounded-lg bg-ink p-4 text-on-ink focus:top-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className={cn(shell, "flex min-h-[76px] items-center justify-between gap-6")}>
          <Brand />
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-8 text-[0.9375rem] md:flex"
          >
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={current === "blog" && href === "/blog" ? "page" : undefined}
                className="text-muted transition hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href={`${base}#early-access`}
              onClick={focusSignup}
              className={cn(buttonPrimary, "hidden px-4 py-2.5 sm:inline-flex")}
            >
              Join early access <ArrowRight size={16} />
            </Link>
            <button
              type="button"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              onClick={() => setOpen(!open)}
              className="grid size-10 place-items-center rounded-full border border-line text-ink md:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className={cn(shell, "flex flex-col pb-4 md:hidden")}
          >
            {[...links, ["Join early access", `${base}#early-access`] as const].map(
              ([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={href.endsWith("#early-access") ? focusSignup : () => setOpen(false)}
                  className="flex items-center justify-between border-b border-line py-4 text-lg text-ink"
                >
                  {label}
                  <ArrowUpRight size={18} className="text-faint" />
                </Link>
              ),
            )}
          </nav>
        )}
      </header>
    </>
  );
}

export function SiteFooter({ deckUrl }: { deckUrl?: string }) {
  return (
    <footer className="border-t border-line">
      <div
        className={cn(
          shell,
          "flex flex-col items-start gap-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <Brand small />
        <p>© {new Date().getFullYear()} Memory AI · Remember every conversation.</p>
        <div className="flex items-center gap-6">
          <Link href="/blog" className="transition hover:text-ink">
            Blog
          </Link>
          {deckUrl && (
            <a
              href={deckUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition hover:text-ink"
            >
              Product deck <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
