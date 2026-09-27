import { describe, expect, it } from "vitest";
import { parseChatJson, parseStructuredChatJson } from "../src/ollama/parse-model-json.js";
import { understandingSchema } from "../src/processing/result.schema.js";

const memory = {
  title: "Launch",
  note: "Priya said \"aaj {deploy}\"",
};

const understanding = {
  title: "Deployment planning",
  mainGoal: "Plan today's deployment",
  summary: "Rahul will complete deployment today.",
  topics: ["deployment"],
  cleanTranscript: "We will deploy today.",
  romanHinglishTranscript: "Aaj deploy karenge.",
  participants: [{ name: "Rahul", speakerLabel: "Speaker 1" }],
  segments: [{
    id: "segment-1",
    speakerLabel: "Speaker 1",
    startMs: 0,
    endMs: 2_000,
    rawText: "Aaj deploy karenge.",
    cleanText: "We will deploy today.",
    romanHinglishText: "Aaj deploy karenge.",
  }],
  decisions: [],
  commitments: [],
  memoryCandidates: [],
};

describe("parseChatJson", () => {
  it("parses raw JSON", () => {
    expect(parseChatJson({ content: JSON.stringify(memory) })).toEqual(memory);
  });

  it("parses a fenced object with surrounding prose", () => {
    const content = `The user wants a memory.\n\`\`\`json\n${JSON.stringify(memory)}\n\`\`\`\nHope this helps.`;
    expect(parseChatJson({ content })).toEqual(memory);
  });

  it("keeps the full object when an earlier fragment is also JSON", () => {
    const content = `Note {"ok":true} then ${JSON.stringify(memory)}`;
    expect(parseChatJson({ content })).toEqual(memory);
  });

  it("reads JSON from thinking when the answer is prose", () => {
    expect(parseChatJson({
      content: "I will return the memory next.",
      thinking: JSON.stringify(memory),
    })).toEqual(memory);
  });

  it("repairs fences, trailing commas, comments, and literal words", () => {
    const content = "```json\n{\"title\":\"Launch\",\"note\": None,}\n// done";
    expect(parseChatJson({ content })).toEqual({ title: "Launch", note: null });
  });

  it("parses an unclosed fence", () => {
    const content = `Here:\n\`\`\`json\n${JSON.stringify(memory)}`;
    expect(parseChatJson({ content })).toEqual(memory);
  });

  it("chooses the object that matches the schema when a larger blob is also JSON", () => {
    const decoy = { echoedSchema: "x".repeat(4_000), required: ["title"] };
    const content = `${JSON.stringify(decoy)}\n${JSON.stringify(understanding)}`;
    expect(parseStructuredChatJson({ content }, understandingSchema)).toEqual(understanding);
  });

  it("rejects text that contains no JSON value", () => {
    expect(() => parseChatJson({ content: "not json" })).toThrow("Model response is not JSON");
  });
});
