import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { saveUploadPartFromMultipart } from "../src/processing/processing.controller.js";

describe("saveUploadPartFromMultipart", () => {
  it("saves the file stream before the multipart iterator finishes", async () => {
    let iterating = true;
    let savedDuringIteration = false;
    const savePart = vi.fn(async (_id: string, _index: number, _offset: number, stream: NodeJS.ReadableStream) => {
      savedDuringIteration = iterating;
      stream.resume();
      return { receivedBytes: 5 };
    });

    async function* parts() {
      yield { type: "field", fieldname: "uploadId", value: "upload-1" };
      yield { type: "field", fieldname: "partIndex", value: "0" };
      yield { type: "field", fieldname: "offset", value: "0" };
      yield { type: "file", file: Readable.from(Buffer.from("hello")) };
      iterating = false;
    }

    const result = await saveUploadPartFromMultipart(parts(), savePart, 4_194_304);
    expect(result).toEqual({ receivedBytes: 5 });
    expect(savedDuringIteration).toBe(true);
    expect(savePart).toHaveBeenCalledTimes(1);
  });

  it("rejects a file part that arrives before metadata", async () => {
    const savePart = vi.fn();
    async function* parts() {
      yield { type: "file", file: Readable.from(Buffer.from("hello")) };
    }
    await expect(
      saveUploadPartFromMultipart(parts(), savePart, 4_194_304),
    ).rejects.toThrow(/uploadId, partIndex, offset/);
    expect(savePart).not.toHaveBeenCalled();
  });
});
