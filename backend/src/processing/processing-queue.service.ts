import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ProcessingJobState, ProcessingPreview } from "../contracts";
import { Job, Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { stat } from "node:fs/promises";
import { hostname } from "node:os";
import { audioHoldMicros, durationFromBytes, transcriptHoldMicros } from "../billing/estimate.js";
import { UsageMeter, withUsageMeter } from "../billing/usage-meter.js";
import { billingEnabled, WalletService } from "../wallet/wallet.service.js";
import { roundUpToToken } from "../wallet/money.js";
import { DeepgramService, type DeepgramResult } from "./deepgram.service.js";
import { OllamaService } from "./ollama.service.js";
import { TempAudioService } from "./temp-audio.service.js";
import { ProcessingResultStore } from "./processing-result.store.js";
import { createProcessingJobId } from "./job-capability.js";
import { describeErrorCause } from "./fetch-with-timeout.js";
import { speakerLabel } from "./speaker-label.js";

/** Who pays for a job and how much was reserved up front. */
export type JobBilling = { userId: string; holdMicros: number };

type AudioProcessingJob = {
  kind?: "audio";
  billing?: JobBilling;
  audioPath: string;
  directory: string;
  mimetype: string;
  keyterms?: string[];
  durationMs?: number;
  /** Calendar attendees for the recording, used as speaker hints. */
  attendees?: string[];
  preview?: ProcessingPreview;
};

/** Already-transcribed text (e.g. a Google Meet transcript); skips Deepgram. */
type TranscriptProcessingJob = {
  kind: "transcript";
  billing?: JobBilling;
  /** Shown in the wallet history next to the charge. */
  title?: string;
  transcript: DeepgramResult;
  preview?: ProcessingPreview;
};

export type ProcessingJob = AudioProcessingJob | TranscriptProcessingJob;

const PREVIEW_TRANSCRIPT_CHARS = 1_500;

export function transcriptPreview(
  utterances: Array<{ speaker: number; text: string }>,
  rawTranscript: string,
  speakerNames?: readonly string[],
): string {
  const text = utterances.length
    ? utterances.map((item) => `${speakerLabel(item.speaker, speakerNames)}: ${item.text.trim()}`).join("\n")
    : rawTranscript.trim();
  return text.length > PREVIEW_TRANSCRIPT_CHARS
    ? `${text.slice(0, PREVIEW_TRANSCRIPT_CHARS).trimEnd()}…`
    : text;
}

export type ProcessingJobStored = {
  stored: true;
};

export const RESULT_TTL_MS = 4 * 60 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

export function processingQueueName(
  scope = process.env.PROCESSING_QUEUE_SCOPE?.trim() || hostname(),
): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `conversation-processing-${safeScope}`;
}

@Injectable()
export class ProcessingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingQueueService.name);
  private connection?: Redis;
  private queue?: Queue<ProcessingJob, ProcessingJobStored>;
  private worker?: Worker<ProcessingJob, ProcessingJobStored>;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly deepgram: DeepgramService,
    private readonly ollama: OllamaService,
    private readonly tempAudio: TempAudioService,
    private readonly results: ProcessingResultStore,
    private readonly wallet: WalletService,
  ) {}

  onModuleInit(): void {
    const connection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    this.connection = connection;
    const queueName = processingQueueName();
    this.queue = new Queue(queueName, { connection });
    this.worker = new Worker<ProcessingJob, ProcessingJobStored>(
      queueName,
      (job: Job<ProcessingJob, ProcessingJobStored>) => this.runJob(job),
      {
        connection,
        concurrency: Number(process.env.PROCESSING_CONCURRENCY ?? 2),
      },
    );
    this.worker.on("failed", (job, error) => {
      // Covers stalled/crashed jobs too; same idempotency key as runJob's release, so never doubled.
      if (job) void this.releaseHold(job);
      const cause = describeErrorCause(error);
      this.logger.error(
        `Processing job ${job?.id ?? "unknown"} failed: ${error.message}${
          cause ? ` (${cause})` : ""
        }`,
      );
    });
    this.runResultSweep();
    this.sweepTimer = setInterval(() => {
      this.runResultSweep();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  /** Worker body; public for tests. Meters provider usage and settles the hold. */
  async runJob(job: Job<ProcessingJob, ProcessingJobStored>): Promise<ProcessingJobStored> {
    const meter = new UsageMeter();
    let stored: ProcessingJobStored;
    try {
      stored = await withUsageMeter(meter, () => this.process(job));
    } catch (error) {
      await this.releaseHold(job);
      throw error;
    }
    await this.settleHold(job, meter);
    return stored;
  }

  private async settleHold(job: Job<ProcessingJob, ProcessingJobStored>, meter: UsageMeter): Promise<void> {
    const billing = job.data.billing;
    if (!billing) return;
    // Whole tokens, rounded up: at most 1 token above the metered cost.
    const actualMicros = roundUpToToken(meter.costMicros());
    try {
      const { chargedMicros } = await this.wallet.settle({
        userId: billing.userId,
        jobId: String(job.id),
        holdMicros: billing.holdMicros,
        actualMicros,
        metadata: {
          kind: job.data.kind ?? "audio",
          title: job.data.preview?.title ?? (job.data.kind === "transcript" ? job.data.title : undefined),
          usage: meter.usage,
        },
      });
      this.logger.log(`Job ${job.id} charged ${chargedMicros} micros (held ${billing.holdMicros})`);
    } catch (error) {
      // The memory is already delivered; a failed settlement leaves the (larger) hold in place.
      this.logger.error(`Could not settle charge for job ${job.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async releaseHold(job: Job<ProcessingJob, ProcessingJobStored>): Promise<void> {
    const billing = job.data.billing;
    if (!billing) return;
    await this.wallet
      .release(billing.userId, String(job.id), billing.holdMicros, { reason: "processing_failed" })
      .catch((error: unknown) => {
        this.logger.error(`Could not release hold for job ${job.id}: ${error instanceof Error ? error.message : error}`);
      });
  }

  private async process(job: Job<ProcessingJob, ProcessingJobStored>): Promise<ProcessingJobStored> {
    const data = job.data;
    if (data.kind === "transcript") {
      return this.understandAndStore(job, data.transcript);
    }
    try {
      await job.updateProgress(15);
      const attendees = data.attendees ?? [];
      const transcript = await this.deepgram.transcribe(
        data.audioPath,
        data.mimetype,
        {
          keyterms: [...(data.keyterms ?? []), ...attendees],
          ...(data.durationMs && data.durationMs > 0
            ? { durationSec: data.durationMs / 1000 }
            : {}),
          onPrepProgress: async (percent) => {
            await job.updateProgress(percent);
          },
          onProgress: async (completed, total) => {
            await job.updateProgress(25 + Math.round((completed / total) * 45));
          },
        },
      );
      return await this.understandAndStore(
        job,
        attendees.length ? { ...transcript, speakerHints: attendees } : transcript,
      );
    } finally {
      await this.tempAudio.remove(data.directory);
    }
  }

  private async understandAndStore(
    job: Job<ProcessingJob, ProcessingJobStored>,
    transcript: DeepgramResult,
  ): Promise<ProcessingJobStored> {
    // Transcript is ready: let the app show it while the LLM passes run.
    let preview: ProcessingPreview = {
      transcript: transcriptPreview(
        transcript.utterances,
        transcript.rawTranscript,
        transcript.speakerNames,
      ),
    };
    await job.updateData({ ...job.data, preview });
    await job.updateProgress(70);
    let stagesDone = 0;
    const result = await this.ollama.assemble(transcript, {
      onStage: async (event) => {
        stagesDone += 1;
        if (event.stage === "insights") {
          preview = { ...preview, title: event.title, summary: event.summary };
          await job.updateData({ ...job.data, preview });
        }
        await job.updateProgress(70 + stagesDone * 12);
      },
    });
    await job.updateProgress(96);
    await this.results.save(String(job.id), result, RESULT_TTL_MS);
    await job.updateProgress(100);
    return { stored: true };
  }

  async sweepExpiredResults(): Promise<void> {
    const jobs = this.queue
      ? Promise.all([
          this.queue.clean(RESULT_TTL_MS, 1_000, "completed"),
          this.queue.clean(RESULT_TTL_MS, 1_000, "failed"),
        ])
      : Promise.resolve();
    await Promise.all([jobs, this.results.sweepExpired()]);
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

  /**
   * Queue AI work. With a payer, the estimated cost is reserved first (402 when
   * the wallet can't cover it) and settled to the metered cost when the job ends.
   */
  async enqueue(data: ProcessingJob, payer?: { userId: string }): Promise<string> {
    if (!this.queue) throw new ServiceUnavailableException("Processing queue is unavailable");
    const jobId = createProcessingJobId();
    let billing: JobBilling | undefined;
    try {
      if (payer && billingEnabled()) {
        const holdMicros = await this.estimateHold(data);
        await this.wallet.hold(payer.userId, jobId, holdMicros, { kind: data.kind ?? "audio" });
        billing = { userId: payer.userId, holdMicros };
      }
    } catch (error) {
      if (data.kind !== "transcript") await this.tempAudio.remove(data.directory);
      throw error;
    }
    try {
      const job = await this.queue.add("process", { ...data, ...(billing ? { billing } : {}) }, {
        jobId,
        attempts: 1,
        removeOnComplete: { age: RESULT_TTL_MS / 1_000, count: 100 },
        removeOnFail: { age: RESULT_TTL_MS / 1_000, count: 100 },
      });
      return String(job.id);
    } catch (error) {
      if (billing) await this.wallet.release(billing.userId, jobId, billing.holdMicros).catch(() => undefined);
      if (data.kind !== "transcript") await this.tempAudio.remove(data.directory);
      throw error;
    }
  }

  private async estimateHold(data: ProcessingJob): Promise<number> {
    if (data.kind === "transcript") return transcriptHoldMicros(data.transcript.rawTranscript.length);
    let durationSec = data.durationMs && data.durationMs > 0 ? data.durationMs / 1000 : 0;
    if (!durationSec) {
      const size = await stat(data.audioPath).then((info) => info.size).catch(() => 0);
      durationSec = durationFromBytes(size);
    }
    return audioHoldMicros(durationSec);
  }

  /** Throws 403 when a signed-in caller polls someone else's job. */
  async assertOwner(jobId: string, userId: string): Promise<void> {
    const job = await this.queue?.getJob(jobId);
    const owner = job?.data.billing?.userId;
    if (owner && owner !== userId) throw new ForbiddenException("This processing job belongs to another account");
  }

  async state(jobId: string): Promise<ProcessingJobState> {
    if (!this.queue) throw new ServiceUnavailableException("Processing queue is unavailable");
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: "failed", jobId, error: "Processing job expired or was not found" };
    const state = await job.getState();
    if (state === "completed") {
      const result = await this.results.take(jobId);
      await job.remove();
      if (!result) {
        return { status: "failed", jobId, error: "Processing job expired or was not found" };
      }
      return { status: "complete", jobId, result };
    }
    if (state === "failed") {
      const error = job.failedReason || "Processing failed";
      await job.remove();
      return { status: "failed", jobId, error };
    }
    if (state === "active") {
      const progress = typeof job.progress === "number" ? job.progress : 0;
      return job.data.preview
        ? { status: "processing", jobId, progress, preview: job.data.preview }
        : { status: "processing", jobId, progress };
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
