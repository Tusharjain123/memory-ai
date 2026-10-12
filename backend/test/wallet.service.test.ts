import { ConflictException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudDataService } from "../src/wallet/cloud-data.service.js";
import { InsufficientCreditsException, WalletService } from "../src/wallet/wallet.service.js";

const row = {
  id: "t1",
  user_id: "u1",
  amount: "100",
  reason: "top_up",
  idempotency_key: "top_up:p1",
  balance_after: "100",
  metadata: null,
  created_at: "2026-10-11T00:00:00Z",
};

beforeEach(() => {
  process.env.SUPABASE_URL = "https://project.supabase.co/";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe("WalletService", () => {
  it("calls apply_credit_transaction with p_* arguments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new WalletService().applyTransaction({
      userId: "u1",
      amount: 100,
      reason: "top_up",
      idempotencyKey: "top_up:p1",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://project.supabase.co/rest/v1/rpc/apply_credit_transaction");
    expect(JSON.parse(String(init.body))).toEqual({
      p_user_id: "u1",
      p_amount: 100,
      p_reason: "top_up",
      p_idempotency_key: "top_up:p1",
      p_metadata: {},
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sb_secret_test");
    expect(result).toMatchObject({ amount: 100, balanceAfter: 100, metadata: {} });
  });

  it("maps database errors to HTTP errors", async () => {
    const error = (message: string) => new Response(
      JSON.stringify({ code: "P0001", message }),
      { status: 400 },
    );
    const input = { userId: "u1", amount: -5, reason: "processing_charge" as const, idempotencyKey: "k" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(error("insufficient_credits")));
    await expect(new WalletService().applyTransaction(input)).rejects.toBeInstanceOf(InsufficientCreditsException);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(error("idempotency_conflict")));
    await expect(new WalletService().applyTransaction(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it("reads the caller's balance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify([{ credits: "42", updated_at: "2026-10-11T00:00:00Z" }]),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new WalletService().getBalance("u1")).resolves.toEqual({
      credits: 42,
      updatedAt: "2026-10-11T00:00:00Z",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("user_balance?user_id=eq.u1");
  });
});

describe("CloudDataService", () => {
  it("deletes folders and clears synced profile details only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await new CloudDataService().deleteSyncedData("u1");

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toContain("/rest/v1/folders?user_id=eq.u1");
    expect(calls[0]?.[1].method).toBe("DELETE");
    expect(calls[1]?.[0]).toContain("/rest/v1/users?id=eq.u1");
    expect(JSON.parse(String(calls[1]?.[1].body))).toEqual({
      age: null,
      gender: null,
      phone_number: null,
      metadata: {},
      cloud_sync_enabled: false,
    });
  });
});

describe("WalletService settlement", () => {
  function wallet(balance = 1_000_000) {
    const service = new WalletService();
    const apply = vi.spyOn(service, "applyTransaction").mockResolvedValue({} as never);
    vi.spyOn(service, "getBalance").mockResolvedValue({ credits: balance, updatedAt: null });
    return { service, apply };
  }

  it("refunds the unused part of a hold", async () => {
    const { service, apply } = wallet();
    await expect(service.settle({ userId: "u", jobId: "j", holdMicros: 50_000, actualMicros: 12_000 })).resolves.toEqual({ chargedMicros: 12_000 });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ amount: 38_000, reason: "processing_release", idempotencyKey: "release:j" }));
  });

  it("takes an overage but never more than the balance", async () => {
    const { service, apply } = wallet(5_000);
    await expect(service.settle({ userId: "u", jobId: "j", holdMicros: 10_000, actualMicros: 30_000 })).resolves.toEqual({ chargedMicros: 15_000 });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ amount: -5_000, reason: "processing_charge", idempotencyKey: "charge:j" }));
  });

  it("does nothing extra when the hold matched exactly", async () => {
    const { service, apply } = wallet();
    await service.settle({ userId: "u", jobId: "j", holdMicros: 10_000, actualMicros: 10_000 });
    expect(apply).not.toHaveBeenCalled();
  });
});
