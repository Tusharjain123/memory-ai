import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { audioHoldMicros, durationFromBytes, expectedAudioCostMicros, minutesForBalance, transcriptHoldMicros } from "../src/billing/estimate.js";
import { recordUsage, UsageMeter, usageCostMicros, withUsageMeter, type PriceCard } from "../src/billing/usage-meter.js";
import { chatUsage } from "../src/ollama/ollama-client.js";
import { ProcessingQueueService, type ProcessingJob } from "../src/processing/processing-queue.service.js";
import { formatMicros, usdToMicros } from "../src/wallet/money.js";

const prices: PriceCard = { deepgramPerMinUsd: 0.006, llmInputPerMTokUsd: 1, llmOutputPerMTokUsd: 4, embedPerMTokUsd: 0.13 };

describe("usage cost", () => {
  it("prices each provider and rounds up to whole micros", () => {
    expect(usageCostMicros({ audioSec: 60, llmPromptTokens: 0, llmOutputTokens: 0, embedTokens: 0 }, prices)).toBe(6_000);
    expect(usageCostMicros({ audioSec: 0, llmPromptTokens: 1_000_000, llmOutputTokens: 250_000, embedTokens: 0 }, prices)).toBe(2_000_000);
    expect(usageCostMicros({ audioSec: 0, llmPromptTokens: 1, llmOutputTokens: 0, embedTokens: 0 }, prices)).toBe(1);
  });

  it("collects usage only inside a metered context", async () => {
    recordUsage({ audioSec: 999 }); // outside: ignored
    const meter = new UsageMeter();
    await withUsageMeter(meter, async () => {
      recordUsage({ audioSec: 30 });
      await Promise.all([
        Promise.resolve().then(() => recordUsage({ llmPromptTokens: 100 })),
        new Promise<void>((resolve) => setTimeout(() => { recordUsage({ llmOutputTokens: 40, embedTokens: 7 }); resolve(); }, 1)),
      ]);
    });
    expect(meter.usage).toEqual({ audioSec: 30, llmPromptTokens: 100, llmOutputTokens: 40, embedTokens: 7 });
  });

  it("reads Ollama token counts and estimates when missing", () => {
    expect(chatUsage({ prompt_eval_count: 120, eval_count: 30 }, "{}")).toEqual({ llmPromptTokens: 120, llmOutputTokens: 30 });
    expect(chatUsage({ message: { content: "x".repeat(40) } }, "y".repeat(400))).toEqual({ llmPromptTokens: 100, llmOutputTokens: 10 });
  });
});

describe("estimates", () => {
  it("holds more than the expected cost and scales with length", () => {
    const tenMin = audioHoldMicros(600, prices);
    expect(tenMin).toBeGreaterThan(expectedAudioCostMicros(10, prices));
    expect(audioHoldMicros(1200, prices)).toBeGreaterThan(tenMin);
    expect(audioHoldMicros(1, prices)).toBeGreaterThanOrEqual(2_000);
  });

  it("charges transcript imports without speech-to-text", () => {
    expect(transcriptHoldMicros(20_000, prices)).toBeLessThan(audioHoldMicros(30 * 60, prices));
  });

  it("derives duration from size and minutes from balance", () => {
    expect(durationFromBytes(8_000 * 300)).toBe(300);
    expect(durationFromBytes(10)).toBe(60);
    expect(minutesForBalance(0, prices)).toBe(0);
    expect(minutesForBalance(usdToMicros(5), prices)).toBeGreaterThan(100);
  });
});

describe("tokens", () => {
  it("rounds charges up to whole tokens and formats them", async () => {
    const { roundUpToToken, formatTokens, microsToTokens } = await import("../src/wallet/money.js");
    expect(roundUpToToken(0)).toBe(0);
    expect(roundUpToToken(1)).toBe(1_000);
    expect(roundUpToToken(1_000)).toBe(1_000);
    expect(roundUpToToken(61_200)).toBe(62_000);
    expect(microsToTokens(5_000_000)).toBe(5_000);
    expect(formatTokens(12_480_000)).toBe("12,480 tokens");
    expect(formatTokens(1_000)).toBe("1 token");
  });

  it("holds are whole tokens", () => {
    expect(audioHoldMicros(600, prices) % 1_000).toBe(0);
    expect(transcriptHoldMicros(12_345, prices) % 1_000).toBe(0);
  });
});

describe("money", () => {
  it("formats sub-cent amounts precisely", () => {
    expect(formatMicros(5_000_000)).toBe("$5.00");
    expect(formatMicros(-42_000)).toBe("-$0.04");
    expect(formatMicros(3_200)).toBe("$0.0032");
  });
});

describe("job billing", () => {
  function setup(assemble: () => Promise<unknown>) {
    const wallet = { settle: vi.fn(async () => ({ chargedMicros: 1 })), release: vi.fn(async () => undefined) };
    const queue = new ProcessingQueueService(
      { transcribe: vi.fn() } as never,
      { assemble: vi.fn(async () => { recordUsage({ llmPromptTokens: 1_000 }); return assemble(); }) } as never,
      { remove: vi.fn() } as never,
      { save: vi.fn() } as never,
      wallet as never,
    );
    const job = {
      id: "job-9",
      data: {
        kind: "transcript",
        transcript: { rawTranscript: "Hi", language: "en", durationMs: 1_000, utterances: [] },
        billing: { userId: "u1", holdMicros: 50_000 },
      } as ProcessingJob,
      updateProgress: vi.fn(),
      updateData: vi.fn(),
    };
    return { wallet, queue, job: job as unknown as Job<ProcessingJob, { stored: true }> };
  }

  it("settles the hold to the metered cost on success", async () => {
    const { wallet, queue, job } = setup(async () => ({ title: "t" }));
    await queue.runJob(job);
    expect(wallet.settle).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u1",
      jobId: "job-9",
      holdMicros: 50_000,
      actualMicros: expect.any(Number),
    }));
    const actual = (wallet.settle.mock.calls[0] as unknown as [{ actualMicros: number; metadata: { usage: { llmPromptTokens: number } } }])[0];
    expect(actual.metadata.usage.llmPromptTokens).toBe(1_000);
    expect(wallet.release).not.toHaveBeenCalled();
  });

  it("releases the whole hold when processing fails", async () => {
    const { wallet, queue, job } = setup(async () => { throw new Error("LLM down"); });
    await expect(queue.runJob(job)).rejects.toThrow("LLM down");
    expect(wallet.release).toHaveBeenCalledWith("u1", "job-9", 50_000, expect.anything());
    expect(wallet.settle).not.toHaveBeenCalled();
  });
});
