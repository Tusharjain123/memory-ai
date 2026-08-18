import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ollamaFetch,
  ollamaModels,
  ollamaStructuredFormat,
  resolveOllamaConnection,
} from "../src/ollama/ollama-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_API_KEY;
});

describe("remote Ollama connection", () => {
  it("adds bearer authentication for Ollama Cloud", async () => {
    process.env.OLLAMA_URL = "https://ollama.com/";
    process.env.OLLAMA_API_KEY = "cloud-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ollamaFetch("chat", "/api/chat", { model: "qwen3.5:397b" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/api/chat",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cloud-secret",
          "Content-Type": "application/json",
        }),
        signal: expect.any(AbortSignal),
        dispatcher: expect.any(Object),
      }),
    );
  });

  it("uses Ollama Cloud for Qwen3-Embedding", async () => {
    process.env.OLLAMA_URL = "https://ollama.com";
    process.env.OLLAMA_API_KEY = "cloud-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ollamaFetch("embed", "/api/embed", {
      model: "qwen3-embedding:0.6b",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/api/embed",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cloud-secret",
        }),
        dispatcher: expect.any(Object),
      }),
    );
  });

  it("discovers authenticated remote models", async () => {
    process.env.OLLAMA_URL = "https://ollama.com";
    process.env.OLLAMA_API_KEY = "cloud-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ models: [{ name: "qwen3-embedding:0.6b" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ollamaModels("embed")).resolves.toEqual([
      "qwen3-embedding:0.6b",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/api/tags",
      expect.objectContaining({
        headers: { Authorization: "Bearer cloud-secret" },
        signal: expect.any(AbortSignal),
        dispatcher: expect.any(Object),
      }),
    );
  });

  it("rejects plaintext remote hosts so credentials cannot leak", () => {
    expect(() =>
      resolveOllamaConnection("http://ollama.example.com", "secret"),
    ).toThrow("must use HTTPS");
  });

  it("requires authentication for the official Ollama Cloud host", () => {
    expect(() => resolveOllamaConnection("https://ollama.com")).toThrow(
      "OLLAMA_API_KEY is required",
    );
  });

  it("uses strict JSON mode for Ollama Cloud schema requests", () => {
    process.env.OLLAMA_URL = "https://ollama.com";
    process.env.OLLAMA_API_KEY = "cloud-secret";
    expect(ollamaStructuredFormat({ type: "object" })).toBe("json");
  });

  it("passes JSON Schema through in local development", () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    const schema = { type: "object" };
    expect(ollamaStructuredFormat(schema)).toBe(schema);
  });

  it("retains loopback support for private development", () => {
    expect(resolveOllamaConnection("http://127.0.0.1:11434")).toEqual({
      baseUrl: "http://127.0.0.1:11434",
    });
  });
});
