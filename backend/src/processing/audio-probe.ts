import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export type AudioProbe = {
  durationSec: number;
  channels: number | null;
};

export function resolveFfmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require("ffmpeg-static") as string | null;
    return ffmpegStatic || null;
  } catch {
    return null;
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  const bin = resolveFfmpegPath();
  if (!bin) return false;
  try {
    await access(bin);
    return true;
  } catch {
    return false;
  }
}

export function runFfmpeg(args: string[], timeoutMs: number): Promise<string> {
  const bin = resolveFfmpegPath();
  if (!bin) return Promise.reject(new Error("ffmpeg-static is unavailable"));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`));
    });
  });
}

function parseDurationSec(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3_600 + minutes * 60 + seconds;
}

function parseChannels(stderr: string): number | null {
  const stereo = stderr.match(/\b(stereo|2 channels)\b/i);
  if (stereo) return 2;
  const mono = stderr.match(/\b(mono|1 channel)\b/i);
  if (mono) return 1;
  const channelMatch = stderr.match(/Audio:.*?(?:,\s*(\d+)\s*channels\b|\b(stereo|mono)\b)/i);
  if (channelMatch?.[1]) {
    const parsed = Number(channelMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (channelMatch?.[2]?.toLowerCase() === "stereo") return 2;
  if (channelMatch?.[2]?.toLowerCase() === "mono") return 1;
  return null;
}

export async function probeAudio(audioPath: string): Promise<AudioProbe> {
  if (!(await ffmpegAvailable())) {
    return { durationSec: 0, channels: null };
  }
  try {
    await runFfmpeg(
      ["-hide_banner", "-i", audioPath],
      computeFfmpegTimeoutMs(0),
    );
    return { durationSec: 0, channels: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      durationSec: parseDurationSec(message) ?? 0,
      channels: parseChannels(message),
    };
  }
}

function envFloorMs(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** max(120s, duration*0.5+30s), capped at 20 min; env is a floor. */
export function computeFfmpegTimeoutMs(durationSec: number): number {
  const scaled = Math.min(
    1_200_000,
    Math.max(120_000, durationSec * 500 + 30_000),
  );
  return Math.max(scaled, envFloorMs("FFMPEG_TIMEOUT_MS", 120_000));
}

/** max(600s, duration*1.5+60s), capped at 9 min; env is a floor. */
export function computeDeepgramTimeoutMs(durationSec: number): number {
  const scaled = Math.min(
    540_000,
    Math.max(600_000, durationSec * 1_500 + 60_000),
  );
  return Math.max(scaled, envFloorMs("DEEPGRAM_TIMEOUT_MS", 600_000));
}

/** max(300s, duration*0.3+120s), capped at 20 min; env is a floor. */
export function computeOllamaChatTimeoutMs(durationSec: number): number {
  const scaled = Math.min(
    1_200_000,
    Math.max(300_000, durationSec * 300 + 120_000),
  );
  return Math.max(scaled, envFloorMs("OLLAMA_CHAT_TIMEOUT_MS", 300_000));
}

/** max(900s, duration*2+180s), capped at 150 min. */
export function computePollDeadlineMs(durationSec?: number): number {
  if (!durationSec || durationSec <= 0) {
    return 30 * 60_000;
  }
  return Math.min(
    150 * 60_000,
    Math.max(900_000, durationSec * 2_000 + 180_000),
  );
}

export function chunkThresholdSec(): number {
  const parsed = Number(process.env.DEEPGRAM_CHUNK_THRESHOLD_SEC);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
}

export function chunkSizeSec(): number {
  const parsed = Number(process.env.DEEPGRAM_CHUNK_SEC);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
}

export function chunkConcurrency(): number {
  const parsed = Number(process.env.DEEPGRAM_CHUNK_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 4) : 2;
}

export function shouldChunkAudio(durationSec: number): boolean {
  return durationSec > chunkThresholdSec();
}
