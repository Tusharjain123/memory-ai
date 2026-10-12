import { Injectable, Logger } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyLike } from "jose";

export type AuthUser = { id: string; email: string | null };

export type TokenVerifier = (token: string) => Promise<AuthUser>;

export function createTokenVerifier(options: {
  issuer: string;
  key: JWTVerifyGetKey | KeyLike | Uint8Array;
}): TokenVerifier {
  return async (token) => {
    const { payload } = await jwtVerify(token, options.key as JWTVerifyGetKey, {
      issuer: options.issuer,
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Token has no subject");
    }
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  };
}

/**
 * Verifies Supabase Auth access tokens locally (no network per request).
 * Uses the project's JWKS; falls back to the legacy HS256 secret when set.
 */
@Injectable()
export class SupabaseJwtVerifier {
  private readonly logger = new Logger(SupabaseJwtVerifier.name);
  private verifier?: TokenVerifier;

  verify(token: string): Promise<AuthUser> {
    this.verifier ??= this.build();
    return this.verifier(token);
  }

  private build(): TokenVerifier {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
    if (!url) {
      return async () => {
        throw new Error("SUPABASE_URL is not configured");
      };
    }
    const issuer = `${url}/auth/v1`;
    const legacySecret = process.env.SUPABASE_JWT_SECRET?.trim();
    if (legacySecret) {
      this.logger.log("Verifying Supabase tokens with the legacy JWT secret");
      return createTokenVerifier({ issuer, key: new TextEncoder().encode(legacySecret) });
    }
    return createTokenVerifier({
      issuer,
      key: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
    });
  }
}
