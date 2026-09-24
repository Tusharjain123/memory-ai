"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle } from "lucide-react";

type State = "idle" | "pending" | "success" | "error";
type Result = { ok: boolean; message: string };
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => Promise<Result>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

export function WaitlistForm({ available }: { available: boolean }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const submit = useCallback(
    async (value: string, trap = ""): Promise<Result> => {
      if (busy.current)
        return { ok: false, message: "A signup is already in progress." };
      if (!available)
        return { ok: false, message: "Early-access signup opens soon." };
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ||
        value.trim().length > 254
      ) {
        const result = {
          ok: false,
          message: "Please enter a valid email address.",
        };
        setState("error");
        setMessage(result.message);
        return result;
      }
      busy.current = true;
      setState("pending");
      setMessage("");
      try {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value, company: trap }),
          signal: AbortSignal.timeout(12000),
        });
        const result = (await response
          .json()
          .catch(() => null)) as Result | null;
        if (!result || typeof result.message !== "string")
          throw new Error("We could not save your email. Please try again.");
        if (!response.ok || result.ok !== true)
          throw new Error(
            result.message || "We could not save your email. Please try again.",
          );
        setState("success");
        setMessage(result.message);
        return result;
      } catch (error) {
        const result = {
          ok: false,
          message:
            error instanceof Error &&
            error.name !== "TimeoutError" &&
            error.name !== "TypeError"
              ? error.message
              : "We could not save your email. Please try again.",
        };
        setState("error");
        setMessage(result.message);
        return result;
      } finally {
        busy.current = false;
      }
    },
    [available],
  );
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "join_early_access",
            description:
              "Save an email address to the Memory AI early-access list so the owner can send access updates. This submits contact information; it does not create an account or send an email now.",
            inputSchema: {
              type: "object",
              properties: {
                email: { type: "string", format: "email", maxLength: 254 },
              },
              required: ["email"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                !("email" in input) ||
                typeof input.email !== "string"
              )
                return { ok: false, message: "An email address is required." };
              if (!available)
                return {
                  ok: false,
                  message: "Early-access signup opens soon.",
                };
              setEmail(input.email);
              return submit(input.email);
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Progressive enhancement only. */
    }
    return () => controller.abort();
  }, [submit, available]);
  return (
    <div id="early-access" className="hero-signup">
      <p className="signup-invitation">
        Your next conversation could be the start.
      </p>
      {state === "success" ? (
        <div className="signup-success" role="status">
          <CheckCircle2 size={23} />
          <div>
            <strong>You’re on the list.</strong>
            <p>We’ll be in touch when early access is available.</p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(email, company);
          }}
          aria-label="Early-access signup"
        >
          <label htmlFor="waitlist-email" className="sr-only">
            Email address
          </label>
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="company">Company website</label>
            <input
              id="company"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>
          <div className="email-control">
            <input
              id="waitlist-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="Your email address"
              maxLength={254}
              required
              disabled={!available || state === "pending"}
              aria-describedby="signup-note signup-message"
              aria-invalid={state === "error"}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (state === "error") {
                  setState("idle");
                  setMessage("");
                }
              }}
            />
            <button
              className="button"
              type="submit"
              disabled={!available || state === "pending"}
            >
              {state === "pending" ? (
                <>
                  Joining… <LoaderCircle className="spin" size={19} />
                </>
              ) : (
                <>
                  Join early access <ArrowUpRight size={19} />
                </>
              )}
            </button>
          </div>
          <p
            id="signup-message"
            className="form-message"
            role={state === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        </form>
      )}
      <p id="signup-note" className="form-note">
        {!available
          ? "Early-access signup opens soon. Explore the idea in the meantime."
          : "By joining, you agree to receive Memory AI early-access updates. No account needed."}
      </p>
    </div>
  );
}
