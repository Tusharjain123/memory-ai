import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWaitlist, waitlistConfigured } from "../lib/waitlist.ts";

const settings = {
  supabaseUrl: "https://example.supabase.co",
  supabaseSecretKey: "test-server-secret",
};
const request = (body: unknown) =>
  new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const forbiddenFetch: typeof fetch = async () => {
  assert.fail("Storage must not be called");
};

test("normalizes email and inserts through the server with duplicate-safe headers", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://example.supabase.co/rest/v1/waitlist_signups?on_conflict=email",
    );
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "demo@example.com",
    });
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), settings.supabaseSecretKey);
    assert.equal(
      headers.get("Prefer"),
      "resolution=ignore-duplicates,return=minimal",
    );
    return new Response(null, { status: 201 });
  };
  const first = await handleWaitlist(
    request({ email: "  Demo@Example.com  " }),
    settings,
    fetcher,
  );
  const second = await handleWaitlist(
    request({ email: "demo@example.com" }),
    settings,
    fetcher,
  );
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(calls, 2);
  assert.equal(first.headers.get("Cache-Control"), "no-store");
});

test("a unique-email conflict gives the same success without revealing existing signups", async () => {
  const result = await handleWaitlist(
    request({ email: "demo@example.com" }),
    settings,
    async () => Response.json({ code: "23505" }, { status: 409 }),
  );
  assert.equal(result.status, 200);
  assert.equal(((await result.json()) as { ok: boolean }).ok, true);
});

test("rejects invalid, missing, oversized and unexpected fields before storage", async () => {
  for (const body of [
    { email: "bad" },
    {},
    { email: 42 },
    { email: "a".repeat(255) + "@example.com" },
    { email: "demo@example.com", admin: true },
    { email: "demo@example.com", company: "x".repeat(2100) },
  ]) {
    assert.equal(
      (await handleWaitlist(request(body), settings, forbiddenFetch)).status,
      400,
    );
  }
});

test("rejects malformed JSON, unsupported content type and non-POST requests", async () => {
  const malformed = new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(
    (await handleWaitlist(malformed, settings, forbiddenFetch)).status,
    400,
  );
  const plain = new Request("http://localhost/api/waitlist", {
    method: "POST",
    body: "demo@example.com",
  });
  assert.equal(
    (await handleWaitlist(plain, settings, forbiddenFetch)).status,
    415,
  );
  assert.equal(
    (
      await handleWaitlist(
        new Request("http://localhost/api/waitlist"),
        settings,
        forbiddenFetch,
      )
    ).status,
    405,
  );
});

test("honeypot returns a neutral success but never stores the address", async () => {
  const result = await handleWaitlist(
    request({ email: "demo@example.com", company: "bot.example" }),
    settings,
    forbiddenFetch,
  );
  assert.equal(result.status, 200);
  assert.equal(((await result.json()) as { ok: boolean }).ok, true);
});

test("missing or invalid configuration is honestly unavailable", async () => {
  for (const config of [
    {},
    { supabaseUrl: settings.supabaseUrl },
    { ...settings, supabaseUrl: "invalid" },
  ]) {
    assert.equal(waitlistConfigured(config), false);
    const result = await handleWaitlist(
      request({ email: "demo@example.com" }),
      config,
      forbiddenFetch,
    );
    assert.equal(result.status, 503);
    assert.equal(((await result.json()) as { ok: boolean }).ok, false);
  }
});

test("storage failures are recoverable and private provider details stay private", async () => {
  for (const status of [401, 409, 500]) {
    const result = await handleWaitlist(
      request({ email: "demo@example.com" }),
      settings,
      async () =>
        Response.json(
          { code: "other", message: "private-provider-detail" },
          { status },
        ),
    );
    assert.equal(result.status, 503);
    assert.doesNotMatch(
      await result.text(),
      /private-provider-detail|test-server-secret/,
    );
  }
  const failed = await handleWaitlist(
    request({ email: "demo@example.com" }),
    settings,
    async () => {
      throw new DOMException("Timeout", "TimeoutError");
    },
  );
  assert.equal(failed.status, 503);
  const retry = await handleWaitlist(
    request({ email: "demo@example.com" }),
    settings,
    async () => new Response(null, { status: 201 }),
  );
  assert.equal(retry.status, 200);
});
