import { join } from "node:path";
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

export async function splitAudioIntoChunks(
  audioPath: string,
  directory: string,
  probe: AudioProbe,
): Promise<AudioChunk[]> {
  if (!(await ffmpegAvailable()) || !shouldChunkAudio(probe.durationSec)) {
    return [{ path: audioPath, offsetSec: 0, durationSec: probe.durationSec }];
  }

  const chunkSec = chunkSizeSec();
  const chunks: AudioChunk[] = [];

  for (let offsetSec = 0; offsetSec < probe.durationSec; offsetSec += chunkSec) {
    const durationSec = Math.min(chunkSec, probe.durationSec - offsetSec);
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
  }

  return chunks;
}
