import { describe, expect, it } from "vitest";
import { summarizeTransactions, type WalletTransaction } from "./walletActivity";

const tx = (id: string, amount: number, reason: WalletTransaction["reason"], metadata: Record<string, unknown> = {}, minute = 0): WalletTransaction => ({
  id, amount, reason, metadata, balanceAfter: 0, createdAt: new Date(Date.UTC(2026, 9, 12, 10, minute)).toISOString(),
});

describe("summarizeTransactions", () => {
  it("nets a hold and its release into one charge per conversation", () => {
    const rows = summarizeTransactions([
      tx("r", 38_000, "processing_release", { jobId: "j1", title: "Coffee with Priya" }, 5),
      tx("h", -50_000, "processing_hold", { jobId: "j1", kind: "audio" }, 1),
      tx("b", 5_000_000, "signup_bonus", {}, 0),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ id: "j1", kind: "charge", title: "Coffee with Priya", amount: -12_000 }),
      expect.objectContaining({ kind: "credit", title: "Welcome credit", amount: 5_000_000 }),
    ]);
  });

  it("shows open holds as pending and hides fully refunded failures", () => {
    const rows = summarizeTransactions([
      tx("h1", -50_000, "processing_hold", { jobId: "open", kind: "transcript" }),
      tx("h2", -20_000, "processing_hold", { jobId: "failed" }),
      tx("r2", 20_000, "processing_release", { jobId: "failed" }),
    ]);
    expect(rows).toEqual([expect.objectContaining({ id: "open", kind: "pending", title: "Meet transcript import", amount: -50_000 })]);
  });
});
