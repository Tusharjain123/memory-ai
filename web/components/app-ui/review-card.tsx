import { Check, X, Pencil } from "lucide-react";

/* An illustration of the review step, built in CSS so it can play once.
   Nothing here is a control: every "button" is a <span>, so there is no
   focusable, dead affordance. The whole thing is one labelled image to a
   screen reader rather than a pile of decorative pseudo-UI.

   Its resting CSS is the FINISHED state — approved and saved. `.will-reveal`
   rewinds it, and `.is-visible` plays it forward. Under reduced motion
   `.will-reveal` is never applied, so the card simply shows its outcome. */
export function ReviewCard() {
  return (
    <div
      className="review-card recreation"
      data-reveal
      role="img"
      aria-label="An illustration of Memory AI's review step: an extracted commitment — send Aarav the revised proposal by Friday — being approved and saved to memory."
    >
      <span className="recreation-tag">Illustration</span>
      <div aria-hidden="true">
        <p className="review-kicker">
          Commitment <span>AI inference</span>
        </p>
        <h3 className="review-title">
          Send Aarav the revised proposal by Friday
        </h3>
        <blockquote className="review-evidence">
          <span className="review-meta">Speaker 1 · 0:04 · medium confidence</span>
          “I’ll get you the revised version before the weekend — Friday at the
          latest.”
        </blockquote>
        <div className="review-actions">
          <span className="review-pill review-approve">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 13l4 4L19 7"
                pathLength={100}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Approve
          </span>
          <span className="review-pill">
            <Pencil size={14} /> Correct
          </span>
          <span className="review-pill">
            <X size={14} /> Reject
          </span>
        </div>
        <p className="review-saved">
          <Check size={14} /> Saved to memory
        </p>
      </div>
    </div>
  );
}
