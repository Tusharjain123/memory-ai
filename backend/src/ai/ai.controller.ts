import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
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
});
const embedSchema = z.object({ text: z.string().trim().min(1).max(5_000) });

@Controller("v1/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("embed")
  async embed(@Body() body: unknown): Promise<EmbeddingVectorResponse> {
    const parsed = embedSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.ai.embed(parsed.data.text);
  }

  @Post("ask")
  async ask(@Body() body: unknown): Promise<AskResponse> {
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.ai.ask(parsed.data);
  }
}
