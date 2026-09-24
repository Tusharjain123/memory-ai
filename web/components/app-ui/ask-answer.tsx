import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";

const QUESTION = "What did I promise Aarav last week?";

/* Split into clauses purely for line rhythm inside the card.

   This card is deliberately NOT animated. It lives in .hero-memory, which is
   rotated and composited, and Chrome refuses to paint animated or
   transitioned children there — they compute to opacity 1, report `finished`,
   and never appear. The hero carries its motion in the audio meter, the
   floating phone and the pointer tilt instead. */
const CLAUSES = [
  "You agreed to send the revised Atlas proposal by Friday,",
  "with a tighter executive summary",
  "and both pricing options.",
];

/* The whole answer is plain text in the DOM, so assistive technology reads it
   once, normally: no live region, no DOM mutation, nothing to re-announce. */
export function AskAnswer() {
  return (
    <div className="ask-answer">
      <p className="ask-question">{QUESTION}</p>
      <div className="ask-reply">
        <span className="ask-avatar" aria-hidden="true">
          <Sparkles size={13} />
        </span>
        <div>
          <strong>Memory</strong>
          <p className="ask-text">
            {CLAUSES.map((clause, index) => (
              <span
                key={index}
                className="ask-clause"
                style={{ "--i": index } as CSSProperties}
              >
                {clause}{" "}
              </span>
            ))}
          </p>
        </div>
      </div>
      <p className="ask-source">
        <span />
        Client catch-up with Aarav · Friday
      </p>
    </div>
  );
}
