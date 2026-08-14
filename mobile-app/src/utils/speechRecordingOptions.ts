/** ASR-critical capture settings (mono speech, not stereo HIGH_QUALITY). */
export const SPEECH_CAPTURE = {
  extension: ".m4a" as const,
  sampleRate: 48_000,
  numberOfChannels: 1,
  bitRate: 128_000,
  androidAudioSource: "voice_recognition" as const,
};
