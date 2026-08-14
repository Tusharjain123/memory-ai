import { describe, expect, it } from "vitest";
import {
  createDistantMicDetectorState,
  nextDistantMicDetectorState,
} from "./distantMicDetector";

describe("distantMicDetector", () => {
  it("flags sustained table-distance levels", () => {
    let state = createDistantMicDetectorState();
    for (let i = 0; i < 49; i += 1) {
      state = nextDistantMicDetectorState(state, 0.18);
      expect(state.distant).toBe(false);
    }
    state = nextDistantMicDetectorState(state, 0.18);
    expect(state.distant).toBe(true);
  });

  it("does not treat loud close speech as distant", () => {
    let state = createDistantMicDetectorState();
    for (let i = 0; i < 60; i += 1) {
      state = nextDistantMicDetectorState(state, 0.55);
    }
    expect(state.distant).toBe(false);
  });

  it("clears after sustained louder speech", () => {
    let state = createDistantMicDetectorState();
    for (let i = 0; i < 55; i += 1) {
      state = nextDistantMicDetectorState(state, 0.16);
    }
    expect(state.distant).toBe(true);
    for (let i = 0; i < 10; i += 1) {
      state = nextDistantMicDetectorState(state, 0.5);
    }
    expect(state.distant).toBe(false);
  });
});
