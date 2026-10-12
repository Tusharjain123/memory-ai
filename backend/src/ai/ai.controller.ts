import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CurrentUser, RequireUser } from "../auth/auth.decorators.js";
import type { AuthUser } from "../auth/supabase-jwt.js";
import { UsageMeter, withUsageMeter } from "../billing/usage-meter.js";
import { roundUpToToken } from "../wallet/money.js";
import { billingEnabled, InsufficientCreditsException, WalletService } from "../wallet/wallet.service.js";
import type {
  AskResponse,
  EmbeddingVectorResponse,
} from "../contracts";
import { z } from "zod";
import { AiService } from "./ai.service.js";

const askSchema = z.object({
  question: z.string().trim().min(1).max(1_000),
  context: z.array(
    z.object({ id: z.string().max(200), text: z.string().max(20_000) }),
  ).max(30),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(4_000),
    }),
  ).max(12).optional(),
});
const embedSchema = z.object({ text: z.string().trim().min(1).max(5_000) });

/** Below 10 tokens Ask is refused up front; each call then pays its metered cost. */
const MIN_ASK_BALANCE_MICROS = 10_000;

@Controller("v1/ai")
@RequireUser()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly wallet: WalletService,
  ) {}

  /** Runs `work` metered and charges its actual cost to the caller's wallet. */
  private async billed<T>(user: AuthUser, kind: "ask" | "embed", work: () => Promise<T>): Promise<T> {
    if (!billingEnabled()) return work();
    const { credits } = await this.wallet.getBalance(user.id);
    if (credits < MIN_ASK_BALANCE_MICROS) {
      throw new InsufficientCreditsException({ balanceMicros: credits, requiredMicros: MIN_ASK_BALANCE_MICROS });
    }
    const meter = new UsageMeter();
    const result = await withUsageMeter(meter, work);
    await this.wallet
      .chargeUpTo(user.id, `charge:${kind}:${randomUUID()}`, roundUpToToken(meter.costMicros()), { kind, usage: meter.usage })
      .catch(() => 0);
    return result;
  }

  @Post("embed")
  async embed(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<EmbeddingVectorResponse> {
    const parsed = embedSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.billed(user, "embed", () => this.ai.embed(parsed.data.text));
  }

  @Post("ask")
  async ask(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<AskResponse> {
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.billed(user, "ask", () => this.ai.ask(parsed.data));
  }
}
