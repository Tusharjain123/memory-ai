import {
  ConflictException,
  Logger,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { supabaseConfig, supabaseHeaders } from "../supabase/supabase-rest.js";
import { formatTokens } from "./money.js";

const WALLET_TIMEOUT_MS = 15_000;

export type CreditReason =
  | "signup_bonus"
  | "top_up"
  | "processing_charge"
  | "processing_hold"
  | "processing_release"
  | "refund"
  | "adjustment";

export type CreditTransaction = {
  id: string;
  userId: string;
  amount: number;
  reason: CreditReason;
  idempotencyKey: string;
  balanceAfter: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type TransactionRow = {
  id: string;
  user_id: string;
  amount: number | string;
  reason: CreditReason;
  idempotency_key: string;
  balance_after: number | string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export class InsufficientCreditsException extends HttpException {
  constructor(details?: { balanceMicros: number; requiredMicros: number }) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: "insufficient_balance",
        message: details
          ? `This needs about ${formatTokens(details.requiredMicros)} and you have ${formatTokens(details.balanceMicros)}. Top up to continue.`
          : "Not enough tokens. Top up to continue.",
        ...(details ?? {}),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Billing is on unless explicitly disabled (e.g. a local build without Supabase). */
export function billingEnabled(): boolean {
  return process.env.WALLET_BILLING?.trim().toLowerCase() !== "off";
}

function mapTransaction(row: TransactionRow): CreditTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    balanceAfter: Number(row.balance_after),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/** Wallet reads and the only write path (apply_credit_transaction RPC). */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  async getBalance(userId: string): Promise<{ credits: number; updatedAt: string | null }> {
    const { url, secret } = supabaseConfig("read wallet balances");
    const response = await fetch(
      `${url}/rest/v1/user_balance?user_id=eq.${encodeURIComponent(userId)}&select=credits,updated_at`,
      { headers: supabaseHeaders(secret), signal: AbortSignal.timeout(WALLET_TIMEOUT_MS) },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(`Could not load balance (${response.status})`);
    }
    const rows = (await response.json()) as Array<{ credits: number | string; updated_at: string }>;
    const row = rows[0];
    if (!row) throw new NotFoundException("No wallet for this account");
    return { credits: Number(row.credits), updatedAt: row.updated_at };
  }

  async listTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
    const { url, secret } = supabaseConfig("read wallet history");
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
    const response = await fetch(
      `${url}/rest/v1/credit_transactions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${safeLimit}`,
      { headers: supabaseHeaders(secret), signal: AbortSignal.timeout(WALLET_TIMEOUT_MS) },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(`Could not load credit history (${response.status})`);
    }
    return ((await response.json()) as TransactionRow[]).map(mapTransaction);
  }

  /**
   * Reserve the estimated cost before AI work starts. Throws 402 with the
   * balance and the amount needed when the wallet can't cover it.
   */
  async hold(userId: string, jobId: string, micros: number, metadata: Record<string, unknown> = {}): Promise<void> {
    try {
      await this.applyTransaction({
        userId,
        amount: -micros,
        reason: "processing_hold",
        idempotencyKey: `hold:${jobId}`,
        metadata: { jobId, ...metadata },
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsException) {
        const { credits } = await this.getBalance(userId).catch(() => ({ credits: 0 }));
        throw new InsufficientCreditsException({ balanceMicros: credits, requiredMicros: micros });
      }
      throw error;
    }
  }

  /** Give back an unused hold in full (failed or cancelled work). Idempotent per job. */
  async release(userId: string, jobId: string, holdMicros: number, metadata: Record<string, unknown> = {}): Promise<void> {
    if (holdMicros <= 0) return;
    await this.applyTransaction({
      userId,
      amount: holdMicros,
      reason: "processing_release",
      idempotencyKey: `release:${jobId}`,
      metadata: { jobId, ...metadata },
    });
  }

  /**
   * Turn a hold into the actual charge: refund the unused part, or take the
   * overage (capped at what the wallet holds, so the balance never goes negative).
   */
  async settle(input: {
    userId: string;
    jobId: string;
    holdMicros: number;
    actualMicros: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ chargedMicros: number }> {
    const metadata = { jobId: input.jobId, actualMicros: input.actualMicros, ...(input.metadata ?? {}) };
    const unused = input.holdMicros - input.actualMicros;
    if (unused > 0) {
      await this.applyTransaction({
        userId: input.userId,
        amount: unused,
        reason: "processing_release",
        idempotencyKey: `release:${input.jobId}`,
        metadata,
      });
      return { chargedMicros: input.actualMicros };
    }
    const extra = await this.chargeUpTo(input.userId, `charge:${input.jobId}`, -unused, metadata);
    return { chargedMicros: input.holdMicros + extra };
  }

  /** Charge up to `micros`, limited by the current balance. Returns what was taken. */
  async chargeUpTo(userId: string, idempotencyKey: string, micros: number, metadata: Record<string, unknown> = {}): Promise<number> {
    if (micros <= 0) return 0;
    const { credits } = await this.getBalance(userId);
    const amount = Math.min(micros, credits);
    if (amount <= 0) {
      this.logger.warn(`Could not collect ${micros} micros for ${idempotencyKey}: wallet is empty`);
      return 0;
    }
    try {
      await this.applyTransaction({ userId, amount: -amount, reason: "processing_charge", idempotencyKey, metadata });
      return amount;
    } catch (error) {
      if (error instanceof InsufficientCreditsException) return 0; // spent concurrently; never go negative
      throw error;
    }
  }

  /**
   * Atomically add (positive) or spend (negative) credits. Safe to retry with
   * the same idempotency key.
   */
  async applyTransaction(input: {
    userId: string;
    amount: number;
    reason: CreditReason;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreditTransaction> {
    const { url, secret } = supabaseConfig("update wallet balances");
    const response = await fetch(`${url}/rest/v1/rpc/apply_credit_transaction`, {
      method: "POST",
      headers: supabaseHeaders(secret),
      body: JSON.stringify({
        p_user_id: input.userId,
        p_amount: input.amount,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
        p_metadata: input.metadata ?? {},
      }),
      signal: AbortSignal.timeout(WALLET_TIMEOUT_MS),
    });
    if (response.ok) {
      return mapTransaction((await response.json()) as TransactionRow);
    }
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    if (detail.includes("insufficient_credits")) throw new InsufficientCreditsException();
    if (detail.includes("idempotency_conflict")) {
      throw new ConflictException("Idempotency key was already used for a different transaction");
    }
    if (detail.includes("user_balance_not_found")) throw new NotFoundException("No wallet for this account");
    throw new ServiceUnavailableException(`Could not update balance (${response.status})`);
  }
}
