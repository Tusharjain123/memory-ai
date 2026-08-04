import { Injectable } from "@nestjs/common";
import type { ProcessedConversation } from "../contracts";
import { DeepgramService } from "./deepgram.service.js";
import { OllamaService } from "./ollama.service.js";
import { TempAudioService } from "./temp-audio.service.js";

@Injectable()
export class ProcessingService {
  constructor(
    private readonly tempAudio: TempAudioService,
    private readonly deepgram: DeepgramService,
    private readonly ollama: OllamaService,
  ) {}

  process(
    filename: string,
    mimetype: string,
    stream: NodeJS.ReadableStream,
  ): Promise<ProcessedConversation> {
    return this.tempAudio.withUpload(filename, stream, async (audioPath) => {
      const transcript = await this.deepgram.transcribe(audioPath, mimetype);
      return this.ollama.assemble(transcript);
    });
  }
}
