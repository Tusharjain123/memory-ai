import type { CSSProperties } from "react";

/* A hand-tuned envelope, not a sine and not Math.random(): syllable clusters of
   three to five tall bars broken by one or two near-silent ones, under a slow
   loudness arc. Frozen (reduced motion) it still reads as recorded speech. */
const ENVELOPE = [
  6, 11, 24, 38, 30, 14, 7, 5, 18, 34, 52, 44, 26, 9, 6, 12, 29, 48, 61, 55, 33,
  12, 7, 16, 36, 50, 40, 21, 10, 15, 8, 5,
];

export function WaveMeter({
  className,
  bars = ENVELOPE.length,
}: {
  className?: string;
  bars?: number;
}) {
  return (
    <span
      className={`wave-meter${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {ENVELOPE.slice(0, bars).map((height, index) => (
        <span
          key={index}
          style={{ "--h": `${height}px`, "--i": index } as CSSProperties}
        />
      ))}
    </span>
  );
}
