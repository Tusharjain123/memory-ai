import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkOpenAiEmbeddingModel,
  createOpenAiEmbeddings,
  resolveOpenAiEmbeddingConfig,
} from "../src/embeddings/openai-embeddings.js";

beforeEach(() => {
  process.env.OPENAI_API_KEY = "openai-secret";
  process.env.OPENAI_EMBED_MODEL = "text-embedding-3-large";
  process.env.OPENAI_EMBED_DIMENSIONS = "3";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_EMBED_MODEL;
  delete process.env.OPENAI_EMBED_DIMENSIONS;
  vi.unstubAllGlobals();
});

describe("OpenAI embeddings", () => {
  it("batches text and restores vectors to input order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0.4, 0.5, 0.6] },
        { index: 0, embedding: [0.1, 0.2, 0.3] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOpenAiEmbeddings(["first", "second"])).resolves.toEqual({
      model: "text-embedding-3-large:3",
      vectors: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "text-embedding-3-large",
      input: ["first", "second"],
      dimensions: 3,
    });
  });

  it("rejects malformed vectors and provider failures safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ index: 0, embedding: [0.1] }],
      }), { status: 200 }),
    ).mockResolvedValueOnce(new Response("sensitive provider detail", { status: 401 })));

    await expect(createOpenAiEmbeddings(["text"])).rejects.toThrow(
      "OpenAI returned invalid embeddings",
    );
    await expect(createOpenAiEmbeddings(["text"])).rejects.toThrow(
      "OpenAI embedding request failed (401)",
    );
  });

  it("validates configuration and model access", async () => {
    expect(resolveOpenAiEmbeddingConfig()).toMatchObject({
      identity: "text-embedding-3-large:3",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(checkOpenAiEmbeddingModel()).resolves.toBeUndefined();

    delete process.env.OPENAI_API_KEY;
    expect(() => resolveOpenAiEmbeddingConfig()).toThrow(
      "OPENAI_API_KEY is required",
    );
  });
});
