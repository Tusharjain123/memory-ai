import { Module } from "@nestjs/common";
import { WalletModule } from "../wallet/wallet.module.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";

@Module({ imports: [WalletModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
