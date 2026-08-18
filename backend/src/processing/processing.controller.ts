import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { ProcessingJobState } from "../contracts";
import type { FastifyRequest } from "fastify";
import { stat } from "node:fs/promises";
import {
  assertWithinDurationLimit,
  assertWithinUploadLimit,
  maxUploadBytes,
  SINGLE_UPLOAD_MAX_BYTES,
} from "./audio-limits.js";
import { probeAudio } from "./audio-probe.js";
import { ProcessingQueueService } from "./processing-queue.service.js";
import { TempAudioService } from "./temp-audio.service.js";
import { UploadSessionService, uploadPartBytes } from "./upload-session.service.js";
import { isProcessingJobId } from "./job-capability.js";

export function parseKeyterms(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && item.length <= 80),
      ),
    ].slice(0, 40);
  } catch {
    return [];
  }
}

function parseDurationMs(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = "durationMs" in body ? Number(body.durationMs) : NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function limitError(error: unknown): never {
  const message = error instanceof Error ? error.message : "invalid upload";
  throw new BadRequestException(message);
}

type MultipartUploadPart = {
  type: string;
  fieldname?: string;
  value?: unknown;
  file?: NodeJS.ReadableStream;
  truncated?: boolean;
};

export async function saveUploadPartFromMultipart(
  parts: AsyncIterable<MultipartUploadPart>,
  savePart: (
    uploadId: string,
    partIndex: number,
    offset: number,
    stream: NodeJS.ReadableStream,
  ) => Promise<{ receivedBytes: number }>,
  maxPartBytes: number,
): Promise<{ receivedBytes: number }> {
  let uploadId = "";
  let partIndex = -1;
  let offset = -1;
  let saved: { receivedBytes: number } | null = null;

  for await (const part of parts) {
    if (part.type === "file") {
      const stream = part.file;
      if (!stream) {
        throw new BadRequestException("uploadId, partIndex, offset, and part file are required");
      }
      if (!uploadId || partIndex < 0 || offset < 0) {
        if (typeof (stream as { resume?: () => void }).resume === "function") {
          (stream as { resume: () => void }).resume();
        }
        throw new BadRequestException("uploadId, partIndex, offset, and part file are required");
      }
      const truncated = Boolean(
        part.truncated
        || (stream as { truncated?: boolean }).truncated,
      );
      if (truncated) {
        if (typeof (stream as { resume?: () => void }).resume === "function") {
          (stream as { resume: () => void }).resume();
        }
        throw new BadRequestException(
          `upload part exceeds the ${Math.round(maxPartBytes / (1024 * 1024))} MB part limit`,
        );
      }
      saved = await savePart(uploadId, partIndex, offset, stream);
      continue;
    }
    if (part.fieldname === "uploadId") {
      uploadId = String(part.value ?? "");
    } else if (part.fieldname === "partIndex") {
      partIndex = Number(part.value ?? -1);
    } else if (part.fieldname === "offset") {
      offset = Number(part.value ?? -1);
    }
  }

  if (!saved) {
    throw new BadRequestException("uploadId, partIndex, offset, and part file are required");
  }
  return saved;
}

@Controller("v1/conversations")
export class ProcessingController {
  constructor(
    private readonly queue: ProcessingQueueService,
    private readonly tempAudio: TempAudioService,
    private readonly uploads: UploadSessionService,
  ) {}

  @Post("process")
  @HttpCode(202)
  async process(@Req() request: FastifyRequest): Promise<ProcessingJobState> {
    if (!request.isMultipart()) {
      throw new BadRequestException("multipart/form-data is required");
    }

    let stored: { audioPath: string; directory: string } | null = null;
    let mimetype = "";
    let truncated = false;
    let keytermsRaw = "";
    let durationMs: number | undefined;

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (stored) {
            part.file.resume();
            continue;
          }
          if (!part.mimetype.startsWith("audio/")) {
            part.file.resume();
            throw new BadRequestException("only audio uploads are accepted");
          }
          mimetype = part.mimetype;
          stored = await this.tempAudio.createUpload(part.filename, part.file);
          truncated = Boolean(part.file.truncated);
        } else if (part.fieldname === "keyterms") {
          keytermsRaw = String(part.value ?? "");
        } else if (part.fieldname === "durationMs") {
          const parsed = Number(String(part.value ?? ""));
          if (Number.isFinite(parsed) && parsed > 0) durationMs = parsed;
        }
      }
    } catch (error) {
      if (stored) await this.tempAudio.remove(stored.directory);
      throw error;
    }

    if (!stored) {
      throw new BadRequestException("audio file is required");
    }
    if (truncated) {
      await this.tempAudio.remove(stored.directory);
      throw new BadRequestException(
        `audio file exceeds the ${Math.round(SINGLE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB single-upload limit; use multipart upload`,
      );
    }

    try {
      const fileStat = await stat(stored.audioPath);
      assertWithinUploadLimit(fileStat.size);
      if (fileStat.size > SINGLE_UPLOAD_MAX_BYTES) {
        await this.tempAudio.remove(stored.directory);
        throw new BadRequestException(
          `audio file exceeds the ${Math.round(SINGLE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB single-upload limit; use multipart upload`,
        );
      }
      const probe = await probeAudio(stored.audioPath);
      if (probe.durationSec > 0) {
        assertWithinDurationLimit(probe.durationSec);
      } else if (durationMs) {
        assertWithinDurationLimit(durationMs / 1000);
      }
    } catch (error) {
      await this.tempAudio.remove(stored.directory);
      if (error instanceof BadRequestException) throw error;
      limitError(error);
    }

    const jobId = await this.queue.enqueue({
      ...stored,
      mimetype,
      keyterms: parseKeyterms(keytermsRaw),
      ...(durationMs != null ? { durationMs } : {}),
    });
    return { status: "queued", jobId };
  }

  @Post("process/upload/init")
  @HttpCode(200)
  async initUpload(@Body() body: unknown): Promise<{
    uploadId: string;
    partSizeBytes: number;
  }> {
    if (typeof body !== "object" || body === null) {
      throw new BadRequestException("invalid upload init payload");
    }
    const filename = "filename" in body ? String(body.filename ?? "") : "";
    const mimetype = "mimetype" in body ? String(body.mimetype ?? "") : "";
    const totalBytes = Number("totalBytes" in body ? body.totalBytes : NaN);
    if (!filename.trim() || !mimetype.startsWith("audio/") || !Number.isFinite(totalBytes)) {
      throw new BadRequestException("filename, audio mimetype, and totalBytes are required");
    }
    try {
      const durationMs = parseDurationMs(body);
      return await this.uploads.initSession({
        filename,
        mimetype,
        totalBytes,
        ...(durationMs != null ? { durationMs } : {}),
        keyterms: parseKeyterms(
          "keyterms" in body && body.keyterms != null
            ? typeof body.keyterms === "string"
              ? body.keyterms
              : JSON.stringify(body.keyterms)
            : "",
        ),
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      limitError(error);
    }
  }

  @Post("process/upload/part")
  @HttpCode(200)
  async uploadPart(@Req() request: FastifyRequest): Promise<{ receivedBytes: number }> {
    if (!request.isMultipart()) {
      throw new BadRequestException("multipart/form-data is required");
    }
    return saveUploadPartFromMultipart(
      request.parts(),
      (uploadId, partIndex, offset, stream) =>
        this.uploads.savePart(uploadId, partIndex, offset, stream),
      uploadPartBytes(),
    );
  }

  @Post("process/upload/complete")
  @HttpCode(202)
  async completeUpload(@Body() body: unknown): Promise<ProcessingJobState> {
    const uploadId =
      typeof body === "object" && body !== null && "uploadId" in body
        ? String(body.uploadId ?? "")
        : "";
    if (!uploadId) {
      throw new BadRequestException("uploadId is required");
    }

    try {
      const assembled = await this.uploads.assemble(uploadId);
      const jobId = await this.queue.enqueue({
        audioPath: assembled.audioPath,
        directory: assembled.directory,
        mimetype: assembled.mimetype,
        keyterms: assembled.keyterms,
        ...(assembled.durationMs != null ? { durationMs: assembled.durationMs } : {}),
      });
      return { status: "queued", jobId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      limitError(error);
    }
  }

  @Post("process/status")
  @HttpCode(200)
  state(@Body() body: unknown): Promise<ProcessingJobState> {
    const jobId =
      typeof body === "object" && body !== null && "jobId" in body
        ? String(body.jobId)
        : "";
    if (!isProcessingJobId(jobId)) {
      throw new BadRequestException("invalid processing job ID");
    }
    return this.queue.state(jobId);
  }
}

export { maxUploadBytes };
