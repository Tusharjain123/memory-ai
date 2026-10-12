import { describe, expect, it } from "vitest";
import { formatCents, formatTokens, minutesLabel, tokenCount } from "./money";

describe("money", () => {
  it("shows wallet amounts as whole tokens (1,000 = $1)", () => {
    expect(formatTokens(5_000_000)).toBe("5,000 tokens");
    expect(formatTokens(-62_000)).toBe("−62 tokens");
    expect(formatTokens(10_000_000, { sign: true })).toBe("+10,000 tokens");
    expect(formatTokens(1_000)).toBe("1 token");
    expect(tokenCount(12_480_000)).toBe("12,480");
  });

  it("formats prices and minutes", () => {
    expect(formatCents(1500)).toBe("$15");
    expect(formatCents(599)).toBe("$5.99");
    expect(minutesLabel(45)).toBe("≈ 45 min of conversations");
    expect(minutesLabel(250)).toBe("≈ 4 h of conversations");
  });
});
