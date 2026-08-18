import { describe, expect, it } from "vitest";
import {
  computePollDeadlineMs,
  MAX_RECORDING_MS,
  processingStageLabel,
  QUEUED_PROGRESS,
  UPLOAD_PROGRESS_START,
  uploadPartProgress,
} from "./processingTimeouts";

describe("computePollDeadlineMs", () => {
  it("defaults to 30 minutes when duration is unknown", () => {
    expect(computePollDeadlineMs()).toBe(30 * 60_000);
    expect(computePollDeadlineMs(0)).toBe(30 * 60_000);
  });

  it("scales with duration up to the 150 minute cap", () => {
    expect(computePollDeadlineMs(600)).toBe(600 * 2_000 + 180_000);
    expect(computePollDeadlineMs(MAX_RECORDING_MS / 1000)).toBe(150 * 60_000);
  });
});

describe("MAX_RECORDING_MS", () => {
  it("caps recordings at 3 hours", () => {
    expect(MAX_RECORDING_MS).toBe(3 * 60 * 60_000);
  });
});

describe("upload progress", () => {
  it("starts at 1% before the first part and reaches 15% when upload completes", () => {
    expect(uploadPartProgress(0, 4)).toBe(UPLOAD_PROGRESS_START);
    expect(uploadPartProgress(4, 4)).toBe(15);
    expect(processingStageLabel(1)).toBe("Uploading");
    expect(processingStageLabel(QUEUED_PROGRESS)).toBe("Preparing");
    expect(processingStageLabel(40)).toBe("Transcribing");
  });
});
