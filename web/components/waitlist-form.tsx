"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { buttonPrimary } from "@/lib/ui";
import { cn } from "@/lib/utils";

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

/* The page renders this twice — in the hero and again in the closing
   section. Ids are prefixed per instance so labels and descriptions never
   point at the other form, and only the hero registers the agent tool. */
export function WaitlistForm({
  available,
  instance = "hero",
}: {
  available: boolean;
  instance?: "hero" | "closing";
}) {
  const id = (name: string) =>
    instance === "hero" ? name : `${instance}-${name}`;
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
    if (instance !== "hero") return;
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
  }, [submit, available, instance]);
  return (
    <div id={id("early-access")} className="mx-auto w-full max-w-[520px] scroll-mt-28">
      {state === "success" ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-3xl border border-line bg-surface px-5 py-4 text-left shadow-card"
        >
          <CheckCircle2 size={24} className="shrink-0 text-accent-ink" />
          <div>
            <strong className="block text-ink">You’re on the list.</strong>
            <p className="text-sm text-muted">
              We’ll be in touch when early access is available.
            </p>
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
          <label htmlFor={id("waitlist-email")} className="sr-only">
            Email address
          </label>
          <div
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px overflow-hidden"
          >
            <label htmlFor={id("company")}>Company website</label>
            <input
              id={id("company")}
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-5 shadow-float transition focus-within:border-accent-ink has-[input[aria-invalid=true]]:border-red-500/70">
            <input
              id={id("waitlist-email")}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="Enter email"
              maxLength={254}
              required
              disabled={!available || state === "pending"}
              aria-describedby={`${id("signup-note")} ${id("signup-message")}`}
              aria-invalid={state === "error"}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (state === "error") {
                  setState("idle");
                  setMessage("");
                }
              }}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-ink outline-none placeholder:text-faint focus-visible:outline-none disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!available || state === "pending"}
              className={cn(buttonPrimary, "px-5 py-3 max-[420px]:px-4")}
            >
              {state === "pending" ? (
                <>
                  Joining… <LoaderCircle className="animate-spin" size={17} />
                </>
              ) : (
                <>
                  Join the waitlist
                  <ArrowUpRight size={17} className="max-[420px]:hidden" />
                </>
              )}
            </button>
          </div>
          <p
            id={id("signup-message")}
            role={state === "error" ? "alert" : "status"}
            className="mt-2 min-h-5 text-sm font-medium text-red-700 dark:text-red-300"
          >
            {message}
          </p>
        </form>
      )}
      <p id={id("signup-note")} className="mt-1 text-[0.8125rem] text-faint">
        {!available
          ? "Early-access signup opens soon."
          : "For iOS and Android · 5,000 free tokens to start"}
      </p>
    </div>
  );
}
