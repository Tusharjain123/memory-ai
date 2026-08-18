import { describe, expect, it, vi } from "vitest";
import type { ProcessedConversation } from "../src/contracts.js";
import {
  processingQueueName,
  ProcessingQueueService,
  RESULT_TTL_MS,
} from "../src/processing/processing-queue.service.js";

const conversation: ProcessedConversation = {
  schemaVersion: 2,
  title: "Standup",
  mainGoal: "Plan deploy",
  summary: "Rahul will deploy.",
  topics: ["deploy"],
  language: "hi",
  durationMs: 2_000,
  rawTranscript: "Aaj deploy karenge.",
  cleanTranscript: "We will deploy today.",
  romanHinglishTranscript: "Aaj deploy karenge.",
  participants: [],
  segments: [],
  decisions: [],
  commitments: [],
  memoryCandidates: [],
  actionItems: [],
  embeddings: [],
};

describe("temporary processing result retention", () => {
  it("isolates workers by a Redis-safe host scope", () => {
    expect(processingQueueName("backend.host:3000")).toBe(
      "conversation-processing-backend_host_3000",
    );
  });

  it("actively removes completed and failed jobs older than the result TTL", async () => {
    expect(RESULT_TTL_MS).toBe(4 * 60 * 60_000);
    const clean = vi.fn().mockResolvedValue([]);
    const sweepExpired = vi.fn().mockResolvedValue(undefined);
    const service = new ProcessingQueueService(
      {} as never,
      {} as never,
      {} as never,
      { sweepExpired } as never,
    );
    Object.assign(service, { queue: { clean } });

    await service.sweepExpiredResults();

    expect(clean).toHaveBeenCalledTimes(2);
    expect(clean).toHaveBeenCalledWith(
      RESULT_TTL_MS,
      1_000,
      "completed",
    );
    expect(clean).toHaveBeenCalledWith(
      RESULT_TTL_MS,
      1_000,
      "failed",
    );
    expect(sweepExpired).toHaveBeenCalledTimes(1);
  });

  it("loads completed jobs from the result store instead of Redis returnvalue", async () => {
    const take = vi.fn().mockResolvedValue(conversation);
    const remove = vi.fn().mockResolvedValue(undefined);
    const service = new ProcessingQueueService(
      {} as never,
      {} as never,
      {} as never,
      { take } as never,
    );
    Object.assign(service, {
      queue: {
        getJob: vi.fn().mockResolvedValue({
          returnvalue: { stored: true },
          getState: async () => "completed",
          remove,
        }),
      },
    });

    const state = await service.state("job-1");

    expect(take).toHaveBeenCalledWith("job-1");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      status: "complete",
      jobId: "job-1",
      result: conversation,
    });
  });

  it("fails completed jobs whose handoff row is missing", async () => {
    const service = new ProcessingQueueService(
      {} as never,
      {} as never,
      {} as never,
      { take: vi.fn().mockResolvedValue(null) } as never,
    );
    Object.assign(service, {
      queue: {
        getJob: vi.fn().mockResolvedValue({
          returnvalue: { stored: true },
          getState: async () => "completed",
          remove: vi.fn(),
        }),
      },
    });

    await expect(service.state("job-1")).resolves.toEqual({
      status: "failed",
      jobId: "job-1",
      error: "Processing job expired or was not found",
    });
  });
});
