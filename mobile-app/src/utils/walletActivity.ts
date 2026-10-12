/** Pure helpers for the wallet history list. */

export type WalletTransaction = {
  id: string;
  amount: number;
  reason: "signup_bonus" | "top_up" | "processing_charge" | "processing_hold" | "processing_release" | "refund" | "adjustment";
  balanceAfter: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/**
 * One row per conversation: a hold and its release (or extra charge) net to
 * the actual cost, so history shows "Coffee with Priya −$0.04", not three lines.
 */
export type WalletActivity = {
  id: string;
  kind: "credit" | "charge" | "pending";
  title: string;
  amount: number;
  createdAt: string;
};

export function summarizeTransactions(transactions: WalletTransaction[]): WalletActivity[] {
  const byJob = new Map<string, WalletTransaction[]>();
  const activity: WalletActivity[] = [];
  for (const transaction of transactions) {
    const jobId = typeof transaction.metadata.jobId === "string" ? transaction.metadata.jobId : null;
    if (jobId && transaction.reason.startsWith("processing_")) {
      byJob.set(jobId, [...(byJob.get(jobId) ?? []), transaction]);
      continue;
    }
    if (transaction.reason === "signup_bonus") {
      activity.push({ id: transaction.id, kind: "credit", title: "Welcome credit", amount: transaction.amount, createdAt: transaction.createdAt });
    } else if (transaction.reason === "top_up") {
      activity.push({ id: transaction.id, kind: "credit", title: "Top-up", amount: transaction.amount, createdAt: transaction.createdAt });
    } else if (transaction.reason === "processing_charge") {
      const kind = transaction.metadata.kind;
      activity.push({
        id: transaction.id,
        kind: "charge",
        title: kind === "ask" ? "Ask Memory" : kind === "embed" ? "Memory search" : "AI processing",
        amount: transaction.amount,
        createdAt: transaction.createdAt,
      });
    } else if (transaction.amount !== 0) {
      activity.push({
        id: transaction.id,
        kind: transaction.amount > 0 ? "credit" : "charge",
        title: transaction.reason === "refund" ? "Refund" : "Adjustment",
        amount: transaction.amount,
        createdAt: transaction.createdAt,
      });
    }
  }
  for (const [jobId, rows] of byJob) {
    const net = rows.reduce((total, row) => total + row.amount, 0);
    const hold = rows.find((row) => row.reason === "processing_hold");
    const settled = rows.some((row) => row.reason !== "processing_hold");
    const titled = rows.find((row) => typeof row.metadata.title === "string");
    const kind = rows.find((row) => typeof row.metadata.kind === "string")?.metadata.kind;
    // A full release with nothing charged means the job failed: nothing to show.
    if (settled && net === 0) continue;
    activity.push({
      id: jobId,
      kind: settled ? "charge" : "pending",
      title: (titled?.metadata.title as string | undefined)
        ?? (kind === "transcript" ? "Meet transcript import" : "Recording"),
      amount: net,
      createdAt: (hold ?? rows[rows.length - 1]!).createdAt,
    });
  }
  return activity.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
