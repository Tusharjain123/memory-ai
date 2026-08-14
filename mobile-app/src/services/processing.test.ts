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

const { startProcessing } = await import("./processing");

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
});
