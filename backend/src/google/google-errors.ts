import { HttpException, HttpStatus } from "@nestjs/common";

/** Errors carry a stable `code` so the app can offer Connect / Reconnect. */
export class GoogleApiException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ statusCode: status, code, message }, status);
  }
}

export function googleNotConnected(): GoogleApiException {
  return new GoogleApiException(
    HttpStatus.NOT_FOUND,
    "google_not_connected",
    "Connect Google Calendar & Meet first",
  );
}

export function googleReconnectRequired(): GoogleApiException {
  return new GoogleApiException(
    HttpStatus.CONFLICT,
    "google_reconnect",
    "Google access expired. Reconnect Google Calendar & Meet.",
  );
}
