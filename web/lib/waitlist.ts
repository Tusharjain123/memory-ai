import { z } from "zod";

export type WaitlistSettings = {
  supabaseUrl?: string;
  supabaseSecretKey?: string;
};
const success = {
  ok: true,
  message:
    "You're on the list. We'll be in touch when early access is available.",
};
const unavailable =
  "Signup is temporarily unavailable. Please try again later.";
const schema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((value) => value.toLowerCase()),
    company: z.string().max(200).optional().default(""),
  })
  .strict();

export function waitlistConfigured(settings: WaitlistSettings): boolean {
  if (!settings.supabaseUrl?.trim() || !settings.supabaseSecretKey?.trim())
    return false;
  try {
    return ["https:", "http:"].includes(new URL(settings.supabaseUrl).protocol);
  } catch {
    return false;
  }
}
function reply(data: { ok: boolean; message: string }, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new Error("large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The only public operation is insert. Email records are never returned. */
export async function handleWaitlist(
  request: Request,
  settings: WaitlistSettings,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST")
    return reply({ ok: false, message: "Method not allowed." }, 405);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return reply(
      { ok: false, message: "Please submit a valid email address." },
      415,
    );
  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return reply(
      { ok: false, message: "Please submit a valid email address." },
      400,
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return reply(
      { ok: false, message: "Please enter a valid email address." },
      400,
    );
  if (parsed.data.company) return reply(success);
  if (!waitlistConfigured(settings))
    return reply({ ok: false, message: unavailable }, 503);
  try {
    const url = new URL("/rest/v1/waitlist_signups", settings.supabaseUrl!);
    url.searchParams.set("on_conflict", "email");
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: settings.supabaseSecretKey!,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ email: parsed.data.email }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return reply(success);
    if (response.status === 409) {
      const error = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      if (error?.code === "23505") return reply(success);
    }
    // Keep credentials, addresses and provider response bodies out of logs.
    console.error("Waitlist storage failed", { status: response.status });
    return reply({ ok: false, message: unavailable }, 503);
  } catch {
    console.error("Waitlist storage request failed");
    return reply({ ok: false, message: unavailable }, 503);
  }
}
