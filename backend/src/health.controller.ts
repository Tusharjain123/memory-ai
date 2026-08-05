import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { resolveOllamaWorkloadConnection } from "./ollama/ollama-client.js";
import { ollamaModels } from "./ollama/ollama-client.js";
import {
  checkOpenAiEmbeddingModel,
  resolveOpenAiEmbeddingConfig,
} from "./embeddings/openai-embeddings.js";

@Controller("health")
export class HealthController {
  @Get()
  health(): { status: "ok"; persistence: "device-only" } {
    return { status: "ok", persistence: "device-only" };
  }

  @Get("ready")
  ready(): {
    status: "ready";
    providers: { deepgram: true; ollamaChat: true; openAiEmbed: true };
  } {
    const issues: string[] = [];
    if (!process.env.DEEPGRAM_API_KEY) {
      issues.push("DEEPGRAM_API_KEY is missing");
    }
    try {
      resolveOllamaWorkloadConnection("chat");
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "Ollama chat is not configured");
    }
    try {
      resolveOpenAiEmbeddingConfig();
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "OpenAI embeddings are not configured");
    }
    if (issues.length) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        issues: [...new Set(issues)],
      });
    }
    return {
      status: "ready",
      providers: { deepgram: true, ollamaChat: true, openAiEmbed: true },
    };
  }

  @Get("providers")
  async providers(): Promise<{
    status: "ready";
    providers: { deepgram: true; ollamaChat: true; openAiEmbed: true };
  }> {
    const checks = await Promise.allSettled([
      this.checkDeepgram(),
      this.checkOllamaModel(
        "chat",
        process.env.OLLAMA_CHAT_MODEL ?? "qwen3",
      ),
      checkOpenAiEmbeddingModel(),
    ]);
    const labels = ["Deepgram", "Ollama chat", "OpenAI embeddings"];
    const issues = checks.flatMap((result, index) =>
      result.status === "rejected"
        ? [`${labels[index]}: ${this.errorMessage(result.reason)}`]
        : [],
    );
    if (issues.length) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        issues,
      });
    }
    return {
      status: "ready",
      providers: { deepgram: true, ollamaChat: true, openAiEmbed: true },
    };
  }

  private async checkDeepgram(): Promise<void> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY is missing");
    const response = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`authentication failed (${response.status})`);
  }

  private async checkOllamaModel(
    workload: "chat" | "embed",
    requiredModel: string,
  ): Promise<void> {
    const models = await ollamaModels(workload);
    if (!models.includes(requiredModel)) {
      throw new Error(`required model "${requiredModel}" is unavailable`);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "unknown provider error";
  }
}
