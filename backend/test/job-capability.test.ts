import { describe, expect, it } from "vitest";
import {
  createProcessingJobId,
  isProcessingJobId,
} from "../src/processing/job-capability.js";

describe("processing job capability IDs", () => {
  it("creates unguessable UUIDv4 identifiers", () => {
    const ids = new Set(
      Array.from({ length: 1_000 }, () => createProcessingJobId()),
    );
    expect(ids.size).toBe(1_000);
    for (const id of ids) expect(isProcessingJobId(id)).toBe(true);
  });

  it("rejects sequential and malformed identifiers", () => {
    expect(isProcessingJobId("1")).toBe(false);
    expect(isProcessingJobId("../1")).toBe(false);
    expect(isProcessingJobId("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
