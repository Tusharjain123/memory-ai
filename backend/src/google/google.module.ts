import { Module } from "@nestjs/common";
import { ProcessingModule } from "../processing/processing.module.js";
import { GoogleCalendarService } from "./google-calendar.service.js";
import { GoogleController } from "./google.controller.js";
import { GoogleMeetService } from "./google-meet.service.js";
import { GoogleOAuthService } from "./google-oauth.service.js";

@Module({
  imports: [ProcessingModule],
  controllers: [GoogleController],
  providers: [GoogleOAuthService, GoogleCalendarService, GoogleMeetService],
})
export class GoogleModule {}
