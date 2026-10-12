import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser, RequireUser } from "../auth/auth.decorators.js";
import type { AuthUser } from "../auth/supabase-jwt.js";
import { PaymentsService, type DodoWebhookEvent } from "./payments.service.js";
import { verifyWebhook } from "./webhook-verify.js";

const APP_RETURN_URL = "memoryai://wallet?checkout=done";

@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly payments: PaymentsService) {}

  @Post("v1/wallet/checkout")
  @RequireUser()
  @HttpCode(200)
  checkout(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const packId = typeof body === "object" && body !== null && "packId" in body ? String(body.packId ?? "") : "";
    if (!packId) throw new BadRequestException("packId is required");
    return this.payments.startCheckout(user, packId);
  }

  /** The app calls this after checkout returns, so tokens never depend on webhook delivery alone. */
  @Post("v1/wallet/payments/:paymentId/verify")
  @RequireUser()
  @HttpCode(200)
  verify(@CurrentUser() user: AuthUser, @Param("paymentId") paymentId: string) {
    return this.payments.verifyPayment(user, paymentId);
  }

  /** Dodo needs an https return URL; bounce the browser back into the app. */
  @Get("v1/payments/dodo/return")
  returnToApp(@Res() reply: FastifyReply): void {
    void reply
      .status(302)
      .header("Location", APP_RETURN_URL)
      .type("text/html")
      .send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${APP_RETURN_URL}"><title>Memory AI</title><p style="font-family:sans-serif;text-align:center;margin-top:40vh">Payment received. <a href="${APP_RETURN_URL}">Return to Memory AI</a></p>`);
  }

  /** Dodo Payments webhook (Standard Webhooks signature over the raw body). */
  @Post("v1/payments/dodo/webhook")
  @HttpCode(200)
  async webhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers("webhook-id") id: string | undefined,
    @Headers("webhook-timestamp") timestamp: string | undefined,
    @Headers("webhook-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    const secret = process.env.DODO_WEBHOOK_SECRET?.trim();
    if (!secret) throw new ServiceUnavailableException("DODO_WEBHOOK_SECRET is not configured");
    const raw = request.rawBody;
    if (!raw) throw new BadRequestException("Raw body unavailable");
    const verified = verifyWebhook(secret, { id, timestamp, signature }, raw);
    if (!verified.ok) {
      this.logger.warn(`Rejected Dodo webhook ${id ?? "?"}: ${verified.reason}`);
      throw new UnauthorizedException("Invalid webhook signature");
    }
    let event: DodoWebhookEvent;
    try {
      event = JSON.parse(raw.toString("utf8")) as DodoWebhookEvent;
    } catch {
      throw new BadRequestException("Invalid JSON");
    }
    // Errors (e.g. database down) return 5xx so Dodo retries; crediting is idempotent.
    await this.payments.handleEvent(event);
    return { received: true };
  }
}
