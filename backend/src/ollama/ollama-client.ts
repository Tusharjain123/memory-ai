import { ServiceUnavailableException } from "@nestjs/common";

export type OllamaConnection = {
  baseUrl: string;
  authorization?: string;
};
export type OllamaWorkload = "chat" | "embed";

export function resolveOllamaWorkloadConnection(
  _workload: OllamaWorkload,
): OllamaConnection {
  return resolveOllamaConnection();
}

export function ollamaStructuredFormat<T>(schema: T): T | "json" {
  const connection = resolveOllamaWorkloadConnection("chat");
  const hostname = new URL(connection.baseUrl).hostname;
  return hostname === "ollama.com" || hostname.endsWith(".ollama.com")
    ? "json"
    : schema;
}

export function resolveOllamaConnection(
  baseUrl = process.env.OLLAMA_URL ?? "https://ollama.com",
  apiKey = process.env.OLLAMA_API_KEY,
): OllamaConnection {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ServiceUnavailableException("OLLAMA_URL must be an absolute URL");
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    throw new ServiceUnavailableException(
      "Remote Ollama connections must use HTTPS",
    );
  }
  if (
    (url.hostname === "ollama.com" || url.hostname.endsWith(".ollama.com")) &&
    !apiKey
  ) {
    throw new ServiceUnavailableException(
      "OLLAMA_API_KEY is required for Ollama Cloud",
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

export async function ollamaFetch(
  workload: OllamaWorkload,
  path: string,
  body: unknown,
): Promise<Response> {
  const connection = resolveOllamaWorkloadConnection(workload);
  const headers = ollamaHeaders(connection, true);
  const timeoutMs = positiveTimeout(
    workload === "chat"
      ? process.env.OLLAMA_CHAT_TIMEOUT_MS
      : process.env.OLLAMA_EMBED_TIMEOUT_MS,
    workload === "chat" ? 300_000 : 120_000,
  );
  return fetch(`${connection.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function ollamaModels(
  workload: OllamaWorkload,
): Promise<string[]> {
  const connection = resolveOllamaWorkloadConnection(workload);
  const response = await fetch(`${connection.baseUrl}/api/tags`, {
    headers: ollamaHeaders(connection, false),
    signal: AbortSignal.timeout(
      positiveTimeout(process.env.OLLAMA_DISCOVERY_TIMEOUT_MS, 10_000),
    ),
  });
  if (!response.ok) {
    throw new ServiceUnavailableException(
      `Ollama ${workload} model discovery failed (${response.status})`,
    );
  }
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };
  return (payload.models ?? [])
    .map((item) => item.name ?? item.model ?? "")
    .filter(Boolean);
}

function positiveTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ollamaHeaders(
  connection: OllamaConnection,
  json: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (connection.authorization) headers.Authorization = connection.authorization;
  return headers;
}
