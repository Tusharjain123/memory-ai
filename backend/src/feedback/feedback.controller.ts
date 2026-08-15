import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { FeedbackService } from "./feedback.service.js";
import { feedbackSchema } from "./feedback.types.js";

const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 5;
const attempts = new Map<string, number[]>();

function checkRateLimit(ip: string, now = Date.now()): void {
  const recent = (attempts.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    attempts.set(ip, recent);
    throw new HttpException("Please wait before sending more feedback", HttpStatus.TOO_MANY_REQUESTS);
  }
  recent.push(now);
  attempts.set(ip, recent);
}

@Controller("v1/feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: unknown, @Req() request: FastifyRequest): Promise<{ accepted: true }> {
    checkRateLimit(request.ip);
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.feedback.create(parsed.data);
    return { accepted: true };
  }
}
