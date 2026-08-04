import { describe, expect, it, vi } from "vitest";
import {
  ProcessingQueueService,
  RESULT_TTL_MS,
} from "../src/processing/processing-queue.service.js";

describe("temporary processing result retention", () => {
  it("actively removes completed and failed jobs older than one hour", async () => {
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
