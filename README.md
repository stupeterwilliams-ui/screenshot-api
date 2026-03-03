# Screenshot API — Lucid Agent

Capture screenshots of web pages via headless browser. Pay per screenshot via x402 USDC payments on Base.

## Endpoints

| Method | Path | Price | Description |
|--------|------|-------|-------------|
| GET | /v1/screenshot | $0.005 | Capture webpage screenshot |
| GET | /health | Free | Health check |

## Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| url | string | required | URL to screenshot (http/https) |
| width | int | 1280 | Viewport width (100-3840) |
| height | int | 720 | Viewport height (100-3840) |
| fullPage | bool | false | Capture full page |

## Response

```json
{
  "url": "https://example.com",
  "screenshot": "<base64 PNG>",
  "mimeType": "image/png",
  "width": 1280,
  "height": 720,
  "capturedAt": "2026-03-03T18:00:00.000Z",
  "durationMs": 850
}
```

## Stack

- Bun runtime
- Playwright (Chromium)
- @lucid-agents/core + http + payments
- Hono
- Zod v4
- x402 payments (Base network)

## Development

```bash
bun install
npx playwright install chromium
bun test    # 21 tests
bun run dev
```
