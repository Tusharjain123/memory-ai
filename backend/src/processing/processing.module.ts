import { Module } from "@nestjs/common";
import { DeepgramService } from "./deepgram.service.js";
import { OllamaService } from "./ollama.service.js";
import { ProcessingController } from "./processing.controller.js";
import { ProcessingQueueService } from "./processing-queue.service.js";
import { ProcessingService } from "./processing.service.js";
import { TempAudioService } from "./temp-audio.service.js";

@Module({
  controllers: [ProcessingController],
  providers: [
    ProcessingService,
    ProcessingQueueService,
    TempAudioService,
    DeepgramService,
    OllamaService,
  ],
})
export class ProcessingModule {}
