import { Injectable, OnModuleInit } from "@nestjs/common";
import { mkdtemp, open, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";

@Injectable()
export class TempAudioService implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    const entries = await readdir(tmpdir(), { withFileTypes: true });
    const cutoff = Date.now() - 60 * 60_000;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("memory-ai-"))
        .map(async (entry) => {
          const directory = join(tmpdir(), entry.name);
          const details = await stat(directory);
          if (details.mtimeMs < cutoff) await this.remove(directory);
        }),
    );
  }

  async createUpload(
    filename: string,
    stream: NodeJS.ReadableStream,
  ): Promise<{ audioPath: string; directory: string }> {
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-"));
    const candidate = extname(filename).toLowerCase();
    const extension = /^\.[a-z0-9]{1,10}$/.test(candidate) ? candidate : ".audio";
    const audioPath = join(directory, `input${extension}`);
    try {
      const file = await open(audioPath, "wx", 0o600);
      try {
        await pipeline(stream, file.createWriteStream());
      } finally {
        await file.close().catch(() => undefined);
      }
      return { audioPath, directory };
    } catch (error) {
      await this.remove(directory);
      throw error;
    }
  }

  async remove(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
  }

  async withUpload<T>(
    filename: string,
    stream: NodeJS.ReadableStream,
    work: (path: string) => Promise<T>,
  ): Promise<T> {
    const { directory, audioPath } = await this.createUpload(filename, stream);
    try {
      return await work(audioPath);
    } finally {
      await this.remove(directory);
    }
  }
}
