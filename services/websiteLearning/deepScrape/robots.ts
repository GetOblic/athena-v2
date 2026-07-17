/**
 * Minimal robots.txt parser for Deep Website Scrape.
 */

import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import { safeFetchHtml } from "@/services/websiteLearning/deepScrape/safeFetch";

export type RobotsRules = {
  fetched: boolean;
  disallow: string[];
  allow: string[];
};

function pathMatchesRule(path: string, rule: string): boolean {
  if (!rule) return false;
  if (rule === "/") return true;
  // Prefix match with simple wildcard support.
  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}`).test(path);
  } catch {
    return path.startsWith(rule);
  }
}

export function parseRobotsTxt(text: string, userAgent: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  let inRelevantGroup = false;
  let sawAnyGroup = false;
  const disallow: string[] = [];
  const allow: string[] = [];
  const uaNeedle = userAgent.toLowerCase();

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      sawAnyGroup = true;
      const agent = value.toLowerCase();
      inRelevantGroup =
        agent === "*" ||
        uaNeedle.includes(agent) ||
        agent.includes("athenadeepscrape");
      continue;
    }

    if (!inRelevantGroup) continue;
    if (key === "disallow" && value) disallow.push(value);
    if (key === "allow" && value) allow.push(value);
  }

  if (!sawAnyGroup) {
    return { fetched: true, disallow: [], allow: [] };
  }

  return { fetched: true, disallow, allow };
}

export function isPathAllowedByRobots(
  path: string,
  rules: RobotsRules | null,
): boolean {
  if (!rules || !rules.fetched) return true;
  const pathname = path.startsWith("/") ? path : `/${path}`;

  let matchedAllow: string | null = null;
  let matchedDisallow: string | null = null;

  for (const rule of rules.allow) {
    if (pathMatchesRule(pathname, rule)) {
      if (!matchedAllow || rule.length > matchedAllow.length) {
        matchedAllow = rule;
      }
    }
  }
  for (const rule of rules.disallow) {
    if (pathMatchesRule(pathname, rule)) {
      if (!matchedDisallow || rule.length > matchedDisallow.length) {
        matchedDisallow = rule;
      }
    }
  }

  if (matchedAllow && matchedDisallow) {
    return matchedAllow.length >= matchedDisallow.length;
  }
  if (matchedDisallow) return false;
  return true;
}

export async function fetchRobotsRules(input: {
  rootUrl: string;
  registrableDomain: string;
}): Promise<RobotsRules> {
  try {
    const robotsUrl = new URL("/robots.txt", `${input.rootUrl}/`).toString();
    const result = await safeFetchHtml({
      url: robotsUrl,
      registrableDomain: input.registrableDomain,
      acceptXml: true,
      timeoutMs: 8_000,
    });
    if (!result.ok || !result.bodyText) {
      return { fetched: false, disallow: [], allow: [] };
    }
    return parseRobotsTxt(
      result.bodyText,
      DEEP_SCRAPE_CRAWL_POLICY.userAgent,
    );
  } catch {
    return { fetched: false, disallow: [], allow: [] };
  }
}
