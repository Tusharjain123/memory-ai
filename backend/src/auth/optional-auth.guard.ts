import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_USER_KEY } from "./auth.decorators.js";
import { SupabaseJwtVerifier, type AuthUser } from "./supabase-jwt.js";

type AuthRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

export function bearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Global guard. The app works without an account, so a missing or invalid
 * token only matters on @RequireUser() routes; elsewhere the request simply
 * stays anonymous.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SupabaseJwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_USER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false;

    const token = bearerToken(request.headers.authorization);
    if (token) {
      try {
        request.user = await this.verifier.verify(token);
      } catch {
        if (required) throw new UnauthorizedException("Sign-in expired. Connect Google again.");
      }
    }
    if (required && !request.user) {
      throw new UnauthorizedException("Connect Google to use cloud features");
    }
    return true;
  }
}
