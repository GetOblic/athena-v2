/**
 * Runtime Chromium availability check for Playwright fallback.
 * Does not download browsers.
 */

import { chromium } from "playwright";

let cachedAvailable: boolean | null = null;
let cachedError: string | null = null;

export function resetChromiumAvailabilityCache(): void {
  cachedAvailable = null;
  cachedError = null;
}

export async function checkChromiumAvailable(): Promise<{
  available: boolean;
  executablePath: string | null;
  error: string | null;
}> {
  if (cachedAvailable !== null) {
    return {
      available: cachedAvailable,
      executablePath: cachedAvailable ? chromium.executablePath() : null,
      error: cachedError,
    };
  }

  try {
    const executablePath = chromium.executablePath();
    if (!executablePath) {
      cachedAvailable = false;
      cachedError =
        "PLAYWRIGHT_CHROMIUM_UNAVAILABLE: Chromium executable path is empty. Run: npx playwright install chromium";
      return { available: false, executablePath: null, error: cachedError };
    }

    const browser = await chromium.launch({
      headless: true,
      executablePath,
    });
    await browser.close();
    cachedAvailable = true;
    cachedError = null;
    return { available: true, executablePath, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    cachedAvailable = false;
    cachedError = `PLAYWRIGHT_CHROMIUM_UNAVAILABLE: ${detail}. Install with: npx playwright install chromium`;
    return { available: false, executablePath: null, error: cachedError };
  }
}

export async function assertChromiumAvailable(): Promise<string> {
  const result = await checkChromiumAvailable();
  if (!result.available || !result.executablePath) {
    throw new Error(
      result.error ??
        "PLAYWRIGHT_CHROMIUM_UNAVAILABLE: Chromium is required for JavaScript-rendered pages. Run: npx playwright install chromium",
    );
  }
  return result.executablePath;
}

/** Soft startup log — does not stop the worker. */
export async function logChromiumAvailabilityAtStartup(): Promise<void> {
  const result = await checkChromiumAvailable();
  if (result.available) {
    console.log("[ATHENA_WORKER] playwright_chromium_available", {
      executablePath: result.executablePath,
    });
    return;
  }
  console.error("[ATHENA_WORKER] playwright_chromium_unavailable", {
    error: result.error,
    hint: "Static HTML deep scrapes still work via Cheerio. JS-rendered fallback requires: npx playwright install chromium",
  });
}
