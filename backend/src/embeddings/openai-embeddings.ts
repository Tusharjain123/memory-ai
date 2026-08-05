import { ServiceUnavailableException } from "@nestjs/common";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const DEFAULT_MODEL = "text-embedding-3-large";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export type OpenAiEmbeddingConfig = {
  apiKey: string;
  model: string;
  dimensions: number;
  identity: string;
};

export type OpenAiEmbeddingResult = {
  model: string;
  vectors: number[][];
};

export function resolveOpenAiEmbeddingConfig(): OpenAiEmbeddingConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ServiceUnavailableException("OPENAI_API_KEY is required for embeddings");
  }
  const model = process.env.OPENAI_EMBED_MODEL?.trim() || DEFAULT_MODEL;
  const dimensions = positiveInteger(
    process.env.OPENAI_EMBED_DIMENSIONS,
    DEFAULT_DIMENSIONS,
    "OPENAI_EMBED_DIMENSIONS",
  );
  return {
    apiKey,
    model,
    dimensions,
    identity: `${model}:${dimensions}`,
  };
}

export async function checkOpenAiEmbeddingModel(): Promise<void> {
  const config = resolveOpenAiEmbeddingConfig();
  const response = await fetch(
    `${OPENAI_MODELS_URL}/${encodeURIComponent(config.model)}`,
    {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(
        positiveInteger(
          process.env.OPENAI_DISCOVERY_TIMEOUT_MS,
          10_000,
          "OPENAI_DISCOVERY_TIMEOUT_MS",
        ),
      ),
    },
  );
  if (!response.ok) {
    throw new ServiceUnavailableException(
      `OpenAI embedding model check failed (${response.status})`,
    );
  }
}

export async function createOpenAiEmbeddings(
  input: string[],
): Promise<OpenAiEmbeddingResult> {
  if (!input.length || input.some((text) => !text.trim())) {
    throw new ServiceUnavailableException("Embedding input must contain non-empty text");
  }
  const config = resolveOpenAiEmbeddingConfig();
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input,
      dimensions: config.dimensions,
      encoding_format: "float",
    }),
    signal: AbortSignal.timeout(
      positiveInteger(
        process.env.OPENAI_EMBED_TIMEOUT_MS,
        DEFAULT_TIMEOUT_MS,
        "OPENAI_EMBED_TIMEOUT_MS",
      ),
    ),
  });
  if (!response.ok) {
    throw new ServiceUnavailableException(
      `OpenAI embedding request failed (${response.status})`,
    );
  }
  const payload = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: number[] }>;
  };
  const ordered = [...(payload.data ?? [])].sort(
    (left, right) => (left.index ?? -1) - (right.index ?? -1),
  );
  if (
    ordered.length !== input.length ||
    ordered.some(
      (item, index) =>
        item.index !== index ||
        item.embedding?.length !== config.dimensions ||
        item.embedding.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new ServiceUnavailableException("OpenAI returned invalid embeddings");
  }
  return {
    model: config.identity,
    vectors: ordered.map((item) => item.embedding as number[]),
  };
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ServiceUnavailableException(`${name} must be a positive integer`);
  }
  return parsed;
}
