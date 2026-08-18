import { afterEach, describe, expect, it, vi } from "vitest";
import { SINGLE_UPLOAD_MAX_BYTES } from "../utils/processingTimeouts";

const getInfoAsync = vi.fn();
const readAsStringAsync = vi.fn();
const writeAsStringAsync = vi.fn();
const deleteAsync = vi.fn();

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  EncodingType: { Base64: "base64" },
  cacheDirectory: "file:///cache/",
}));

vi.mock("../db/profile", () => ({ getUserProfile: vi.fn().mockResolvedValue(null) }));
vi.mock("../db/insights", () => ({ listPeople: vi.fn().mockResolvedValue([]) }));
vi.mock("../db/pendingRecordings", () => ({
  getPendingRecording: vi.fn(),
  updatePendingUploadState: vi.fn(),
}));

const { getPendingRecording } = await import("../db/pendingRecordings");
const { startProcessing, processRecording, shouldPollExistingJob, shouldReuseUploadSession } = await import("./processing");

describe("startProcessing upload routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses single POST for files at or below 50 MB", async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: SINGLE_UPLOAD_MAX_BYTES });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "queued",
      jobId: "job-small",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await startProcessing("file:///small.m4a", { durationMs: 60_000 });

    expect(result).toEqual({ jobId: "job-small", uploadId: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/conversations/process");
  });

  it("uses multipart upload for files above 50 MB", async () => {
    const totalBytes = SINGLE_UPLOAD_MAX_BYTES + 1;
    getInfoAsync.mockResolvedValue({ exists: true, size: totalBytes });
    readAsStringAsync.mockResolvedValue("AAAA");
    writeAsStringAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/upload/init")) {
        return new Response(JSON.stringify({ uploadId: "upload-1", partSizeBytes: totalBytes }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/upload/part")) {
        return new Response(JSON.stringify({ receivedBytes: totalBytes }), { status: 200 });
      }
      if (url.includes("/upload/complete")) {
        return new Response(JSON.stringify({ status: "queued", jobId: "job-large" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await startProcessing("file:///large.m4a", { durationMs: 3_600_000 });

    expect(result).toEqual({ jobId: "job-large", uploadId: "upload-1" });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/upload/init"))).toBe(true);
    expect(urls.filter((url) => url.includes("/upload/part")).length).toBe(3);
    expect(urls.some((url) => url.includes("/upload/complete"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("reports progress before the first multipart part is read", async () => {
    const totalBytes = SINGLE_UPLOAD_MAX_BYTES + 1;
    getInfoAsync.mockResolvedValue({ exists: true, size: totalBytes });
    readAsStringAsync.mockResolvedValue("AAAA");
    writeAsStringAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/upload/init")) {
        return new Response(JSON.stringify({ uploadId: "upload-1", partSizeBytes: totalBytes }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/upload/part")) {
        return new Response(JSON.stringify({ receivedBytes: totalBytes }), { status: 200 });
      }
      if (url.includes("/upload/complete")) {
        return new Response(JSON.stringify({ status: "queued", jobId: "job-large" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: number[] = [];
    await startProcessing("file:///large.m4a", {
      durationMs: 3_600_000,
      onProgress: (value) => progress.push(value),
    });

    expect(progress[0]).toBe(1);
    expect(progress.some((value) => value >= 15)).toBe(true);
    expect(readAsStringAsync.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("failed-job continue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("polls in-flight jobs and restarts after a failed transcription", () => {
    expect(shouldPollExistingJob({
      processingJobId: "job-1",
      lastError: null,
    })).toBe(true);
    expect(shouldPollExistingJob({
      processingJobId: "job-1",
      lastError: "Transcription failed (408)",
    })).toBe(false);
    expect(shouldReuseUploadSession({
      processingJobId: "job-1",
      lastError: "Transcription failed (408)",
    })).toBe(false);
    expect(shouldReuseUploadSession({
      processingJobId: null,
      lastError: "Upload part failed",
    })).toBe(true);
  });

  it("does not poll a failed job and starts a new upload instead", async () => {
    vi.mocked(getPendingRecording).mockResolvedValue({
      id: "pending-1",
      recordingUri: "file:///hour.m4a",
      createdAt: "2026-08-18T00:00:00.000Z",
      lastError: "Transcription failed (408): SLOW_UPLOAD",
      uploadId: "upload-old",
      uploadPartIndex: 3,
      processingJobId: "job-old",
      durationMs: 3_600_000,
    });
    getInfoAsync.mockResolvedValue({ exists: true, size: 1_024 });

    const completeResult = {
      schemaVersion: 1 as const,
      title: "Standup",
      mainGoal: "Ship retry",
      summary: "Shipped the retry path",
      topics: [],
      language: "en",
      durationMs: 3_600_000,
      rawTranscript: "hello",
      cleanTranscript: "hello",
      romanHinglishTranscript: "hello",
      participants: [],
      segments: [],
      decisions: [],
      actionItems: [],
      embeddings: [],
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/process/status")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { jobId?: string };
        if (body.jobId === "job-old") {
          throw new Error("polled the failed job");
        }
        return new Response(JSON.stringify({
          status: "complete",
          jobId: "job-new",
          result: completeResult,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/v1/conversations/process")) {
        return new Response(JSON.stringify({
          status: "queued",
          jobId: "job-new",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processRecording("file:///hour.m4a", {
      pendingId: "pending-1",
      durationMs: 3_600_000,
      resumeUploadId: "upload-old",
      startPartIndex: 3,
    });

    expect(result.title).toBe("Standup");
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("/v1/conversations/process");
    expect(urls.some((url) => url.includes("/upload/"))).toBe(false);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ jobId: "job-new" });
  });

  it("reports queued jobs as 15% instead of staying at 0%", async () => {
    vi.mocked(getPendingRecording).mockResolvedValue({
      id: "pending-2",
      recordingUri: "file:///hour.m4a",
      createdAt: "2026-08-18T00:00:00.000Z",
      lastError: null,
      uploadId: "upload-1",
      uploadPartIndex: 3,
      processingJobId: "job-live",
      durationMs: 4_200_000,
    });

    const completeResult = {
      schemaVersion: 1 as const,
      title: "Standup",
      mainGoal: "Ship retry",
      summary: "Shipped the retry path",
      topics: [],
      language: "en",
      durationMs: 4_200_000,
      rawTranscript: "hello",
      cleanTranscript: "hello",
      romanHinglishTranscript: "hello",
      participants: [],
      segments: [],
      decisions: [],
      actionItems: [],
      embeddings: [],
    };

    let statusCalls = 0;
    const fetchMock = vi.fn(async () => {
      statusCalls += 1;
      if (statusCalls === 1) {
        return new Response(JSON.stringify({
          status: "queued",
          jobId: "job-live",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        status: "complete",
        jobId: "job-live",
        result: completeResult,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: number[] = [];
    const result = await processRecording("file:///hour.m4a", {
      pendingId: "pending-2",
      durationMs: 4_200_000,
      onProgress: (value) => progress.push(value),
    });

    expect(result.title).toBe("Standup");
    expect(progress).toContain(15);
  });
});
