import { useState } from "react";
import type { ConfidenceLevel } from "../contracts";
import { useClipPlayer } from "../hooks/useClipPlayer";
import { EvidenceCard } from "./EvidenceCard";

export function PlayableEvidence({
  recordingUri,
  quote,
  speakerLabel,
  speakerName,
  startMs,
  confidence,
}: {
  recordingUri: string | null | undefined;
  quote: string | null;
  speakerLabel: string | null;
  speakerName?: string | null;
  startMs: number | null;
  confidence?: ConfidenceLevel | null;
}) {
  const clip = useClipPlayer(recordingUri);
  const [active, setActive] = useState(false);

  return (
    <EvidenceCard
      quote={quote}
      speakerLabel={speakerLabel}
      {...(speakerName !== undefined ? { speakerName } : {})}
      startMs={startMs}
      {...(confidence !== undefined ? { confidence } : {})}
      playing={clip.playing && active}
      available={clip.available}
      onPlay={() => {
        if (startMs == null) return;
        setActive(true);
        void clip.playFrom(startMs);
      }}
    />
  );
}
