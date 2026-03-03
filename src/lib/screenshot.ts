import { chromium, type Browser } from "playwright";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return browser;
}

export interface ScreenshotOptions {
  url: string;
  width: number;
  height: number;
  fullPage: boolean;
}

export async function takeScreenshot(opts: ScreenshotOptions): Promise<string> {
  const { url, width, height, fullPage } = opts;
  
  const b = await getBrowser();
  const page = await b.newPage({
    viewport: { width, height },
  });
  
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    
    const buffer = await page.screenshot({
      type: "png",
      fullPage,
    });
    
    return Buffer.from(buffer).toString("base64");
  } finally {
    await page.close();
  }
}

// Cleanup on process exit
process.on("SIGTERM", async () => {
  if (browser) await browser.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  if (browser) await browser.close();
  process.exit(0);
});
