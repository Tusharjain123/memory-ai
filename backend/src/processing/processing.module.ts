import { Module } from "@nestjs/common";
import { WalletModule } from "../wallet/wallet.module.js";
import { DeepgramService } from "./deepgram.service.js";
import { OllamaService } from "./ollama.service.js";
import { ProcessingController } from "./processing.controller.js";
import { ProcessingQueueService } from "./processing-queue.service.js";
import { ProcessingResultStore } from "./processing-result.store.js";
import { ProcessingService } from "./processing.service.js";
import { TempAudioService } from "./temp-audio.service.js";
import { UploadSessionService } from "./upload-session.service.js";

@Module({
  imports: [WalletModule],
  controllers: [ProcessingController],
  providers: [
    ProcessingService,
    ProcessingQueueService,
    ProcessingResultStore,
    TempAudioService,
    UploadSessionService,
    DeepgramService,
    OllamaService,
  ],
  exports: [ProcessingQueueService],
})
export class ProcessingModule {}
