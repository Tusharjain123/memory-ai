import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "./supabase-jwt.js";

export const REQUIRE_USER_KEY = "memory-ai:require-user";

/** Route needs a connected (Google) account. Everything else stays anonymous. */
export const RequireUser = () => SetMetadata(REQUIRE_USER_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
