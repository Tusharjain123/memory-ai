import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller.js";
import { AiModule } from "./ai/ai.module.js";
import { ProcessingModule } from "./processing/processing.module.js";
import { FeedbackModule } from "./feedback/feedback.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule, ProcessingModule, FeedbackModule],
  controllers: [HealthController],
})
export class AppModule {}
