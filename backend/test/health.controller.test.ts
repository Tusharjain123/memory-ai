import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "../src/health.controller.js";

const trackedVariables = [
  "DEEPGRAM_API_KEY",
  "OLLAMA_URL",
  "OLLAMA_API_KEY",
  "OLLAMA_CHAT_MODEL",
  "OLLAMA_EMBED_MODEL",
] as const;

afterEach(() => {
  for (const variable of trackedVariables) delete process.env[variable];
  vi.unstubAllGlobals();
});

describe("provider readiness", () => {
  it("reports missing cloud configuration without exposing secrets", () => {
    const controller = new HealthController();
    try {
      controller.ready();
      throw new Error("expected readiness to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse();
      expect(JSON.stringify(response)).toContain("DEEPGRAM_API_KEY is missing");
      expect(JSON.stringify(response)).toContain("OLLAMA_API_KEY is required");
    }
  });

  it("reports ready for authenticated Ollama Cloud chat and embeddings", () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-secret";
    process.env.OLLAMA_URL = "https://ollama.com";
    process.env.OLLAMA_API_KEY = "chat-secret";
    process.env.OLLAMA_EMBED_MODEL = "qwen3-embedding:0.6b";

    expect(new HealthController().ready()).toEqual({
      status: "ready",
      providers: { deepgram: true, ollamaChat: true, ollamaEmbed: true },
    });
  });

  it("live-checks credentials and required models without inference", async () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-secret";
    process.env.OLLAMA_URL = "https://ollama.com";
    process.env.OLLAMA_API_KEY = "chat-secret";
    process.env.OLLAMA_CHAT_MODEL = "qwen3.5:397b";
    process.env.OLLAMA_EMBED_MODEL = "qwen3-embedding:0.6b";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("deepgram.com")) {
        return new Response("{}", { status: 200 });
      }
      return new Response(
        JSON.stringify({
          models: [
            { name: "qwen3.5:397b" },
            { name: "qwen3-embedding:0.6b" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }));

    await expect(new HealthController().providers()).resolves.toEqual({
      status: "ready",
      providers: { deepgram: true, ollamaChat: true, ollamaEmbed: true },
    });
  });

  it("reports an unavailable embedding model", async () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-secret";
    process.env.OLLAMA_URL = "https://ollama.com";
    process.env.OLLAMA_API_KEY = "cloud-secret";
    process.env.OLLAMA_CHAT_MODEL = "qwen3";
    process.env.OLLAMA_EMBED_MODEL = "qwen3-embedding:0.6b";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("deepgram.com")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ models: [{ name: "qwen3" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    await expect(new HealthController().providers()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
