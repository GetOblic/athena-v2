/**
 * Redirect-handling contracts for the shared Cheerio deep-scrape path.
 *
 * Trailing-slash 301s are continued in-handler as the same ranked candidate
 * (see deepScrapeRedirectContinuation.test.ts). This file keeps the forensic
 * transport / canonicalize context and source contracts.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";

import { canonicalizePageUrl } from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = path.join(__dirname, "../..");

async function withLocalServer(
  handler: http.RequestListener,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("Deep scrape redirect handling audit", () => {
  it("keeps followRedirect=false and continues same-origin redirects in-handler", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    const gotOptions = readFileSync(
      path.join(ROOT, "node_modules/got/dist/source/core/options.js"),
      "utf8",
    );
    assert.match(gotOptions, /followRedirect:\s*true/);
    assert.match(cheerio, /gotOptions\.followRedirect\s*=\s*false/);
    assert.match(
      cheerio,
      /if \(\[301, 302, 303, 307, 308\]\.includes\(statusCode\)\)/,
    );
    assert.match(cheerio, /continueSameOriginRedirectChain/);
    assert.doesNotMatch(
      cheerio,
      /markRedirected\(request\.url,\s*"REDIRECT"\)/,
    );
  });

  it("canonicalize collapses trailing-slash redirect targets onto the source URL", () => {
    const source = "https://laserperfectionllc.com/products";
    const location = "https://laserperfectionllc.com/products/";
    assert.equal(canonicalizePageUrl(source), canonicalizePageUrl(location));
    assert.equal(
      canonicalizePageUrl(source),
      "https://laserperfectionllc.com/products",
    );
  });

  it("local server transport: /service → 301 → /service/ → 200 HTML", async () => {
    await withLocalServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/service") {
        res.writeHead(301, { Location: "/service/" });
        res.end();
        return;
      }
      if (url === "/service/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><html><body><main><h1>Service</h1><p>Valid extractable service page content for Athena deep scrape.</p></main></body></html>",
        );
        return;
      }
      res.writeHead(404);
      res.end("missing");
    }, async (baseUrl) => {
      const noFollow = await fetch(`${baseUrl}/service`, { redirect: "manual" });
      assert.equal(noFollow.status, 301);
      assert.equal(noFollow.headers.get("location"), "/service/");
      const followed = await fetch(`${baseUrl}/service`, { redirect: "follow" });
      assert.equal(followed.status, 200);
      const html = await followed.text();
      assert.match(html, /Valid extractable service page content/);
    });
  });

  it("source contracts: missing Location and cross-domain rejects remain explicit", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    const continuation = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/redirectContinuation.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /REDIRECT_MISSING_LOCATION/);
    assert.match(continuation, /CROSS_DOMAIN_REJECTED/);
    assert.match(continuation, /REDIRECT_LOOP/);
    assert.match(continuation, /REDIRECT_DEPTH_EXCEEDED/);
    assert.match(continuation, /isSameRegistrableDomain/);
    assert.match(continuation, /assertHostname|assertPublicHostname/);
  });

  it("secondary: attachment-like paths are not hard-rejected by media upload pattern alone", () => {
    const relevance = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/urlRelevance.ts",
      ),
      "utf8",
    );
    assert.match(relevance, /wp-content\\\/uploads/);
    assert.doesNotMatch(relevance, /black-logo/);
    assert.doesNotMatch(relevance, /attachment/);
  });
});
