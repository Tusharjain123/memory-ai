/** Display label for a diarized speaker: the real name when the source knows it (Meet), else "Speaker N". */
export function speakerLabel(speaker: number, names?: readonly string[]): string {
  return names?.[speaker]?.trim() || `Speaker ${speaker + 1}`;
}
