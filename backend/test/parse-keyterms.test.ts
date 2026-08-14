import { describe, expect, it } from "vitest";
import { parseKeyterms } from "../src/processing/processing.controller.js";

describe("parseKeyterms", () => {
  it("parses unique trimmed names up to 40", () => {
    expect(parseKeyterms(JSON.stringify([" Rahul ", "Priya", "Rahul", ""]))).toEqual([
      "Rahul",
      "Priya",
    ]);
  });

  it("ignores invalid payloads", () => {
    expect(parseKeyterms("")).toEqual([]);
    expect(parseKeyterms("not-json")).toEqual([]);
    expect(parseKeyterms(JSON.stringify({ name: "x" }))).toEqual([]);
  });
});
