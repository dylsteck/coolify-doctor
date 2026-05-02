import { describe, expect, it } from "vitest";
import { bearerGet, coolifyV1Url, sentinelApiUrl } from "./coolify_api.js";

describe("coolifyV1Url", () => {
  it("appends /api/v1 and normalizes slashes", () => {
    expect(coolifyV1Url("http://coolify:8000", "/applications")).toBe("http://coolify:8000/api/v1/applications");
    expect(coolifyV1Url("http://coolify:8000/", "applications")).toBe("http://coolify:8000/api/v1/applications");
  });
});

describe("sentinelApiUrl", () => {
  it("joins base and /api paths", () => {
    expect(sentinelApiUrl("http://s:8080", "/api/memory/current")).toBe("http://s:8080/api/memory/current");
    expect(sentinelApiUrl("http://s:8080/", "api/health")).toBe("http://s:8080/api/health");
  });
});

describe("bearerGet", () => {
  it("sends Authorization header", async () => {
    const calls: RequestInit[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response('{"ok":true}', { status: 200 });
    };
    try {
      const r = await bearerGet("https://example.com/x", "tok");
      expect(r.ok).toBe(true);
      expect(r.status).toBe(200);
      expect(calls[0]?.headers).toBeDefined();
      const h = new Headers(calls[0]?.headers as HeadersInit);
      expect(h.get("Authorization")).toBe("Bearer tok");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
