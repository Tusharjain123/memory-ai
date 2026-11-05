/* Shared Tailwind class strings for patterns that repeat across pages.
   Combine with cn() from ./utils when a caller needs to extend them. */

/** Centered page column. */
export const shell = "mx-auto w-[min(1200px,calc(100%-48px))]";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ink px-5 py-3 text-sm font-semibold text-on-ink transition duration-200 hover:-translate-y-0.5 hover:bg-ink-hover hover:shadow-lift disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export const buttonGhost =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line-strong px-5 py-3 text-sm font-semibold text-ink transition duration-200 hover:border-accent-ink hover:text-accent-ink";

export const eyebrow =
  "inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink";

/* No line-height here: cn()/tailwind-merge drops a leading-* that comes
   before a text-* size, so callers add leading after their size. */
export const displayTitle =
  "font-display font-normal tracking-[-0.02em] text-ink";

export const sectionTitle = `${displayTitle} text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.05]`;

export const lede = "text-lg leading-relaxed text-muted";

/** Starting state for elements revealed on scroll by useReveal(). */
export const reveal =
  "transition duration-700 ease-out data-[reveal=pending]:translate-y-5 data-[reveal=pending]:opacity-0";
