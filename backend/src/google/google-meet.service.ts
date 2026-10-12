import { HttpStatus, Injectable } from "@nestjs/common";
import type { GoogleTranscriptStatus } from "../contracts";
import type { DeepgramResult } from "../processing/deepgram.service.js";
import { mapWithConcurrency } from "../processing/ollama.service.js";
import type { CalendarMeeting } from "./google-calendar.service.js";
import { GoogleApiException } from "./google-errors.js";
import { GoogleOAuthService } from "./google-oauth.service.js";
import { meetEntriesToTranscript, type MeetTranscriptEntry } from "./meet-transcript.js";

const MEET_BASE = "https://meet.googleapis.com/v2";
/** Meet keeps conference records and transcript entries for 30 days. */
export const MEET_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RECORD_WINDOW_MS = 60 * 60_000;
const MAX_ENTRY_PAGES = 100;
const LOOKUP_CONCURRENCY = 4;

type ConferenceRecord = { name: string; startTime?: string; endTime?: string };

export type MeetTranscript = {
  name: string;
  state?: "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";
  docsDestination?: { document?: string; exportUri?: string };
};

type Participant = {
  signedinUser?: { displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

export type MeetingTranscriptInfo = {
  transcriptStatus: GoogleTranscriptStatus;
  docUrl: string | null;
};

const READY_STATES = new Set(["ENDED", "FILE_GENERATED"]);

/** Status of a meeting's transcript from its conference records' transcripts. */
export function summarizeTranscripts(
  meeting: Pick<CalendarMeeting, "start" | "end" | "meetCode">,
  records: ConferenceRecord[] | null,
  transcripts: MeetTranscript[],
  now = Date.now(),
): MeetingTranscriptInfo {
  if (Date.parse(meeting.start) > now) return { transcriptStatus: "upcoming", docUrl: null };
  if (!meeting.meetCode) return { transcriptStatus: "none", docUrl: null };
  const docUrl = transcripts.find((item) => item.docsDestination?.exportUri)?.docsDestination?.exportUri ?? null;
  if (!records?.length) {
    const expired = now - Date.parse(meeting.end) > MEET_RETENTION_MS;
    return { transcriptStatus: expired ? "expired" : "none", docUrl: null };
  }
  if (transcripts.some((item) => READY_STATES.has(item.state ?? ""))) {
    return { transcriptStatus: "available", docUrl };
  }
  if (transcripts.some((item) => item.state === "STARTED")) {
    return { transcriptStatus: "processing", docUrl };
  }
  return { transcriptStatus: "none", docUrl };
}

@Injectable()
export class GoogleMeetService {
  constructor(private readonly oauth: GoogleOAuthService) {}

  async transcriptInfo(userId: string, meeting: CalendarMeeting): Promise<MeetingTranscriptInfo> {
    if (Date.parse(meeting.start) > Date.now() || !meeting.meetCode) {
      return summarizeTranscripts(meeting, null, []);
    }
    const records = await this.conferenceRecords(userId, meeting);
    const transcripts = (
      await mapWithConcurrency(records, LOOKUP_CONCURRENCY, (record) => this.transcripts(userId, record))
    ).flat();
    return summarizeTranscripts(meeting, records, transcripts);
  }

  /** Fetches every finished transcript for the meeting as one pipeline transcript. */
  async fetchTranscript(userId: string, meeting: CalendarMeeting): Promise<DeepgramResult> {
    if (!meeting.meetCode) {
      throw new GoogleApiException(HttpStatus.NOT_FOUND, "no_transcript", "This event has no Google Meet link");
    }
    const records = await this.conferenceRecords(userId, meeting);
    const transcripts = (
      await mapWithConcurrency(records, LOOKUP_CONCURRENCY, (record) => this.transcripts(userId, record))
    ).flat();
    const info = summarizeTranscripts(meeting, records, transcripts);
    if (info.transcriptStatus === "expired") {
      throw new GoogleApiException(
        HttpStatus.GONE,
        "transcript_expired",
        "Google only keeps Meet transcripts available for import for 30 days",
      );
    }
    if (info.transcriptStatus === "processing") {
      throw new GoogleApiException(
        HttpStatus.CONFLICT,
        "transcript_processing",
        "Google is still preparing this transcript. Try again in a few minutes.",
      );
    }
    const ready = transcripts.filter((item) => READY_STATES.has(item.state ?? ""));
    if (!ready.length) {
      throw new GoogleApiException(HttpStatus.NOT_FOUND, "no_transcript", "No Meet transcript for this meeting");
    }

    const entries = (
      await mapWithConcurrency(ready, 2, (transcript) => this.entries(userId, transcript.name))
    ).flat();
    const participantIds = [...new Set(entries.map((entry) => entry.participant).filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    await mapWithConcurrency(participantIds, LOOKUP_CONCURRENCY, async (id) => {
      const name = await this.participantName(userId, id);
      if (name) names.set(id, name);
    });
    const transcript = meetEntriesToTranscript(entries, names);
    if (!transcript.utterances.length) {
      throw new GoogleApiException(HttpStatus.NOT_FOUND, "no_transcript", "The Meet transcript is empty");
    }
    return transcript;
  }

  private async conferenceRecords(userId: string, meeting: CalendarMeeting): Promise<ConferenceRecord[]> {
    const from = new Date(Date.parse(meeting.start) - RECORD_WINDOW_MS).toISOString();
    const to = new Date(Date.parse(meeting.end) + RECORD_WINDOW_MS).toISOString();
    const filter = `space.meeting_code = "${meeting.meetCode}" AND start_time >= "${from}" AND start_time <= "${to}"`;
    const body = await this.oauth.getJson<{ conferenceRecords?: ConferenceRecord[] }>(
      userId,
      `${MEET_BASE}/conferenceRecords?${new URLSearchParams({ filter, pageSize: "25" }).toString()}`,
    );
    return body.conferenceRecords ?? [];
  }

  private async transcripts(userId: string, record: ConferenceRecord): Promise<MeetTranscript[]> {
    const body = await this.oauth.getJson<{ transcripts?: MeetTranscript[] }>(
      userId,
      `${MEET_BASE}/${record.name}/transcripts?pageSize=25`,
    );
    return body.transcripts ?? [];
  }

  private async entries(userId: string, transcriptName: string): Promise<MeetTranscriptEntry[]> {
    const entries: MeetTranscriptEntry[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_ENTRY_PAGES; page += 1) {
      const params = new URLSearchParams({ pageSize: "100", ...(pageToken ? { pageToken } : {}) });
      const body = await this.oauth.getJson<{ transcriptEntries?: MeetTranscriptEntry[]; nextPageToken?: string }>(
        userId,
        `${MEET_BASE}/${transcriptName}/entries?${params.toString()}`,
      );
      entries.push(...(body.transcriptEntries ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return entries;
  }

  private async participantName(userId: string, participant: string): Promise<string | null> {
    try {
      const body = await this.oauth.getJson<Participant>(userId, `${MEET_BASE}/${participant}`);
      return (
        body.signedinUser?.displayName ??
        body.anonymousUser?.displayName ??
        body.phoneUser?.displayName ??
        null
      );
    } catch {
      // A missing name only downgrades the label to "Speaker N".
      return null;
    }
  }
}
