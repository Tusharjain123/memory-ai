import { describe, expect, it } from "vitest";
import { storedEntityId } from "./storageIds";

describe("storedEntityId", () => {
  it("namespaces repeated AI IDs by conversation and entity type", () => {
    expect(storedEntityId("conversation-a", "segment", "1"))
      .not.toBe(storedEntityId("conversation-b", "segment", "1"));
    expect(storedEntityId("conversation-a", "decision", "1"))
      .not.toBe(storedEntityId("conversation-a", "action", "1"));
  });
});
