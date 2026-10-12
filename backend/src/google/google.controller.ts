import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { GoogleConnectionStatus, GoogleMeeting, ProcessingJobState } from "../contracts";
import { CurrentUser, RequireUser } from "../auth/auth.decorators.js";
import type { AuthUser } from "../auth/supabase-jwt.js";
import { mapWithConcurrency } from "../processing/ollama.service.js";
import { ProcessingQueueService } from "../processing/processing-queue.service.js";
import { GoogleCalendarService } from "./google-calendar.service.js";
import { GoogleApiException } from "./google-errors.js";
import { GoogleMeetService } from "./google-meet.service.js";
import { GoogleOAuthService } from "./google-oauth.service.js";

const DAY_MS = 24 * 60 * 60_000;
const MAX_RANGE_MS = 62 * DAY_MS;

export function parseMeetingRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now = Date.now(),
): { from: Date; to: Date } {
  const from = fromRaw ? new Date(fromRaw) : new Date(now - 14 * DAY_MS);
  const to = toRaw ? new Date(toRaw) : new Date(now + 7 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new BadRequestException("from and to must be ISO dates with from before to");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new BadRequestException("Meeting range can be at most 62 days");
  }
  return { from, to };
}

/** Google Calendar + Meet for a connected account. Requires Connect Google. */
@Controller("v1/me/google")
@RequireUser()
export class GoogleController {
  constructor(
    private readonly oauth: GoogleOAuthService,
    private readonly calendar: GoogleCalendarService,
    private readonly meet: GoogleMeetService,
    private readonly queue: ProcessingQueueService,
  ) {}

  @Post("connect")
  @HttpCode(200)
  connect(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<GoogleConnectionStatus> {
    const code =
      typeof body === "object" && body !== null && "serverAuthCode" in body
        ? String(body.serverAuthCode ?? "").trim()
        : "";
    if (!code) throw new BadRequestException("serverAuthCode is required");
    return this.oauth.connect(user.id, code);
  }

  @Get("status")
  status(@CurrentUser() user: AuthUser): Promise<GoogleConnectionStatus> {
    return this.oauth.status(user.id);
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@CurrentUser() user: AuthUser): Promise<void> {
    await this.oauth.disconnect(user.id);
  }

  @Get("meetings")
  async meetings(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<GoogleMeeting[]> {
    const range = parseMeetingRange(from, to);
    // Every timed event is shown on the calendar; only Meet calls can have transcripts.
    const events = await this.calendar.listEvents(user.id, range.from, range.to);
    return mapWithConcurrency(events, 4, async (event) => ({
      ...event,
      ...(await this.meet.transcriptInfo(user.id, event)),
    }));
  }

  @Get("meetings/:eventId")
  async meeting(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string): Promise<GoogleMeeting> {
    const event = await this.calendar.getEvent(user.id, eventId);
    if (!event) {
      throw new GoogleApiException(HttpStatus.NOT_FOUND, "google_not_found", "Meeting not found");
    }
    return { ...event, ...(await this.meet.transcriptInfo(user.id, event)) };
  }

  @Get("calendar/current")
  async currentEvent(@CurrentUser() user: AuthUser) {
    return { event: await this.calendar.currentEvent(user.id) };
  }

  @Get("calendar/next")
  async nextEvent(@CurrentUser() user: AuthUser) {
    return { event: await this.calendar.nextEvent(user.id) };
  }

  /** Starts processing a Meet transcript; poll POST v1/conversations/process/status. */
  @Post("meetings/:eventId/import")
  @HttpCode(202)
  async importMeeting(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
  ): Promise<ProcessingJobState> {
    const event = await this.calendar.getEvent(user.id, eventId);
    if (!event) {
      throw new GoogleApiException(HttpStatus.NOT_FOUND, "no_transcript", "Meeting not found");
    }
    const transcript = await this.meet.fetchTranscript(user.id, event);
    const jobId = await this.queue.enqueue(
      { kind: "transcript", transcript, title: event.title },
      { userId: user.id },
    );
    return { status: "queued", jobId };
  }
}
