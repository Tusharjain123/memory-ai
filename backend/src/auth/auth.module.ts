import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { OptionalAuthGuard } from "./optional-auth.guard.js";
import { SupabaseJwtVerifier } from "./supabase-jwt.js";

@Global()
@Module({
  providers: [
    SupabaseJwtVerifier,
    { provide: APP_GUARD, useClass: OptionalAuthGuard },
  ],
  exports: [SupabaseJwtVerifier],
})
export class AuthModule {}
