import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { WaveMeter } from "./wave-meter";

/* An illustration of a recording in progress: three lines of a one-to-one
   conversation arrive, and the promise in the last one is caught.

   It must never sit inside a rotated or composited parent — Chrome then
   refuses to paint its animated children (see ask-answer.tsx). In the hero it
   is its own absolutely positioned, unrotated layer for that reason.

   Resting CSS is the FINISHED state: every line shown, the promise marked.
   `.will-reveal` rewinds it and `.is-visible` plays it, so reduced motion
   simply shows the outcome. */
const LINES = [
  { who: "Aarav", text: "Can we see both pricing options?" },
  { who: "You", text: "Sure, with a tighter executive summary." },
];

export function LiveCapture() {
  return (
    <div
      className="live-capture recreation"
      data-reveal
      role="img"
      aria-label="An illustration of Memory AI recording a coffee meeting with Aarav and catching the promise: I’ll send the revised proposal by Friday."
    >
      <span className="recreation-tag">Illustration</span>
      <div aria-hidden="true">
        <p className="live-head">
          <span className="live-dot" />
          Recording · Coffee with Aarav
          <span className="live-time">12:04</span>
        </p>
        <WaveMeter className="live-wave" bars={26} />
        <ul className="live-lines">
          {LINES.map((line, index) => (
            <li key={line.text} style={{ "--i": index } as CSSProperties}>
              <b>{line.who}</b>
              {line.text}
            </li>
          ))}
          <li className="live-promise" style={{ "--i": 2 } as CSSProperties}>
            <b>You</b>
            <mark>I’ll send the revised proposal by Friday.</mark>
          </li>
        </ul>
        <p className="live-caught">
          <Check size={14} /> Promise caught
        </p>
      </div>
    </div>
  );
}
