import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller.js";
import { AiModule } from "./ai/ai.module.js";
import { ProcessingModule } from "./processing/processing.module.js";
import { FeedbackModule } from "./feedback/feedback.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { WalletModule } from "./wallet/wallet.module.js";
import { GoogleModule } from "./google/google.module.js";
import { PaymentsModule } from "./payments/payments.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AiModule,
    ProcessingModule,
    FeedbackModule,
    WalletModule,
    GoogleModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
