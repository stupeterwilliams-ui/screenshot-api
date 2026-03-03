import { describe, test, expect, beforeAll } from "bun:test";

let appFetch: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.ENABLE_PAYMENTS = "false";
  process.env.AGENT_NAME = "screenshot-api-test";
  process.env.AGENT_VERSION = "1.0.0-test";
  process.env.PAYMENTS_RECEIVABLE_ADDRESS = "0x0000000000000000000000000000000000000000";
  process.env.PAYMENTS_NETWORK = "eip155:8453";
  process.env.PAYMENTS_FACILITATOR_URL = "https://facilitator.daydreams.systems";
  process.env.FACILITATOR_URL = "https://facilitator.daydreams.systems";
  
  const { app } = await import("../lib/agent");
  appFetch = app.fetch;
});

// ===== Contract Tests: Health =====

describe("Health endpoint", () => {
  test("GET /health returns 200", async () => {
    const res = await appFetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("GET /health returns correct content-type", async () => {
    const res = await appFetch(new Request("http://localhost/health"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ===== Contract Tests: Manifest =====

describe("Agent manifest", () => {
  test("GET /.well-known/agent.json returns manifest", async () => {
    const res = await appFetch(new Request("http://localhost/.well-known/agent.json"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("screenshot-api-test");
    expect(body.skills).toBeDefined();
    expect(Array.isArray(body.skills)).toBe(true);
  });

  test("manifest includes screenshot skill", async () => {
    const res = await appFetch(new Request("http://localhost/.well-known/agent.json"));
    const body = await res.json();
    const skill = body.skills.find((s: any) => s.id === "screenshot");
    expect(skill).toBeDefined();
  });

  test("manifest includes health skill", async () => {
    const res = await appFetch(new Request("http://localhost/.well-known/agent.json"));
    const body = await res.json();
    const skill = body.skills.find((s: any) => s.id === "health");
    expect(skill).toBeDefined();
  });
});

// ===== Logic Tests: URL Validation =====

describe("URL validation", () => {
  test("rejects missing url parameter", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot"));
    expect(res.status).toBe(422);
  });

  test("rejects invalid URL", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=not-a-url"));
    expect(res.status).toBe(422);
  });

  test("rejects empty url", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url="));
    expect(res.status).toBe(422);
  });
});

// ===== Logic Tests: Viewport Bounds =====

describe("Viewport bounds validation", () => {
  test("rejects width below minimum (100)", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&width=50"));
    expect(res.status).toBe(422);
  });

  test("rejects width above maximum (3840)", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&width=5000"));
    expect(res.status).toBe(422);
  });

  test("rejects height below minimum (100)", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&height=10"));
    expect(res.status).toBe(422);
  });

  test("rejects height above maximum (3840)", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&height=5000"));
    expect(res.status).toBe(422);
  });

  test("accepts valid dimensions", async () => {
    // Just validates — won't fail on dimension check
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&width=800&height=600"));
    // Should be 200 (actual screenshot) or 500 (if puppeteer not available)
    expect(res.status).not.toBe(422);
  }, 30_000);
});

// ===== Integration Tests: Screenshot Capture =====

describe("Screenshot capture (integration)", () => {
  test("captures screenshot of example.com with defaults", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://example.com");
    expect(body.screenshot).toBeDefined();
    expect(typeof body.screenshot).toBe("string");
    expect(body.screenshot.length).toBeGreaterThan(100);
    expect(body.mimeType).toBe("image/png");
    expect(body.width).toBe(1280);
    expect(body.height).toBe(720);
    expect(body.capturedAt).toBeDefined();
    expect(body.durationMs).toBeGreaterThan(0);
  }, 30_000);

  test("captures screenshot with custom viewport", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&width=800&height=600"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.width).toBe(800);
    expect(body.height).toBe(600);
  }, 30_000);

  test("captures full-page screenshot", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com&fullPage=true"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.screenshot.length).toBeGreaterThan(100);
  }, 30_000);

  test("screenshot is valid base64 PNG", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const buf = Buffer.from(body.screenshot, "base64");
    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  }, 30_000);

  test("returns ISO 8601 timestamp", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const date = new Date(body.capturedAt);
    expect(date.toISOString()).toBe(body.capturedAt);
  }, 30_000);

  test("durationMs is a positive number", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.durationMs).toBe("number");
    expect(body.durationMs).toBeGreaterThan(0);
  }, 30_000);
});

// ===== Error Handling =====

describe("Error handling", () => {
  test("returns error for unreachable domain", async () => {
    const res = await appFetch(new Request("http://localhost/v1/screenshot?url=https://this-domain-does-not-exist-xyz123.com"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  }, 35_000);
});

// ===== Entrypoint route (framework) =====

describe("Framework entrypoint route", () => {
  test("POST /entrypoints/screenshot/invoke exists", async () => {
    const res = await appFetch(new Request("http://localhost/entrypoints/screenshot/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    }));
    // Should not be 404 (may be 402 with payments or 200 without)
    expect(res.status).not.toBe(404);
  }, 30_000);
});
