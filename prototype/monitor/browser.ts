import { createRequire } from "node:module";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { safeFetchHtml } from "@/services/websiteLearning/deepScrape/safeFetch";
import { parseRobotsTxt, type RobotsRules } from "@/services/websiteLearning/deepScrape/robots";

import { MONITOR_LIMITS } from "./limits";
import type { BrowserAttempt, BrowserRuntimeReport } from "./types";

const require = createRequire(__filename);
const playwrightPackage = require("playwright/package.json") as { version: string };

export class AccessBlockedError extends Error {
  readonly status: number;
  readonly title: string;
  readonly url: string;

  constructor(url: string, status: number, title: string) {
    super(`CLOUDFLARE_BLOCKED status=${status} title=${JSON.stringify(title)} url=${url}`);
    this.name = "AccessBlockedError";
    this.url = url;
    this.status = status;
    this.title = title;
  }
}

export function playwrightVersion(): string {
  return playwrightPackage.version;
}

export function chromiumExecutable(): string | null {
  try {
    return chromium.executablePath();
  } catch (error) {
    return error instanceof Error ? error.message : null;
  }
}

function blockedTitle(title: string): boolean {
  return /attention required|sorry, you have been blocked|cloudflare/i.test(title);
}

async function installRequestGuards(context: BrowserContext): Promise<void> {
  await context.route("**/*", (route) => {
    const request = route.request();
    const type = request.resourceType();
    if (type === "image" || type === "media" || type === "font") {
      return route.abort();
    }
    if (/\/on\/demandware\.store\/|product-variation|[?&]dwvar_/i.test(request.url())) {
      return route.abort();
    }
    return route.continue();
  });
}

export async function probeBrowserMode(
  mode: "chromium-headless" | "chrome-headless",
  url: string,
): Promise<BrowserAttempt> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch(
      mode === "chromium-headless" ? { headless: true } : { channel: "chrome", headless: true },
    );
    const page = await browser.newPage();
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: MONITOR_LIMITS.pageTimeoutMs,
    });
    const title = await page.title();
    const status = response?.status() ?? null;
    const blocked = status === 403 || blockedTitle(title);
    return {
      mode,
      status,
      title,
      error: blocked ? `CLOUDFLARE_BLOCKED status=${status} title=${JSON.stringify(title)}` : null,
    };
  } catch (error) {
    return {
      mode,
      status: null,
      title: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser?.close();
  }
}

export async function describeBrowserRuntime(probeUrl: string): Promise<BrowserRuntimeReport> {
  const headlessChromium = await probeBrowserMode("chromium-headless", probeUrl);
  const headlessChrome = await probeBrowserMode("chrome-headless", probeUrl);
  return {
    playwrightVersion: playwrightVersion(),
    chromiumRevision: "1228",
    chromiumExecutable: chromiumExecutable(),
    headlessChromium,
    headlessChrome,
    extractionBrowser: "google-chrome-headed",
  };
}

export async function withHeadedChrome<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const context = await browser.newContext({
      locale: "fr-FR",
      viewport: { width: 1280, height: 900 },
    });
    await installRequestGuards(context);
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function readBrowserDocument(
  page: Page,
  url: string,
): Promise<{ status: number; finalUrl: string; html: string; title: string }> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: MONITOR_LIMITS.pageTimeoutMs,
  });
  await page.waitForTimeout(800);
  const status = response?.status() ?? 0;
  const title = await page.title();
  if (status === 403 || blockedTitle(title)) {
    throw new AccessBlockedError(page.url() || url, status, title);
  }
  const html = await page.content();
  if (Buffer.byteLength(html, "utf8") > MONITOR_LIMITS.maxHtmlBytes) {
    throw new Error("RESPONSE_TOO_LARGE");
  }
  return { status, finalUrl: page.url(), html, title };
}

export async function readBrowserRobots(page: Page, origin: string): Promise<RobotsRules> {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const response = await page.goto(robotsUrl, {
    waitUntil: "domcontentloaded",
    timeout: MONITOR_LIMITS.pageTimeoutMs,
  });
  const status = response?.status() ?? 0;
  const text = await page.locator("body").innerText().catch(() => "");
  if (status !== 200 || !text.trim()) {
    return { fetched: false, disallow: [], allow: [] };
  }
  return parseRobotsTxt(text, "*");
}

export async function readHttpDocument(
  url: string,
  registrableDomain: string,
  acceptXml = false,
): Promise<{ status: number; finalUrl: string; html: string }> {
  const result = await safeFetchHtml({
    url,
    registrableDomain,
    timeoutMs: MONITOR_LIMITS.pageTimeoutMs,
    maxRedirects: 3,
    acceptXml,
  });
  if (!result.ok || result.bodyText == null) {
    throw new Error(result.errorCode ?? `HTTP_${result.status}`);
  }
  return { status: result.status, finalUrl: result.finalUrl, html: result.bodyText };
}
