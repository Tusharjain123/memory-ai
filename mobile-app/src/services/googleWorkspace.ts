import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import type {
  GoogleConnectionStatus,
  GoogleMeeting,
  ProcessedConversation,
  ProcessingJobState,
  ProcessingPreview,
} from "../contracts";
import { getImportedConversationIds, saveConversation, type ConversationCalendarEvent } from "../db/conversations";
import { useAuthStore } from "../store/useAuthStore";
import { authorizedFetch } from "./apiFetch";
import { GOOGLE_WORKSPACE_SCOPES, configureGoogle } from "./googleSignin";
import { pollProcessingJob } from "./processing";

export const MEET_IMPORT_PREFIX = "google_meet:";

/** Backend error with its stable code (google_reconnect, no_transcript, …). */
export class GoogleWorkspaceError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number) {
    super(message);
  }
}

async function readError(response: Response, fallback: string): Promise<GoogleWorkspaceError> {
  let code: string | null = null;
  let message = fallback;
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.message === "string" && body.message) message = body.message;
  } catch {
    // Non-JSON error body: keep the fallback.
  }
  if (code === "google_reconnect") useAuthStore.getState().patch({ calendarStatus: "expired" });
  if (code === "google_not_connected") useAuthStore.getState().patch({ calendarStatus: "disconnected" });
  return new GoogleWorkspaceError(message, code, response.status);
}

function applyStatus(status: GoogleConnectionStatus): void {
  useAuthStore.getState().patch({
    calendarStatus: status.connected ? "connected" : status.status === "expired" ? "expired" : "disconnected",
    calendarEmail: status.email,
  });
}

export async function refreshCalendarStatus(): Promise<GoogleConnectionStatus> {
  const response = await authorizedFetch("/v1/me/google/status");
  if (!response.ok) throw await readError(response, "Could not check Google Calendar");
  const status = (await response.json()) as GoogleConnectionStatus;
  applyStatus(status);
  return status;
}

/** One-time server auth code that includes Calendar + Meet read-only access. */
async function serverAuthCodeWithScopes(): Promise<string | null> {
  configureGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  if (!GoogleSignin.getCurrentUser()) {
    await GoogleSignin.signInSilently().catch(() => undefined);
  }
  if (GoogleSignin.getCurrentUser()) {
    const added = await GoogleSignin.addScopes({ scopes: GOOGLE_WORKSPACE_SCOPES });
    if (added && !isSuccessResponse(added)) return null;
    if (added?.data.serverAuthCode) return added.data.serverAuthCode;
  }
  // No code from addScopes (already granted, or no Google session): sign in with the scopes.
  configureGoogle(GOOGLE_WORKSPACE_SCOPES);
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  if (!response.data.serverAuthCode) throw new Error("Google didn't return an authorization code");
  return response.data.serverAuthCode;
}

/** Asks for Calendar + Meet read-only access. Returns false if the user cancelled. */
export async function connectCalendar(): Promise<boolean> {
  const code = await serverAuthCodeWithScopes();
  if (!code) return false;
  const response = await authorizedFetch("/v1/me/google/connect", {
    method: "POST",
    body: JSON.stringify({ serverAuthCode: code }),
  });
  if (!response.ok) throw await readError(response, "Could not connect Google Calendar");
  applyStatus((await response.json()) as GoogleConnectionStatus);
  return true;
}

export async function disconnectCalendar(): Promise<void> {
  const response = await authorizedFetch("/v1/me/google", { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw await readError(response, "Could not disconnect Google Calendar");
  useAuthStore.getState().patch({ calendarStatus: "disconnected", calendarEmail: null });
}

export async function listGoogleMeetings(range?: { from: Date; to: Date }): Promise<GoogleMeeting[]> {
  const query = range
    ? `?${new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() }).toString()}`
    : "";
  const response = await authorizedFetch(`/v1/me/google/meetings${query}`);
  if (!response.ok) throw await readError(response, "Could not load your meetings");
  const meetings = (await response.json()) as GoogleMeeting[];
  for (const meeting of meetings) meetingCache.set(meeting.eventId, meeting);
  return meetings;
}

// Last loaded meetings, so the meeting screen can render instantly before refreshing.
const meetingCache = new Map<string, GoogleMeeting>();

export function cachedMeeting(eventId: string): GoogleMeeting | null {
  return meetingCache.get(eventId) ?? null;
}

export async function getGoogleMeeting(eventId: string): Promise<GoogleMeeting> {
  const response = await authorizedFetch(`/v1/me/google/meetings/${encodeURIComponent(eventId)}`);
  if (!response.ok) throw await readError(response, "Could not load this meeting");
  const meeting = (await response.json()) as GoogleMeeting;
  meetingCache.set(meeting.eventId, meeting);
  return meeting;
}

/** Meet imports already on this device: eventId → conversation id. */
export async function importedMeetings(): Promise<Map<string, string>> {
  const rows = await getImportedConversationIds(MEET_IMPORT_PREFIX);
  return new Map([...rows].map(([externalId, id]) => [externalId.slice(MEET_IMPORT_PREFIX.length), id]));
}

export function calendarEventFromMeeting(meeting: Pick<GoogleMeeting, "eventId" | "title" | "start" | "end" | "attendees">): ConversationCalendarEvent {
  return {
    eventId: meeting.eventId,
    title: meeting.title,
    start: meeting.start,
    end: meeting.end,
    attendees: meeting.attendees
      .filter((attendee) => !attendee.self && attendee.response !== "declined")
      .map((attendee) => attendee.name ?? attendee.email ?? "")
      .filter(Boolean),
  };
}

/** The calendar event happening now, for a new recording. Null if none or not connected. */
export async function currentCalendarEvent(): Promise<ConversationCalendarEvent | null> {
  if (useAuthStore.getState().calendarStatus !== "connected") return null;
  const response = await authorizedFetch("/v1/me/google/calendar/current");
  if (!response.ok) throw await readError(response, "Could not read your calendar");
  const { event } = (await response.json()) as { event: GoogleMeeting | null };
  return event ? calendarEventFromMeeting(event) : null;
}

/** Next meeting for Home's "Up next" card: in progress or within 12 hours. */
export async function nextCalendarEvent(): Promise<GoogleMeeting | null> {
  if (useAuthStore.getState().calendarStatus !== "connected") return null;
  const response = await authorizedFetch("/v1/me/google/calendar/next");
  if (!response.ok) throw await readError(response, "Could not read your calendar");
  const { event } = (await response.json()) as { event: Omit<GoogleMeeting, "transcriptStatus" | "docUrl"> | null };
  return event ? { ...event, transcriptStatus: "upcoming", docUrl: null } : null;
}

/**
 * Imports a Meet transcript: the backend fetches and processes it, then the
 * result is saved on this device like any recording. Returns the conversation id.
 */
export async function importMeeting(
  meeting: GoogleMeeting,
  options: { onProgress?: (progress: number) => void; onPreview?: (preview: ProcessingPreview) => void } = {},
): Promise<string> {
  const externalId = `${MEET_IMPORT_PREFIX}${meeting.eventId}`;
  const existing = (await getImportedConversationIds(externalId)).get(externalId);
  if (existing) return existing;
  options.onProgress?.(5);
  const response = await authorizedFetch(
    `/v1/me/google/meetings/${encodeURIComponent(meeting.eventId)}/import`,
    { method: "POST" },
  );
  if (!response.ok) throw await readError(response, "Could not import this meeting");
  const queued = (await response.json()) as ProcessingJobState;
  if (queued.status !== "queued") throw new Error("The import was not queued");
  const durationSec = Math.max(60, (Date.parse(meeting.end) - Date.parse(meeting.start)) / 1000);
  const result: ProcessedConversation = await pollProcessingJob(queued.jobId, { ...options, durationSec });
  return saveConversation(result, null, undefined, {
    source: "google_meet",
    externalId,
    occurredAt: meeting.start,
    calendarEvent: calendarEventFromMeeting(meeting),
  });
}
