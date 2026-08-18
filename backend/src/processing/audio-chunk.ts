import { join } from "node:path";
import { readdir } from "node:fs/promises";
import {
  chunkSizeSec,
  computeFfmpegTimeoutMs,
  ffmpegAvailable,
  runFfmpeg,
  shouldChunkAudio,
  type AudioProbe,
} from "./audio-probe.js";

export type AudioChunk = {
  path: string;
  offsetSec: number;
  durationSec: number;
};

export { shouldChunkAudio, chunkSizeSec };

export const SEGMENT_FILE_PATTERN = /^seg-\d{3}\.m4a$/;

export function resolveChunkDurationSec(
  probe: AudioProbe,
  fallbackDurationSec = 0,
): number {
  return probe.durationSec > 0 ? probe.durationSec : Math.max(0, fallbackDurationSec);
}

export function mapSegmentFilesToChunks(
  filenames: string[],
  directory: string,
  chunkSec: number,
  totalDurationSec: number,
): AudioChunk[] {
  const names = filenames.filter((name) => SEGMENT_FILE_PATTERN.test(name)).sort();
  return names.map((name, index) => {
    const offsetSec = index * chunkSec;
    const remaining = totalDurationSec - offsetSec;
    const durationSec = remaining > 0 ? Math.min(chunkSec, remaining) : chunkSec;
    return { path: join(directory, name), offsetSec, durationSec };
  });
}

export async function splitAudioIntoChunks(
  audioPath: string,
  directory: string,
  probe: AudioProbe,
  fallbackDurationSec = 0,
  onChunkProgress?: (completed: number, total: number) => void | Promise<void>,
): Promise<AudioChunk[]> {
  const totalDurationSec = resolveChunkDurationSec(probe, fallbackDurationSec);
  if (!(await ffmpegAvailable()) || !shouldChunkAudio(totalDurationSec)) {
    return [{ path: audioPath, offsetSec: 0, durationSec: totalDurationSec }];
  }

  const chunkSec = chunkSizeSec();
  const copied = await splitWithSegmentCopy(
    audioPath,
    directory,
    chunkSec,
    totalDurationSec,
  );
  if (copied && copied.length > 1) {
    await onChunkProgress?.(copied.length, copied.length);
    return copied;
  }

  const chunks: AudioChunk[] = [];
  const expected = Math.max(1, Math.ceil(totalDurationSec / chunkSec));
  for (let offsetSec = 0; offsetSec < totalDurationSec; offsetSec += chunkSec) {
    const durationSec = Math.min(chunkSec, totalDurationSec - offsetSec);
    const outputPath = join(directory, `chunk-${offsetSec}.m4a`);
    await runFfmpeg([
      "-hide_banner",
      "-y",
      "-ss",
      String(offsetSec),
      "-i",
      audioPath,
      "-t",
      String(durationSec),
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ], computeFfmpegTimeoutMs(durationSec));
    chunks.push({ path: outputPath, offsetSec, durationSec });
    await onChunkProgress?.(chunks.length, expected);
  }

  return chunks;
}

async function splitWithSegmentCopy(
  audioPath: string,
  directory: string,
  chunkSec: number,
  totalDurationSec: number,
): Promise<AudioChunk[] | null> {
  const pattern = join(directory, "seg-%03d.m4a");
  try {
    await runFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkSec),
      "-reset_timestamps",
      "1",
      "-c",
      "copy",
      pattern,
    ], computeFfmpegTimeoutMs(totalDurationSec));
  } catch {
    return null;
  }
  const filenames = await readdir(directory);
  const chunks = mapSegmentFilesToChunks(filenames, directory, chunkSec, totalDurationSec);
  return chunks.length > 1 ? chunks : null;
}
