import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";
import { takeScreenshot } from "./screenshot";

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const MIN_DIMENSION = 100;
const MAX_DIMENSION = 3840;

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "screenshot-api",
  version: process.env.AGENT_VERSION ?? "1.0.0",
  description:
    process.env.AGENT_DESCRIPTION ??
    "Capture screenshots of web pages via headless browser",
})
  .use(http())
  .use(payments({ 
    config: {
      ...paymentsFromEnv(),
      privateKey: process.env.PRIVATE_KEY,
    }
  }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// --- Health endpoint (free) ---

addEntrypoint({
  key: "health",
  description: "Health check",
  input: z.object({}),
  output: z.object({ status: z.string(), version: z.string() }),
  handler: async () => ({
    output: {
      status: "ok",
      version: process.env.AGENT_VERSION ?? "1.0.0",
    },
  }),
});

// --- Screenshot endpoint ($0.005) ---

addEntrypoint({
  key: "screenshot",
  description: "Capture a screenshot of a web page",
  input: z.object({
    url: z.string().url("Must be a valid URL"),
    width: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION).default(DEFAULT_WIDTH),
    height: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION).default(DEFAULT_HEIGHT),
    fullPage: z.boolean().default(false),
  }),
  output: z.object({
    url: z.string(),
    screenshot: z.string(),
    mimeType: z.string(),
    width: z.number(),
    height: z.number(),
    capturedAt: z.string(),
    durationMs: z.number(),
  }),
  price: process.env.ENABLE_PAYMENTS === "true" ? "5000" : undefined,
  handler: async (ctx) => {
    const { url, width, height, fullPage } = ctx.input as {
      url: string;
      width: number;
      height: number;
      fullPage: boolean;
    };

    // Validate URL scheme
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL must use http or https protocol");
    }

    const start = Date.now();
    const screenshotBase64 = await takeScreenshot({ url, width, height, fullPage });
    const durationMs = Date.now() - start;

    return {
      output: {
        url,
        screenshot: screenshotBase64,
        mimeType: "image/png",
        width,
        height,
        capturedAt: new Date().toISOString(),
        durationMs,
      },
    };
  },
});

// --- Custom route matching bounty spec: GET /v1/screenshot ---

app.get("/v1/screenshot", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    return c.json({ error: "url query parameter is required" }, 422);
  }

  try {
    new URL(url);
  } catch {
    return c.json({ error: "Invalid URL" }, 422);
  }

  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return c.json({ error: "URL must use http or https protocol" }, 422);
  }

  const widthStr = c.req.query("width");
  const heightStr = c.req.query("height");
  const fullPageStr = c.req.query("fullPage");

  const width = widthStr ? parseInt(widthStr) : DEFAULT_WIDTH;
  const height = heightStr ? parseInt(heightStr) : DEFAULT_HEIGHT;
  const fullPage = fullPageStr === "true";

  if (isNaN(width) || width < MIN_DIMENSION || width > MAX_DIMENSION ||
      isNaN(height) || height < MIN_DIMENSION || height > MAX_DIMENSION) {
    return c.json({ error: "Width and height must be integers between 100 and 3840" }, 422);
  }

  const start = Date.now();
  try {
    const screenshotBase64 = await takeScreenshot({ url, width, height, fullPage });
    const durationMs = Date.now() - start;

    return c.json({
      url,
      screenshot: screenshotBase64,
      mimeType: "image/png",
      width,
      height,
      capturedAt: new Date().toISOString(),
      durationMs,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Screenshot failed" }, 500);
  }
});

export { app };
