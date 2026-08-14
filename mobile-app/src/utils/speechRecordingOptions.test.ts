import { describe, expect, it } from "vitest";
import { SPEECH_CAPTURE } from "./speechRecordingOptions";

describe("SPEECH_CAPTURE", () => {
  it("records mono 48 kHz speech for ASR", () => {
    expect(SPEECH_CAPTURE.numberOfChannels).toBe(1);
    expect(SPEECH_CAPTURE.sampleRate).toBe(48_000);
    expect(SPEECH_CAPTURE.bitRate).toBe(128_000);
    expect(SPEECH_CAPTURE.extension).toBe(".m4a");
    expect(SPEECH_CAPTURE.androidAudioSource).toBe("voice_recognition");
  });
});
