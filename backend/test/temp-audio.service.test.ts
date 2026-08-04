import { access } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { TempAudioService } from "../src/processing/temp-audio.service.js";

describe("TempAudioService", () => {
  const service = new TempAudioService();

  it("removes audio after successful processing", async () => {
    let directory = "";
    await service.withUpload("sample.m4a", Readable.from("private audio"), async (path) => {
      directory = dirname(path);
      await expect(access(path)).resolves.toBeUndefined();
      return "done";
    });
    await expect(access(directory)).rejects.toThrow();
  });

  it("removes audio after failed processing", async () => {
    let directory = "";
    await expect(
      service.withUpload("sample.m4a", Readable.from("private audio"), (path) => {
        directory = dirname(path);
        return Promise.reject(new Error("processor failed"));
      }),
    ).rejects.toThrow("processor failed");
    await expect(access(directory)).rejects.toThrow();
  });
});
