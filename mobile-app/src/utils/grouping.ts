/** Pure list helpers for the Home and Memories tabs; no React Native imports. */

export type ConversationFilter = "all" | "recordings" | "meet" | "review";

type Filterable = {
  title: string;
  summary: string;
  people: string[];
  source: "recording" | "google_meet";
  pendingReviewCount: number;
};

export function filterConversations<T extends Filterable>(
  items: T[],
  options: { query?: string; filter?: ConversationFilter },
): T[] {
  const terms = (options.query ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (options.filter === "recordings" && item.source !== "recording") return false;
    if (options.filter === "meet" && item.source !== "google_meet") return false;
    if (options.filter === "review" && item.pendingReviewCount <= 0) return false;
    if (!terms.length) return true;
    const haystack = `${item.title}\n${item.summary}\n${item.people.join(" ")}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export type DayGroup<T> = { title: string; items: T[] };

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Buckets newest-first items into Today / Yesterday / This week / Earlier (local time). */
export function groupByDay<T extends { createdAt: string }>(items: T[], now = new Date()): DayGroup<T>[] {
  const today = startOfDay(now);
  const day = 86_400_000;
  const buckets: DayGroup<T>[] = [
    { title: "Today", items: [] },
    { title: "Yesterday", items: [] },
    { title: "This week", items: [] },
    { title: "Earlier", items: [] },
  ];
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const item of sorted) {
    const itemDay = startOfDay(new Date(item.createdAt));
    const bucket = itemDay >= today ? 0 : itemDay >= today - day ? 1 : itemDay >= today - 6 * day ? 2 : 3;
    buckets[bucket]!.items.push(item);
  }
  return buckets.filter((bucket) => bucket.items.length);
}
