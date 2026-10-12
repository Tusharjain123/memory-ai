import { roundUpToToken } from "../wallet/money.js";
import { priceCard, usageCostMicros, type PriceCard } from "./usage-meter.js";

/** Safety factor on holds so the final charge rarely exceeds what was reserved. */
const HOLD_SAFETY = 1.25;
/** Spoken audio runs ~150 words/min ≈ 200 tokens/min; LLM passes read it about 3× and write ~1×. */
const PROMPT_TOKENS_PER_MIN = 900;
const OUTPUT_TOKENS_PER_MIN = 350;
const EMBED_TOKENS_PER_MIN = 250;
/** Fixed prompt overhead (instructions, schemas) per job. */
const BASE_PROMPT_TOKENS = 3_000;
const MIN_HOLD_MICROS = 2_000; // 2 tokens

/** Expected cost of processing `minutes` of recorded audio, before the safety factor. */
export function expectedAudioCostMicros(minutes: number, prices: PriceCard = priceCard()): number {
  const safeMinutes = Math.max(0, minutes);
  return usageCostMicros({
    audioSec: safeMinutes * 60,
    llmPromptTokens: BASE_PROMPT_TOKENS + safeMinutes * PROMPT_TOKENS_PER_MIN,
    llmOutputTokens: safeMinutes * OUTPUT_TOKENS_PER_MIN,
    embedTokens: safeMinutes * EMBED_TOKENS_PER_MIN,
  }, prices);
}

/** Amount to reserve before transcribing `durationSec` of audio. */
export function audioHoldMicros(durationSec: number, prices?: PriceCard): number {
  return roundUpToToken(Math.max(MIN_HOLD_MICROS, expectedAudioCostMicros(durationSec / 60, prices) * HOLD_SAFETY));
}

/** Amount to reserve before understanding an already-written transcript (no speech-to-text). */
export function transcriptHoldMicros(transcriptChars: number, prices: PriceCard = priceCard()): number {
  const tokens = Math.ceil(Math.max(0, transcriptChars) / 4);
  const cost = usageCostMicros({
    audioSec: 0,
    llmPromptTokens: BASE_PROMPT_TOKENS + tokens * 3,
    llmOutputTokens: Math.ceil(tokens * 1.2),
    embedTokens: tokens,
  }, prices);
  return roundUpToToken(Math.max(MIN_HOLD_MICROS, cost * HOLD_SAFETY));
}

/** Audio duration when the client didn't send one: ~8 KB/s for AAC/M4A speech. */
export function durationFromBytes(bytes: number): number {
  return Math.max(60, Math.ceil(bytes / 8_000));
}

/** How many minutes of conversation a balance covers at the expected rate. */
export function minutesForBalance(balanceMicros: number, prices?: PriceCard): number {
  const perMinute = expectedAudioCostMicros(10, prices) / 10;
  return perMinute > 0 ? Math.floor(balanceMicros / perMinute) : 0;
}

/** Below this, the app nudges a top-up before recording (≈ 5 minutes of conversation). */
export function lowBalanceThresholdMicros(prices?: PriceCard): number {
  return audioHoldMicros(5 * 60, prices);
}
