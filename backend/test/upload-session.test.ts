import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "../src/processing/audio-limits.js";
import { UploadSessionService } from "../src/processing/upload-session.service.js";

vi.mock("../src/processing/audio-probe.js", () => ({
  probeAudio: vi.fn().mockResolvedValue({ durationSec: 0, channels: null }),
}));

describe("UploadSessionService", () => {
  const service = new UploadSessionService();

  it("init rejects uploads above 200 MB", async () => {
    await expect(service.initSession({
      filename: "big.m4a",
      mimetype: "audio/mp4",
      totalBytes: MAX_UPLOAD_BYTES + 1,
    })).rejects.toThrow(/200 MB/);
  });

  it("assembles a single-part upload", async () => {
    const payload = Buffer.from("hello world");
    const { uploadId } = await service.initSession({
      filename: "sample.m4a",
      mimetype: "audio/mp4",
      totalBytes: payload.length,
      durationMs: 1000,
    });

    await service.savePart(uploadId, 0, 0, Readable.from(payload));
    const assembled = await service.assemble(uploadId);
    const contents = await readFile(assembled.audioPath);
    expect(contents.toString()).toBe("hello world");
    await service.removeSessionDirectory(assembled.directory);
  });

  it("allows idempotent part re-uploads", async () => {
    process.env.UPLOAD_PART_BYTES = "8";
    try {
      const partSize = 8;
    const partA = Buffer.alloc(partSize, "a");
    const partB = Buffer.from("tail");
    const totalBytes = partA.length + partB.length;
    const { uploadId } = await service.initSession({
      filename: "sample.m4a",
      mimetype: "audio/mp4",
      totalBytes,
      durationMs: 60_000,
    });

    await service.savePart(uploadId, 0, 0, Readable.from(partA));
    await service.savePart(uploadId, 1, partSize, Readable.from(partB));
    await service.savePart(uploadId, 0, 0, Readable.from(partA));

    const assembled = await service.assemble(uploadId);
    const contents = await readFile(assembled.audioPath);
    expect(contents.length).toBe(totalBytes);
    expect(contents.subarray(0, 5).toString()).toBe("aaaaa");
    expect(contents.subarray(partSize).toString()).toBe("tail");
    await service.removeSessionDirectory(assembled.directory);
    } finally {
      delete process.env.UPLOAD_PART_BYTES;
    }
  });
});
