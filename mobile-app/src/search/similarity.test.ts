import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./similarity";

describe("cosineSimilarity", () => {
  it("ranks identical directions highest", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("ranks opposing directions lowest", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("rejects missing and incompatible embeddings", () => {
    expect(cosineSimilarity([], [])).toBe(-1);
    expect(cosineSimilarity([1], [1, 2])).toBe(-1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(-1);
  });
});
