import {
  BadRequestException,
  Logger,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { GoogleConnectionStatus, GoogleMeeting, ProcessingJobState } from "../contracts";
import { CurrentUser, RequireUser } from "../auth/auth.decorators.js";
import type { AuthUser } from "../auth/supabase-jwt.js";
import { mapWithConcurrency } from "../processing/ollama.service.js";
import { ProcessingQueueService } from "../processing/processing-queue.service.js";
import { GoogleCalendarService } from "./google-calendar.service.js";
import { GoogleApiException } from "./google-errors.js";
import { GoogleMeetService } from "./google-meet.service.js";
import { googleConfig, GoogleOAuthService } from "./google-oauth.service.js";
import { appReturnUrl, googleConsentUrl, oauthRedirectUri, signOAuthState, verifyOAuthState } from "./google-oauth-flow.js";

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

  /**
   * Starts "Connect Calendar & Meet": returns Google's consent page for the
   * app to open in the browser. Google then calls /v1/google/oauth/callback.
   */
  @Post("oauth/start")
  @HttpCode(200)
  startOAuth(@CurrentUser() user: AuthUser): { url: string } {
    const { clientId, key } = googleConfig();
    const redirectUri = oauthRedirectUri();
    if (!redirectUri) throw new ServiceUnavailableException("PUBLIC_API_URL is not configured");
    return { url: googleConsentUrl({ clientId, redirectUri, state: signOAuthState(user.id, key), loginHint: user.email }) };
  }

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

/**
 * Public landing for Google's consent page. The signed `state` identifies the
 * account; the code is exchanged for a refresh token and the browser is sent
 * back into the app.
 */
@Controller("v1/google/oauth")
export class GoogleOAuthCallbackController {
  private readonly logger = new Logger(GoogleOAuthCallbackController.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  @Get("callback")
  async callback(
    @Res() reply: FastifyReply,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") googleError?: string,
  ): Promise<void> {
    let target: string;
    try {
      const { key } = googleConfig();
      const userId = state ? verifyOAuthState(state, key) : null;
      if (googleError) {
        target = appReturnUrl({ error: googleError === "access_denied" ? "cancelled" : googleError });
      } else if (!userId || !code) {
        target = appReturnUrl({ error: "expired" });
      } else {
        await this.oauth.connect(userId, code, oauthRedirectUri() ?? "");
        target = appReturnUrl({ connected: true });
      }
    } catch (error) {
      const reason = error instanceof GoogleApiException
        ? String((error.getResponse() as { code?: string }).code ?? "failed")
        : "failed";
      this.logger.warn(`Google consent callback failed: ${error instanceof Error ? error.message : error}`);
      target = appReturnUrl({ error: reason });
    }
    void reply
      .status(302)
      .header("Location", target)
      .type("text/html")
      .send(returnPage(target));
  }
}

/** Fallback page if the browser doesn't follow the redirect into the app. */
function returnPage(target: string): string {
  const ok = target.includes("google=connected");
  const safe = target.replace(/"/g, "&quot;");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Memory AI</title>
<body style="font-family:system-ui,sans-serif;background:#081426;color:#F4F8FF;display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><h2 style="font-weight:600">${ok ? "Google Calendar connected" : "Couldn't connect Google Calendar"}</h2>
<p style="color:#A6B6CC">${ok ? "You can go back to Memory AI." : "Go back to Memory AI and try again."}</p>
<a href="${safe}" style="display:inline-block;margin-top:12px;padding:14px 22px;border-radius:999px;background:#36D2BC;color:#081426;font-weight:700;text-decoration:none">Return to Memory AI</a></div>
<script>location.replace("${safe}")</script></body>`;
}
