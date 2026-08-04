import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  ProcessedConversation,
  ProcessingJobState,
} from "../contracts";
import { Job, Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { DeepgramService } from "./deepgram.service.js";
import { OllamaService } from "./ollama.service.js";
import { TempAudioService } from "./temp-audio.service.js";
import { createProcessingJobId } from "./job-capability.js";

type ProcessingJob = {
  audioPath: string;
  directory: string;
  mimetype: string;
};

const QUEUE_NAME = "conversation-processing";
export const RESULT_TTL_MS = 60 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class ProcessingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingQueueService.name);
  private connection?: Redis;
  private queue?: Queue<ProcessingJob, ProcessedConversation>;
  private worker?: Worker<ProcessingJob, ProcessedConversation>;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly deepgram: DeepgramService,
    private readonly ollama: OllamaService,
    private readonly tempAudio: TempAudioService,
  ) {}

  onModuleInit(): void {
    const connection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    this.connection = connection;
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker<ProcessingJob, ProcessedConversation>(
      QUEUE_NAME,
      async (job: Job<ProcessingJob>) => {
        try {
          await job.updateProgress(10);
          const transcript = await this.deepgram.transcribe(job.data.audioPath, job.data.mimetype);
          await job.updateProgress(55);
          const result = await this.ollama.assemble(transcript);
          await job.updateProgress(100);
          return result;
        } finally {
          await this.tempAudio.remove(job.data.directory);
        }
      },
      {
        connection,
        concurrency: Number(process.env.PROCESSING_CONCURRENCY ?? 2),
      },
    );
    this.runResultSweep();
    this.sweepTimer = setInterval(() => {
      this.runResultSweep();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  async sweepExpiredResults(): Promise<void> {
    if (!this.queue) return;
    await Promise.all([
      this.queue.clean(RESULT_TTL_MS, 1_000, "completed"),
      this.queue.clean(RESULT_TTL_MS, 1_000, "failed"),
    ]);
  }

  private runResultSweep(): void {
    void this.sweepExpiredResults().catch((error: unknown) => {
      this.logger.warn(
        `Temporary result cleanup failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    });
  }

  async enqueue(data: ProcessingJob): Promise<string> {
    if (!this.queue) throw new ServiceUnavailableException("Processing queue is unavailable");
    try {
      const job = await this.queue.add("process", data, {
        jobId: createProcessingJobId(),
        attempts: 1,
        removeOnComplete: { age: RESULT_TTL_MS / 1_000, count: 100 },
        removeOnFail: { age: RESULT_TTL_MS / 1_000, count: 100 },
      });
      return String(job.id);
    } catch (error) {
      await this.tempAudio.remove(data.directory);
      throw error;
    }
  }

  async state(jobId: string): Promise<ProcessingJobState> {
    if (!this.queue) throw new ServiceUnavailableException("Processing queue is unavailable");
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: "failed", jobId, error: "Processing job expired or was not found" };
    const state = await job.getState();
    if (state === "completed") {
      const result = job.returnvalue;
      await job.remove();
      return { status: "complete", jobId, result };
    }
    if (state === "failed") {
      const error = job.failedReason || "Processing failed";
      await job.remove();
      return { status: "failed", jobId, error };
    }
    if (state === "active") {
      const progress = typeof job.progress === "number" ? job.progress : 0;
      return { status: "processing", jobId, progress };
    }
    return { status: "queued", jobId };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
