import { AsyncLocalStorage } from "node:async_hooks";
import { usdToMicros } from "../wallet/money.js";

export type Usage = {
  audioSec: number;
  llmPromptTokens: number;
  llmOutputTokens: number;
  embedTokens: number;
};

export type PriceCard = {
  deepgramPerMinUsd: number;
  llmInputPerMTokUsd: number;
  llmOutputPerMTokUsd: number;
  embedPerMTokUsd: number;
};

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Our provider costs. Defaults: Deepgram Nova-3 multilingual pay-as-you-go,
 * OpenAI text-embedding-3-large, and a configured estimate for the LLM
 * (Ollama Cloud is plan-priced, so there is no exact per-token bill).
 */
export function priceCard(): PriceCard {
  return {
    deepgramPerMinUsd: envNumber("PRICE_DEEPGRAM_PER_MIN_USD", 0.0052),
    llmInputPerMTokUsd: envNumber("PRICE_LLM_INPUT_PER_MTOK_USD", 0.5),
    llmOutputPerMTokUsd: envNumber("PRICE_LLM_OUTPUT_PER_MTOK_USD", 2),
    embedPerMTokUsd: envNumber("PRICE_EMBED_PER_MTOK_USD", 0.13),
  };
}

export function usageCostMicros(usage: Usage, prices: PriceCard = priceCard()): number {
  const usd =
    (usage.audioSec / 60) * prices.deepgramPerMinUsd
    + (usage.llmPromptTokens / 1_000_000) * prices.llmInputPerMTokUsd
    + (usage.llmOutputTokens / 1_000_000) * prices.llmOutputPerMTokUsd
    + (usage.embedTokens / 1_000_000) * prices.embedPerMTokUsd;
  return Math.max(0, Math.ceil(usdToMicros(usd)));
}

/** Rough token count when a provider doesn't report usage (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Accumulates what one job actually consumed across every provider call. */
export class UsageMeter {
  readonly usage: Usage = { audioSec: 0, llmPromptTokens: 0, llmOutputTokens: 0, embedTokens: 0 };

  add(partial: Partial<Usage>): void {
    this.usage.audioSec += partial.audioSec ?? 0;
    this.usage.llmPromptTokens += partial.llmPromptTokens ?? 0;
    this.usage.llmOutputTokens += partial.llmOutputTokens ?? 0;
    this.usage.embedTokens += partial.embedTokens ?? 0;
  }

  costMicros(prices?: PriceCard): number {
    return usageCostMicros(this.usage, prices);
  }
}

const storage = new AsyncLocalStorage<UsageMeter>();

/** Runs `work` with a meter that provider calls inside it report into. */
export function withUsageMeter<T>(meter: UsageMeter, work: () => Promise<T>): Promise<T> {
  return storage.run(meter, work);
}

/** Called at provider choke points; a no-op outside a metered job. */
export function recordUsage(partial: Partial<Usage>): void {
  storage.getStore()?.add(partial);
}
