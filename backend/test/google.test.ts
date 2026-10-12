import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { mapCalendarEvent, parseMeetCode, pickNextEvent, plainDescription } from "../src/google/google-calendar.service.js";
import { parseMeetingRange } from "../src/google/google.controller.js";
import { summarizeTranscripts, MEET_RETENTION_MS } from "../src/google/google-meet.service.js";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_MEET_SCOPE,
  GoogleOAuthService,
  emailFromIdToken,
  missingScopes,
} from "../src/google/google-oauth.service.js";
import { meetEntriesToTranscript } from "../src/google/meet-transcript.js";
import { decryptToken, encryptToken, parseTokenKey } from "../src/google/token-crypto.js";
import { ProcessingQueueService, type ProcessingJob } from "../src/processing/processing-queue.service.js";
import { speakerLabel } from "../src/processing/speaker-label.js";
import { authoritativeSegments } from "../src/processing/transcript-fidelity.js";

const KEY = randomBytes(32);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function idToken(claims: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  process.env.GOOGLE_CLIENT_ID = "web.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY.toString("base64");
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY"]) {
    delete process.env[name];
  }
});

describe("token crypto", () => {
  it("round-trips and rejects tampering", () => {
    const sealed = encryptToken("1//refresh", KEY);
    expect(decryptToken(sealed, KEY)).toBe("1//refresh");
    const [iv, tag, data] = sealed.split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptToken(`${iv}:${tag}:${flipped.toString("base64")}`, KEY)).toThrow();
    expect(() => decryptToken(sealed, randomBytes(32))).toThrow();
  });

  it("only accepts 32-byte keys", () => {
    expect(parseTokenKey(undefined)).toBeNull();
    expect(parseTokenKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseTokenKey(KEY.toString("base64"))?.length).toBe(32);
  });
});

describe("meetEntriesToTranscript", () => {
  const names = new Map([
    ["conferenceRecords/a/participants/1", "Asha Rao"],
    ["conferenceRecords/a/participants/2", "Ben Ito"],
    ["conferenceRecords/b/participants/9", "Asha Rao"],
  ]);

  it("orders, names speakers, merges close same-speaker lines", () => {
    const result = meetEntriesToTranscript([
      { participant: "conferenceRecords/a/participants/2", text: "Sounds good.", startTime: "2026-10-10T10:00:05Z", endTime: "2026-10-10T10:00:06Z", languageCode: "en-US" },
      { participant: "conferenceRecords/a/participants/1", text: "Hi everyone.", startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T10:00:02Z", languageCode: "en-US" },
      { participant: "conferenceRecords/a/participants/1", text: "Let's start.", startTime: "2026-10-10T10:00:03Z", endTime: "2026-10-10T10:00:04Z", languageCode: "en-US" },
      { participant: "conferenceRecords/b/participants/9", text: "I'm back.", startTime: "2026-10-10T10:01:00Z", endTime: "2026-10-10T10:01:02Z", languageCode: "en-US" },
      { participant: "conferenceRecords/a/participants/7", text: "Unknown voice.", startTime: "2026-10-10T10:02:00Z", endTime: "2026-10-10T10:02:01Z", languageCode: "en-US" },
      { participant: "conferenceRecords/a/participants/2", text: "   ", startTime: "2026-10-10T10:03:00Z" },
    ], names);

    expect(result.speakerNames).toEqual(["Asha Rao", "Ben Ito", ""]);
    expect(result.utterances).toEqual([
      { speaker: 0, startMs: 0, endMs: 4_000, text: "Hi everyone. Let's start." },
      { speaker: 1, startMs: 5_000, endMs: 6_000, text: "Sounds good." },
      { speaker: 0, startMs: 60_000, endMs: 62_000, text: "I'm back." },
      { speaker: 2, startMs: 120_000, endMs: 121_000, text: "Unknown voice." },
    ]);
    expect(result.language).toBe("en");
    expect(result.durationMs).toBe(121_000);
    expect(result.rawTranscript.split("\n")).toHaveLength(4);
  });

  it("marks mixed-language meetings as multi and handles empty input", () => {
    const entries = Array.from({ length: 6 }, (_, index) => ({
      participant: "p",
      text: `line ${index}`,
      startTime: new Date(Date.UTC(2026, 9, 10, 10, index)).toISOString(),
      languageCode: index < 4 ? "hi-IN" : "en-IN",
    }));
    expect(meetEntriesToTranscript(entries, new Map()).language).toBe("multi");
    expect(meetEntriesToTranscript([], new Map()).utterances).toEqual([]);
  });
});

describe("speaker labels", () => {
  it("uses known names and falls back to Speaker N", () => {
    expect(speakerLabel(0, ["Asha", ""])).toBe("Asha");
    expect(speakerLabel(1, ["Asha", ""])).toBe("Speaker 2");
    expect(speakerLabel(3)).toBe("Speaker 4");
    const segments = authoritativeSegments({
      rawTranscript: "hi",
      language: "en",
      durationMs: 1_000,
      utterances: [{ speaker: 0, startMs: 0, endMs: 1_000, text: "hi" }],
      speakerNames: ["Asha"],
    });
    expect(segments[0]?.speakerLabel).toBe("Asha");
  });
});

describe("calendar mapping", () => {
  it("parses Meet codes from hangoutLink, entry points, or conference id", () => {
    expect(parseMeetCode({ hangoutLink: "https://meet.google.com/abc-defg-hij" })).toBe("abc-defg-hij");
    expect(parseMeetCode({ conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz-abcd-efg?pli=1" }] } })).toBe("xyz-abcd-efg");
    expect(parseMeetCode({ conferenceData: { conferenceId: "aaa-bbbb-ccc", conferenceSolution: { key: { type: "hangoutsMeet" } } } })).toBe("aaa-bbbb-ccc");
    expect(parseMeetCode({ conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://zoom.us/j/1" }] } })).toBeNull();
  });

  it("skips all-day and cancelled events and resource attendees; keeps RSVP state", () => {
    expect(mapCalendarEvent({ id: "a", start: { date: "2026-10-10" }, end: { date: "2026-10-11" } })).toBeNull();
    expect(mapCalendarEvent({ id: "a", status: "cancelled", start: { dateTime: "2026-10-10T10:00:00Z" }, end: { dateTime: "2026-10-10T11:00:00Z" } })).toBeNull();
    const meeting = mapCalendarEvent({
      id: "e1",
      start: { dateTime: "2026-10-10T10:00:00+05:30" },
      end: { dateTime: "2026-10-10T11:00:00+05:30" },
      attendees: [
        { email: "me@x.com", self: true },
        { email: "asha@x.com", displayName: "Asha" },
        { email: "no@x.com", responseStatus: "declined" },
        { email: "room@x.com", resource: true },
      ],
    });
    expect(meeting).toMatchObject({ eventId: "e1", title: "Untitled meeting", start: "2026-10-10T04:30:00.000Z", meetCode: null, description: null, organizer: null });
    expect(meeting?.attendees).toEqual([
      { name: null, email: "me@x.com", self: true, organizer: false, response: "needsAction" },
      { name: "Asha", email: "asha@x.com", self: false, organizer: false, response: "needsAction" },
      { name: null, email: "no@x.com", self: false, organizer: false, response: "declined" },
    ]);
  });

  it("validates meeting ranges", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    const range = parseMeetingRange(undefined, undefined, now);
    expect(range.to.getTime() - range.from.getTime()).toBe(21 * 24 * 60 * 60_000);
    expect(() => parseMeetingRange("2026-10-10", "2026-10-01", now)).toThrow();
    expect(() => parseMeetingRange("2026-01-01", "2026-10-01", now)).toThrow();
  });
});

describe("summarizeTranscripts", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const past = { start: "2026-10-10T10:00:00Z", end: "2026-10-10T11:00:00Z", meetCode: "abc-defg-hij" };
  const record = [{ name: "conferenceRecords/r1" }];

  it("maps states", () => {
    expect(summarizeTranscripts({ ...past, start: "2026-10-12T10:00:00Z" }, null, [], now).transcriptStatus).toBe("upcoming");
    expect(summarizeTranscripts({ ...past, meetCode: null }, null, [], now).transcriptStatus).toBe("none");
    expect(summarizeTranscripts(past, [], [], now).transcriptStatus).toBe("none");
    expect(summarizeTranscripts(past, record, [{ name: "t", state: "STARTED" }], now).transcriptStatus).toBe("processing");
    expect(summarizeTranscripts(past, record, [
      { name: "t", state: "FILE_GENERATED", docsDestination: { exportUri: "https://docs.google.com/d/1" } },
    ], now)).toEqual({ transcriptStatus: "available", docUrl: "https://docs.google.com/d/1" });
    const old = { ...past, end: new Date(now - MEET_RETENTION_MS - 1).toISOString(), start: "2026-08-01T10:00:00Z" };
    expect(summarizeTranscripts(old, [], [], now).transcriptStatus).toBe("expired");
  });
});

describe("GoogleOAuthService", () => {
  it("helpers read email and required scopes", () => {
    expect(emailFromIdToken(idToken({ email: "a@x.com" }))).toBe("a@x.com");
    expect(emailFromIdToken("garbage")).toBeNull();
    expect(missingScopes(`openid ${GOOGLE_CALENDAR_SCOPE}`)).toEqual([GOOGLE_MEET_SCOPE]);
  });

  it("connect stores an encrypted refresh token", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        const params = new URLSearchParams(String(init?.body));
        expect(params.get("grant_type")).toBe("authorization_code");
        expect(params.get("code")).toBe("4/code");
        return json({
          access_token: "ya29.a",
          expires_in: 3600,
          refresh_token: "1//r",
          scope: `openid ${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_MEET_SCOPE}`,
          id_token: idToken({ email: "a@x.com" }),
        });
      }
      if (url.includes("google_connections") && init?.method === "POST") {
        const row = JSON.parse(String(init.body)) as { refresh_token_ciphertext: string; google_email: string };
        expect(row.refresh_token_ciphertext).not.toContain("1//r");
        expect(decryptToken(row.refresh_token_ciphertext, KEY)).toBe("1//r");
        expect(row.google_email).toBe("a@x.com");
        return new Response(null, { status: 201 });
      }
      // Account rows already exist: nothing new created, no welcome credit.
      if (url.includes("/rest/v1/users") || url.includes("/rest/v1/user_balance")) return json([]);
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new GoogleOAuthService();
    await expect(service.connect("u1", "4/code")).resolves.toEqual({ connected: true, email: "a@x.com", status: "active" });
    // Access token is cached from the exchange: no refresh call.
    await expect(service.accessToken("u1")).resolves.toBe("ya29.a");
    // Token exchange, ensure users row, ensure wallet, save connection.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("apply_credit_transaction"))).toBe(false);
  });

  it("rejects missing scopes and missing refresh tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "a", scope: GOOGLE_CALENDAR_SCOPE, refresh_token: "r" })));
    await expect(new GoogleOAuthService().connect("u1", "c")).rejects.toMatchObject({ status: 400 });

    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("oauth2")
        ? json({ access_token: "a", scope: `${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_MEET_SCOPE}` })
        : json([])));
    await expect(new GoogleOAuthService().connect("u1", "c")).rejects.toMatchObject({
      response: { code: "google_no_refresh_token" },
    });
  });

  it("marks the connection expired on invalid_grant", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("google_connections") && !init?.method) {
        return json([{ user_id: "u1", google_email: null, scopes: [], status: "active", refresh_token_ciphertext: encryptToken("1//r", KEY) }]);
      }
      if (url.includes("oauth2")) return json({ error: "invalid_grant" }, 400);
      return new Response(null, { status: 204 });
    }));
    await expect(new GoogleOAuthService().accessToken("u1")).rejects.toMatchObject({
      status: 409,
      response: { code: "google_reconnect" },
    });
    expect(calls.some((call) => call.startsWith("PATCH") && call.includes("google_connections"))).toBe(true);
  });

  it("reports not connected when no row exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    const service = new GoogleOAuthService();
    await expect(service.status("u1")).resolves.toEqual({ connected: false, email: null, status: "disconnected" });
    await expect(service.accessToken("u1")).rejects.toMatchObject({ response: { code: "google_not_connected" } });
  });
});

describe("transcript jobs", () => {
  it("skip Deepgram and pass speaker names to assemble", async () => {
    const deepgram = { transcribe: vi.fn() };
    const assembled = { title: "t" };
    const ollama = { assemble: vi.fn(async () => assembled) };
    const tempAudio = { remove: vi.fn() };
    const results = { save: vi.fn() };
    const queue = new ProcessingQueueService(deepgram as never, ollama as never, tempAudio as never, results as never, {} as never);
    const transcript = {
      rawTranscript: "Hi",
      language: "en",
      durationMs: 1_000,
      utterances: [{ speaker: 0, startMs: 0, endMs: 1_000, text: "Hi" }],
      speakerNames: ["Asha"],
    };
    const job = {
      id: "job-1",
      data: { kind: "transcript", transcript } as ProcessingJob,
      updateProgress: vi.fn(),
      updateData: vi.fn(),
    };
    await queue.runJob(job as unknown as Job<ProcessingJob, { stored: true }>);
    expect(deepgram.transcribe).not.toHaveBeenCalled();
    expect(tempAudio.remove).not.toHaveBeenCalled();
    expect(ollama.assemble).toHaveBeenCalledWith(transcript, expect.anything());
    expect(job.updateData.mock.calls[0]?.[0]).toMatchObject({ preview: { transcript: "Asha: Hi" } });
    expect(results.save).toHaveBeenCalledWith("job-1", assembled, expect.any(Number));
  });

  it("audio jobs add attendees as keyterms and speaker hints", async () => {
    const transcript = { rawTranscript: "x", language: "en", durationMs: 1, utterances: [] };
    const deepgram = { transcribe: vi.fn(async () => transcript) };
    const ollama = { assemble: vi.fn(async () => ({})) };
    const queue = new ProcessingQueueService(deepgram as never, ollama as never, { remove: vi.fn() } as never, { save: vi.fn() } as never, {} as never);
    const job = {
      id: "j",
      data: { audioPath: "/a", directory: "/d", mimetype: "audio/m4a", keyterms: ["Acme"], attendees: ["Asha Rao"] } as ProcessingJob,
      updateProgress: vi.fn(),
      updateData: vi.fn(),
    };
    await queue.runJob(job as unknown as Job<ProcessingJob, { stored: true }>);
    expect(deepgram.transcribe).toHaveBeenCalledWith("/a", "audio/m4a", expect.objectContaining({ keyterms: ["Acme", "Asha Rao"] }));
    expect(ollama.assemble).toHaveBeenCalledWith({ ...transcript, speakerHints: ["Asha Rao"] }, expect.anything());
  });
});

describe("pickNextEvent", () => {
  const event = (id: string, start: string, end: string) => ({ eventId: id, title: id, start, end, meetCode: null, htmlLink: null, description: null, location: null, organizer: null, attendees: [] });
  const now = Date.parse("2026-10-11T10:00:00Z");
  it("prefers in-progress, then soonest upcoming, never ended", () => {
    const ended = event("ended", "2026-10-11T08:00:00Z", "2026-10-11T09:00:00Z");
    const live = event("live", "2026-10-11T09:30:00Z", "2026-10-11T10:30:00Z");
    const soon = event("soon", "2026-10-11T11:00:00Z", "2026-10-11T11:30:00Z");
    const later = event("later", "2026-10-11T15:00:00Z", "2026-10-11T16:00:00Z");
    expect(pickNextEvent([ended, later, soon, live], now)?.eventId).toBe("live");
    expect(pickNextEvent([ended, later, soon], now)?.eventId).toBe("soon");
    expect(pickNextEvent([ended], now)).toBeNull();
  });
});

describe("plainDescription", () => {
  it("strips HTML and decodes entities", () => {
    expect(plainDescription("<p>Agenda:</p><ul><li>Q4 &amp; hiring</li><li>Budget</li></ul>Join <a href='x'>here</a><br>Thanks&nbsp;!"))
      .toBe("Agenda:\n• Q4 & hiring\n• Budget\nJoin here\nThanks !");
    expect(plainDescription("   ")).toBeNull();
    expect(plainDescription("x".repeat(2_100))?.endsWith("…")).toBe(true);
  });
});

describe("Google consent (web) flow", () => {
  it("signs state for one user and rejects tampering or expiry", async () => {
    const { signOAuthState, verifyOAuthState, OAUTH_STATE_TTL_MS } = await import("../src/google/google-oauth-flow.js");
    const key = Buffer.alloc(32, 7);
    const now = 1_000_000;
    const state = signOAuthState("user-1", key, now);
    expect(verifyOAuthState(state, key, now + 1_000)).toBe("user-1");
    expect(verifyOAuthState(state, Buffer.alloc(32, 8), now)).toBeNull();
    expect(verifyOAuthState(`${state}x`, key, now)).toBeNull();
    expect(verifyOAuthState(state, key, now + OAUTH_STATE_TTL_MS + 1)).toBeNull();
    expect(verifyOAuthState("garbage", key, now)).toBeNull();
  });

  it("asks Google for offline access with a consent prompt and returns into the app", async () => {
    const { googleConsentUrl, appReturnUrl } = await import("../src/google/google-oauth-flow.js");
    const url = new URL(googleConsentUrl({ clientId: "cid", redirectUri: "https://api.example.com/v1/google/oauth/callback", state: "s", loginHint: "a@b.co" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("calendar.events.readonly");
    expect(url.searchParams.get("scope")).toContain("meetings.space.readonly");
    expect(url.searchParams.get("login_hint")).toBe("a@b.co");
    expect(appReturnUrl({ connected: true })).toBe("memoryai://calendar?google=connected");
    expect(appReturnUrl({ error: "access denied" })).toBe("memoryai://calendar?google=error&reason=access%20denied");
  });
});
