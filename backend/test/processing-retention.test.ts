import { describe, expect, it, vi } from "vitest";
import {
  processingQueueName,
  ProcessingQueueService,
  RESULT_TTL_MS,
} from "../src/processing/processing-queue.service.js";

describe("temporary processing result retention", () => {
  it("isolates workers by a Redis-safe host scope", () => {
    expect(processingQueueName("backend.host:3000")).toBe(
      "conversation-processing-backend_host_3000",
    );
  });

  it("actively removes completed and failed jobs older than the result TTL", async () => {
    expect(RESULT_TTL_MS).toBe(4 * 60 * 60_000);
    const clean = vi.fn().mockResolvedValue([]);
    const service = new ProcessingQueueService(
      {} as never,
      {} as never,
      {} as never,
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
  });
});
