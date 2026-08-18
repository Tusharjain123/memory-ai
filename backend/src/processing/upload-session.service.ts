import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import {
  assertWithinDurationLimit,
  assertWithinUploadLimit,
  maxUploadBytes,
  uploadPartBytes,
} from "./audio-limits.js";
import { probeAudio } from "./audio-probe.js";

export type UploadManifest = {
  uploadId: string;
  filename: string;
  mimetype: string;
  totalBytes: number;
  partSizeBytes: number;
  durationMs: number | null;
  keyterms: string[];
  receivedParts: Record<string, number>;
  createdAt: string;
};

export type InitUploadInput = {
  filename: string;
  totalBytes: number;
  mimetype: string;
  durationMs?: number;
  keyterms?: string[];
};

export type AssembledUpload = {
  audioPath: string;
  directory: string;
  mimetype: string;
  keyterms: string[];
  durationMs: number | null;
};

const SESSION_TTL_MS = 24 * 60 * 60_000;

@Injectable()
export class UploadSessionService implements OnModuleInit {
  private readonly rootPrefix = "memory-ai-upload-";

  async onModuleInit(): Promise<void> {
    const entries = await readdir(tmpdir(), { withFileTypes: true });
    const cutoff = Date.now() - SESSION_TTL_MS;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(this.rootPrefix))
        .map(async (entry) => {
          const directory = join(tmpdir(), entry.name);
          const details = await stat(directory);
          if (details.mtimeMs < cutoff) await this.removeSessionDirectory(directory);
        }),
    );
  }

  async initSession(input: InitUploadInput): Promise<{
    uploadId: string;
    partSizeBytes: number;
  }> {
    if (!input.mimetype.startsWith("audio/")) {
      throw new BadRequestException("only audio uploads are accepted");
    }
    assertWithinUploadLimit(input.totalBytes);
    if (input.durationMs != null && input.durationMs > 0) {
      assertWithinDurationLimit(input.durationMs / 1000);
    }

    const directory = await mkdtemp(join(tmpdir(), this.rootPrefix));
    const uploadId = randomUUID();
    const partSizeBytes = uploadPartBytes();
    const manifest: UploadManifest = {
      uploadId,
      filename: input.filename,
      mimetype: input.mimetype,
      totalBytes: input.totalBytes,
      partSizeBytes,
      durationMs: input.durationMs ?? null,
      keyterms: input.keyterms ?? [],
      receivedParts: {},
      createdAt: new Date().toISOString(),
    };
    await mkdir(join(directory, "parts"), { recursive: true });
    await this.writeManifest(directory, manifest);
    return { uploadId, partSizeBytes };
  }

  async savePart(
    uploadId: string,
    partIndex: number,
    offset: number,
    stream: NodeJS.ReadableStream,
  ): Promise<{ receivedBytes: number }> {
    const { directory, manifest } = await this.loadSession(uploadId);
    const expectedOffset = partIndex * manifest.partSizeBytes;
    if (offset !== expectedOffset) {
      throw new BadRequestException(
        `part ${partIndex} offset must be ${expectedOffset}, got ${offset}`,
      );
    }

    const partPath = join(directory, "parts", `${String(partIndex).padStart(4, "0")}.bin`);
    const file = await open(partPath, "w", 0o600);
    try {
      await pipeline(stream, file.createWriteStream());
    } finally {
      await file.close().catch(() => undefined);
    }
    const partStat = await stat(partPath);
    manifest.receivedParts[String(partIndex)] = partStat.size;
    await this.writeManifest(directory, manifest);
    return { receivedBytes: partStat.size };
  }

  async assemble(uploadId: string): Promise<AssembledUpload> {
    const { directory, manifest } = await this.loadSession(uploadId);
    const partCount = Math.ceil(manifest.totalBytes / manifest.partSizeBytes);
    let assembledBytes = 0;
    for (let index = 0; index < partCount; index += 1) {
      const size = manifest.receivedParts[String(index)];
      if (!size || size <= 0) {
        throw new BadRequestException(`missing upload part ${index}`);
      }
      assembledBytes += size;
    }
    if (assembledBytes !== manifest.totalBytes) {
      throw new BadRequestException(
        `upload size mismatch: expected ${manifest.totalBytes}, got ${assembledBytes}`,
      );
    }

    const candidate = extname(manifest.filename).toLowerCase();
    const extension = /^\.[a-z0-9]{1,10}$/.test(candidate) ? candidate : ".m4a";
    const audioPath = join(directory, `input${extension}`);
    const writeStream = createWriteStream(audioPath, { mode: 0o600 });
    try {
      for (let index = 0; index < partCount; index += 1) {
        const partPath = join(directory, "parts", `${String(index).padStart(4, "0")}.bin`);
        await pipeline(createReadStream(partPath), writeStream, { end: false });
      }
      writeStream.end();
      await finished(writeStream);
    } catch (error) {
      writeStream.destroy();
      throw error;
    }

    const assembledStat = await stat(audioPath);
    assertWithinUploadLimit(assembledStat.size);
    const probe = await probeAudio(audioPath);
    if (probe.durationSec > 0) {
      assertWithinDurationLimit(probe.durationSec);
    } else if (manifest.durationMs != null && manifest.durationMs > 0) {
      assertWithinDurationLimit(manifest.durationMs / 1000);
    }

    await rm(join(directory, "parts"), { recursive: true, force: true });
    return {
      audioPath,
      directory,
      mimetype: manifest.mimetype,
      keyterms: manifest.keyterms,
      durationMs: manifest.durationMs,
    };
  }

  sessionDirectory(uploadId: string): Promise<string> {
    return this.findSessionDirectory(uploadId);
  }

  async removeSessionDirectory(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
  }

  private async loadSession(uploadId: string): Promise<{
    directory: string;
    manifest: UploadManifest;
  }> {
    const directory = await this.findSessionDirectory(uploadId);
    const manifest = await this.readManifest(directory);
    if (manifest.uploadId !== uploadId) {
      throw new NotFoundException("upload session not found");
    }
    return { directory, manifest };
  }

  private async findSessionDirectory(uploadId: string): Promise<string> {
    const entries = await readdir(tmpdir(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(this.rootPrefix)) continue;
      const directory = join(tmpdir(), entry.name);
      try {
        const manifest = await this.readManifest(directory);
        if (manifest.uploadId === uploadId) return directory;
      } catch {
        // Skip invalid session directories.
      }
    }
    throw new NotFoundException("upload session not found");
  }

  private manifestPath(directory: string): string {
    return join(directory, "manifest.json");
  }

  private async readManifest(directory: string): Promise<UploadManifest> {
    const raw = await readFile(this.manifestPath(directory), "utf8");
    return JSON.parse(raw) as UploadManifest;
  }

  private async writeManifest(directory: string, manifest: UploadManifest): Promise<void> {
    await writeFile(this.manifestPath(directory), JSON.stringify(manifest));
  }
}

export { maxUploadBytes, uploadPartBytes };
