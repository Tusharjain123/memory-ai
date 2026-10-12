import { Controller, Delete, Get, HttpCode, NotFoundException, Query } from "@nestjs/common";
import { ensureAccountRows } from "../supabase/account.js";
import { CurrentUser, RequireUser } from "../auth/auth.decorators.js";
import type { AuthUser } from "../auth/supabase-jwt.js";
import { CloudDataService } from "./cloud-data.service.js";
import { WalletService } from "./wallet.service.js";
import { lowBalanceThresholdMicros, minutesForBalance } from "../billing/estimate.js";
import { paymentsConfigured } from "../payments/dodo.client.js";
import { walletPacks } from "./packs.js";
import { microsToTokens, TOKENS_PER_USD } from "./money.js";

@Controller("v1/me")
@RequireUser()
export class MeController {
  constructor(
    private readonly wallet: WalletService,
    private readonly cloudData: CloudDataService,
  ) {}

  @Get("balance")
  balance(@CurrentUser() user: AuthUser) {
    return this.wallet.getBalance(user.id);
  }

  /** Everything the app's wallet screen and pre-recording check need. */
  @Get("wallet")
  async walletSummary(@CurrentUser() user: AuthUser) {
    const { credits, updatedAt } = await this.wallet.getBalance(user.id).catch(async (error: unknown) => {
      // Missing wallet (lost account rows): recreate once, then read again.
      if (!(error instanceof NotFoundException)) throw error;
      await ensureAccountRows(user.id, user.email);
      return this.wallet.getBalance(user.id);
    });
    const threshold = lowBalanceThresholdMicros();
    return {
      balanceMicros: credits,
      balanceTokens: microsToTokens(credits),
      tokensPerUsd: TOKENS_PER_USD,
      updatedAt,
      minutesLeft: minutesForBalance(credits),
      lowBalance: credits < threshold,
      lowBalanceThresholdMicros: threshold,
      paymentsEnabled: paymentsConfigured(),
      packs: paymentsConfigured()
        ? walletPacks().map(({ id, priceCents, creditMicros }) => ({ id, priceCents, creditMicros, creditTokens: microsToTokens(creditMicros) }))
        : [],
    };
  }

  @Get("transactions")
  transactions(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.wallet.listTransactions(user.id, limit ? Number(limit) : undefined);
  }

  /** "Delete cloud copy" when the user turns cloud storage off. Local data is untouched. */
  @Delete("cloud-data")
  @HttpCode(204)
  async deleteCloudData(@CurrentUser() user: AuthUser): Promise<void> {
    await this.cloudData.deleteSyncedData(user.id);
  }
}
