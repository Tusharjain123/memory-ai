import type { CSSProperties } from "react";

/* An illustration of notes scribbled after a day of calls, where the details
   that matter are the ones already slipping: each key figure blurs out in
   turn once the card scrolls into view.

   Resting CSS is the FINISHED (faded) state, so reduced motion shows the
   point of the picture rather than a crisp notepad. */
const NOTES: { label: string; detail: string; tail?: string }[] = [
  { label: "Budget", detail: "₹4.5L", tail: "? or 5?" },
  { label: "Deadline", detail: "Thursday", tail: "… or Friday" },
  { label: "Promised Aarav", detail: "revised proposal", tail: " + ???" },
  { label: "Priya wants", detail: "the onboarding card", tail: " (?)" },
];

export function FadingNotes() {
  return (
    <div
      className="fading-notes recreation"
      data-reveal
      role="img"
      aria-label="An illustration of end-of-day notes where the budget, the deadline and the promises made are already blurring."
    >
      <span className="recreation-tag">Illustration</span>
      <div aria-hidden="true">
        <p className="notes-head">
          Notes <span>6:02 pm · after four calls</span>
        </p>
        <ul className="notes-lines">
          {NOTES.map((note, index) => (
            <li key={note.label} style={{ "--i": index } as CSSProperties}>
              <span className="notes-label">{note.label}:</span>{" "}
              <span className="notes-detail">{note.detail}</span>
              {note.tail && <span className="notes-tail">{note.tail}</span>}
            </li>
          ))}
        </ul>
        <p className="notes-foot">Wait — what did I say about the timeline?</p>
      </div>
    </div>
  );
}
