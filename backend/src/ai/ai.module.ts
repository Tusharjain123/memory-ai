import { Module } from "@nestjs/common";
import { WalletModule } from "../wallet/wallet.module.js";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";

@Module({ imports: [WalletModule], controllers: [AiController], providers: [AiService] })
export class AiModule {}
