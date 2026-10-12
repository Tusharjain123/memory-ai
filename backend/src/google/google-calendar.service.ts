import { Injectable } from "@nestjs/common";
import type { GoogleAttendeeResponse, GoogleMeetingAttendee } from "../contracts";
import { GoogleOAuthService } from "./google-oauth.service.js";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  description?: string;
  location?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    self?: boolean;
    organizer?: boolean;
    resource?: boolean;
    responseStatus?: string;
  }>;
  conferenceData?: {
    conferenceId?: string;
    conferenceSolution?: { key?: { type?: string } };
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

/** A calendar event reduced to what Memory AI needs. */
export type CalendarMeeting = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  meetCode: string | null;
  htmlLink: string | null;
  description: string | null;
  location: string | null;
  organizer: { name: string | null; email: string | null; self: boolean } | null;
  attendees: GoogleMeetingAttendee[];
};

const DESCRIPTION_MAX = 2_000;
const RESPONSES = new Set<GoogleAttendeeResponse>(["accepted", "declined", "tentative", "needsAction"]);

/** Calendar descriptions are often HTML; keep readable plain text. */
export function plainDescription(html: string | undefined): string | null {
  if (!html?.trim()) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX).trimEnd()}…` : text;
}

const MEET_CODE = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i;

export function parseMeetCode(event: CalendarEvent): string | null {
  const uris = [
    event.hangoutLink,
    ...(event.conferenceData?.entryPoints ?? [])
      .filter((entry) => entry.entryPointType === "video")
      .map((entry) => entry.uri),
  ];
  for (const uri of uris) {
    const match = uri ? MEET_CODE.exec(uri) : null;
    if (match?.[1]) return match[1].toLowerCase();
  }
  if (event.conferenceData?.conferenceSolution?.key?.type === "hangoutsMeet") {
    const id = event.conferenceData.conferenceId?.toLowerCase();
    if (id && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(id)) return id;
  }
  return null;
}

/** Timed, non-cancelled events only; all-day events are not meetings. */
export function mapCalendarEvent(event: CalendarEvent): CalendarMeeting | null {
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!event.id || !start || !end || event.status === "cancelled") return null;
  return {
    eventId: event.id,
    title: event.summary?.trim() || "Untitled meeting",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    meetCode: parseMeetCode(event),
    htmlLink: event.htmlLink ?? null,
    description: plainDescription(event.description),
    location: event.location?.trim() || null,
    organizer: event.organizer
      ? {
          name: event.organizer.displayName?.trim() || null,
          email: event.organizer.email ?? null,
          self: Boolean(event.organizer.self),
        }
      : null,
    attendees: (event.attendees ?? [])
      .filter((attendee) => !attendee.resource)
      .map((attendee) => ({
        name: attendee.displayName?.trim() || null,
        email: attendee.email ?? null,
        self: Boolean(attendee.self),
        organizer: Boolean(attendee.organizer),
        response: RESPONSES.has(attendee.responseStatus as GoogleAttendeeResponse)
          ? (attendee.responseStatus as GoogleAttendeeResponse)
          : "needsAction",
      })),
  };
}

/** In-progress events first, then the soonest upcoming one; ended events never qualify. */
export function pickNextEvent(events: CalendarMeeting[], now: number): CalendarMeeting | null {
  const live = events.filter((event) => Date.parse(event.end) > now);
  const inProgress = live
    .filter((event) => Date.parse(event.start) <= now)
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  if (inProgress[0]) return inProgress[0];
  return live.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;
}

@Injectable()
export class GoogleCalendarService {
  constructor(private readonly oauth: GoogleOAuthService) {}

  async listEvents(userId: string, from: Date, to: Date): Promise<CalendarMeeting[]> {
    const meetings: CalendarMeeting[] = [];
    let pageToken: string | undefined;
    // Two pages of 250 is plenty for a few weeks; stop there to bound latency.
    for (let page = 0; page < 2; page += 1) {
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        maxResults: "250",
        ...(pageToken ? { pageToken } : {}),
      });
      const body = await this.oauth.getJson<{ items?: CalendarEvent[]; nextPageToken?: string }>(
        userId,
        `${CALENDAR_BASE}?${params.toString()}`,
      );
      for (const event of body.items ?? []) {
        const meeting = mapCalendarEvent(event);
        if (meeting) meetings.push(meeting);
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return meetings;
  }

  async getEvent(userId: string, eventId: string): Promise<CalendarMeeting | null> {
    const event = await this.oauth.getJson<CalendarEvent>(
      userId,
      `${CALENDAR_BASE}/${encodeURIComponent(eventId)}`,
    );
    return mapCalendarEvent(event);
  }

  /** For Home's "Up next": an event in progress or starting within 12 hours. */
  async nextEvent(userId: string, now = new Date()): Promise<CalendarMeeting | null> {
    const events = await this.listEvents(userId, new Date(now.getTime() - 4 * 60 * 60_000), new Date(now.getTime() + 12 * 60 * 60_000));
    return pickNextEvent(events, now.getTime());
  }

  /** The event happening now (or about to start), to attach to a new recording. */
  async currentEvent(userId: string, now = new Date()): Promise<CalendarMeeting | null> {
    const events = await this.listEvents(
      userId,
      new Date(now.getTime() - 10 * 60_000),
      new Date(now.getTime() + 15 * 60_000),
    );
    const time = now.getTime();
    const ranked = events
      .map((event) => {
        const start = Date.parse(event.start);
        const end = Date.parse(event.end);
        const inProgress = start <= time && time < end;
        return { event, inProgress, distance: Math.abs(start - time), end };
      })
      .filter((item) => item.inProgress || item.distance <= 15 * 60_000)
      .filter((item) => item.end > time - 10 * 60_000)
      .sort((a, b) => Number(b.inProgress) - Number(a.inProgress) || a.distance - b.distance);
    return ranked[0]?.event ?? null;
  }
}
