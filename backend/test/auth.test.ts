import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { REQUIRE_USER_KEY } from "../src/auth/auth.decorators.js";
import { bearerToken, OptionalAuthGuard } from "../src/auth/optional-auth.guard.js";
import {
  createTokenVerifier,
  type AuthUser,
  type SupabaseJwtVerifier,
} from "../src/auth/supabase-jwt.js";

const ISSUER = "https://project.supabase.co/auth/v1";

async function keySetup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "ES256" };
  const verify = createTokenVerifier({ issuer: ISSUER, key: createLocalJWKSet({ keys: [jwk] }) });
  const sign = (claims: Record<string, unknown>, options: { issuer?: string; audience?: string; exp?: string | number } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject("11111111-1111-1111-1111-111111111111")
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? "authenticated")
      .setIssuedAt()
      .setExpirationTime(options.exp ?? "1h")
      .sign(privateKey);
  return { verify, sign };
}

function context(headers: Record<string, string>, required: boolean) {
  const request: { headers: Record<string, string>; user?: AuthUser } = { headers };
  const handler = () => undefined;
  if (required) Reflect.defineMetadata(REQUIRE_USER_KEY, true, handler);
  const ctx = {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function guardWith(verify: (token: string) => Promise<AuthUser>) {
  return new OptionalAuthGuard(new Reflector(), { verify } as unknown as SupabaseJwtVerifier);
}

describe("Supabase token verifier", () => {
  it("accepts a valid Supabase access token", async () => {
    const { verify, sign } = await keySetup();
    await expect(verify(await sign({ email: "a@example.com" }))).resolves.toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "a@example.com",
    });
  });

  it("rejects expired, wrong-issuer and wrong-audience tokens", async () => {
    const { verify, sign } = await keySetup();
    await expect(verify(await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 }))).rejects.toThrow();
    await expect(verify(await sign({}, { issuer: "https://evil.example/auth/v1" }))).rejects.toThrow();
    await expect(verify(await sign({}, { audience: "anon" }))).rejects.toThrow();
  });
});

describe("OptionalAuthGuard", () => {
  const user = { id: "u1", email: null };

  it("parses bearer headers", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer  abc ")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });

  it("lets anonymous requests through on normal routes", async () => {
    const { ctx, request } = context({}, false);
    await expect(guardWith(async () => user).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it("attaches the user when a valid token is sent", async () => {
    const { ctx, request } = context({ authorization: "Bearer good" }, false);
    await guardWith(async () => user).canActivate(ctx);
    expect(request.user).toEqual(user);
  });

  it("ignores a bad token on normal routes so processing never breaks", async () => {
    const { ctx, request } = context({ authorization: "Bearer bad" }, false);
    await expect(guardWith(async () => {
      throw new Error("expired");
    }).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it("requires a valid token on @RequireUser routes", async () => {
    const failing = guardWith(async () => {
      throw new Error("expired");
    });
    await expect(failing.canActivate(context({}, true).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(failing.canActivate(context({ authorization: "Bearer bad" }, true).ctx))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guardWith(async () => user).canActivate(context({ authorization: "Bearer good" }, true).ctx))
      .resolves.toBe(true);
  });
});
