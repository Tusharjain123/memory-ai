import { describe, expect, it } from "vitest";
import {
  MUFFLED_RECOVERY_SAMPLES,
  MUFFLED_SAMPLE_THRESHOLD,
  createMuffledDetectorState,
  nextMuffledDetectorState,
} from "./muffledDetector";

describe("muffledDetector", () => {
  it("stays quiet until sustained near-silence", () => {
    let state = createMuffledDetectorState();
    for (let i = 0; i < MUFFLED_SAMPLE_THRESHOLD - 1; i += 1) {
      state = nextMuffledDetectorState(state, 0.02);
      expect(state.muffled).toBe(false);
    }
    state = nextMuffledDetectorState(state, 0.02);
    expect(state.muffled).toBe(true);
  });

  it("does not flag normal speech levels", () => {
    let state = createMuffledDetectorState();
    for (let i = 0; i < MUFFLED_SAMPLE_THRESHOLD + 5; i += 1) {
      state = nextMuffledDetectorState(state, 0.35);
    }
    expect(state.muffled).toBe(false);
    expect(state.lowStreak).toBe(0);
  });

  it("clears the hint after sustained speech recovery", () => {
    let state = createMuffledDetectorState();
    for (let i = 0; i < MUFFLED_SAMPLE_THRESHOLD; i += 1) {
      state = nextMuffledDetectorState(state, 0);
    }
    expect(state.muffled).toBe(true);

    for (let i = 0; i < MUFFLED_RECOVERY_SAMPLES - 1; i += 1) {
      state = nextMuffledDetectorState(state, 0.4);
      expect(state.muffled).toBe(true);
    }
    state = nextMuffledDetectorState(state, 0.4);
    expect(state.muffled).toBe(false);
  });

  it("resets the low streak when speech briefly returns before the threshold", () => {
    let state = createMuffledDetectorState();
    for (let i = 0; i < 20; i += 1) {
      state = nextMuffledDetectorState(state, 0.01);
    }
    state = nextMuffledDetectorState(state, 0.5);
    expect(state.lowStreak).toBe(0);
    expect(state.muffled).toBe(false);
  });
});
