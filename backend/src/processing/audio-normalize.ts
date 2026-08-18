import { join } from "node:path";
import {
  computeFfmpegTimeoutMs,
  ffmpegAvailable,
  probeAudio,
  runFfmpeg,
  type AudioProbe,
} from "./audio-probe.js";

export type NormalizedAudio = {
  path: string;
  mimetype: string;
  boosted: boolean;
  probe: AudioProbe;
};

function parseMeanVolume(stderr: string): number | null {
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function shouldSkipMonoReencode(
  channels: number | null,
  meanVolumeDb: number | null,
): boolean {
  const needsBoost = meanVolumeDb != null && meanVolumeDb < -28;
  return channels === 1 && !needsBoost;
}

/** App capture is already mono speech; skip a full-file decode on long recordings. */
export function shouldSkipVolumeDetect(channels: number | null): boolean {
  return channels === 1;
}

/**
 * If the clip is quiet (table/far-field) or stereo, boost and/or force mono for ASR.
 * Skips re-encode when capture is already mono and loud enough.
 */
export async function maybeNormalizeQuietAudio(
  audioPath: string,
  mimetype: string,
  directory: string,
  initialProbe?: AudioProbe,
): Promise<NormalizedAudio> {
  const probe = initialProbe ?? await probeAudio(audioPath);
  const ffmpegTimeoutMs = computeFfmpegTimeoutMs(probe.durationSec);

  if (!(await ffmpegAvailable())) {
    return { path: audioPath, mimetype, boosted: false, probe };
  }
  if (shouldSkipVolumeDetect(probe.channels)) {
    return { path: audioPath, mimetype, boosted: false, probe };
  }

  try {
    const detect = await runFfmpeg([
      "-hide_banner",
      "-i",
      audioPath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ], ffmpegTimeoutMs);
    const mean = parseMeanVolume(detect);
    const needsBoost = mean != null && mean < -28;

    if (shouldSkipMonoReencode(probe.channels, mean)) {
      return { path: audioPath, mimetype, boosted: false, probe };
    }

    const outputPath = join(directory, needsBoost ? "normalized.m4a" : "mono.m4a");
    const filters = needsBoost
      ? "pan=mono|c0=0.5*c0+0.5*c1,volume=6dB"
      : "pan=mono|c0=0.5*c0+0.5*c1";
    await runFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      audioPath,
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-af",
      filters,
      outputPath,
    ], ffmpegTimeoutMs);
    const normalizedProbe = await probeAudio(outputPath);
    return {
      path: outputPath,
      mimetype: "audio/mp4",
      boosted: needsBoost,
      probe: normalizedProbe.durationSec > 0 ? normalizedProbe : probe,
    };
  } catch {
    return { path: audioPath, mimetype, boosted: false, probe };
  }
}

export function isWeakTranscript(
  rawTranscript: string,
  durationMs: number,
): boolean {
  const text = rawTranscript.replace(/\s+/g, "").trim();
  if (!text) return true;
  const seconds = Math.max(1, durationMs / 1000);
  return text.length / seconds < 1.5;
}
