import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller.js";
import { AiModule } from "./ai/ai.module.js";
import { ProcessingModule } from "./processing/processing.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule, ProcessingModule],
  controllers: [HealthController],
})
export class AppModule {}
