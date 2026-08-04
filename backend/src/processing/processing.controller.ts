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
import { ProcessingQueueService } from "./processing-queue.service.js";
import { TempAudioService } from "./temp-audio.service.js";
import { isProcessingJobId } from "./job-capability.js";

@Controller("v1/conversations")
export class ProcessingController {
  constructor(
    private readonly queue: ProcessingQueueService,
    private readonly tempAudio: TempAudioService,
  ) {}

  @Post("process")
  @HttpCode(202)
  async process(@Req() request: FastifyRequest): Promise<ProcessingJobState> {
    if (!request.isMultipart()) {
      throw new BadRequestException("multipart/form-data is required");
    }
    const upload = await request.file();
    if (!upload) {
      throw new BadRequestException("audio file is required");
    }
    if (!upload.mimetype.startsWith("audio/")) {
      upload.file.resume();
      throw new BadRequestException("only audio uploads are accepted");
    }
    const stored = await this.tempAudio.createUpload(upload.filename, upload.file);
    if (upload.file.truncated) {
      await this.tempAudio.remove(stored.directory);
      throw new BadRequestException("audio file exceeds the 150 MB limit");
    }
    const jobId = await this.queue.enqueue({ ...stored, mimetype: upload.mimetype });
    return { status: "queued", jobId };
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
