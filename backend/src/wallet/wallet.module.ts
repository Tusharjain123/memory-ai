import { Module } from "@nestjs/common";
import { CloudDataService } from "./cloud-data.service.js";
import { MeController } from "./me.controller.js";
import { WalletService } from "./wallet.service.js";

@Module({
  controllers: [MeController],
  providers: [WalletService, CloudDataService],
  exports: [WalletService],
})
export class WalletModule {}
