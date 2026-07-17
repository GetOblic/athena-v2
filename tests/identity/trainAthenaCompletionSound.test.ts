/**
 * Train Athena — completion sound at confirmed success redirect boundary.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  getNextRedirectUrl,
  handleTrainAthenaServerActionResult,
  isTrainAthenaSuccessRedirect,
} from "../../components/identity/TrainAthenaSubmitButton";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function redirectError(url: string): Error {
  const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;push;${url};303;`;
  return error;
}

describe("Train Athena completion sound", () => {
  it("1. successful Train Athena response calls the completion sound once", async () => {
    let plays = 0;
    const success = redirectError("/identity?saved=true");

    await assert.rejects(
      () =>
        handleTrainAthenaServerActionResult(
          async () => {
            throw success;
          },
          () => {
            plays += 1;
          },
        ),
      (error) => error === success,
    );

    assert.equal(plays, 1);
  });

  it("2. redirect still occurs after success sound", async () => {
    const success = redirectError("/identity?saved=true");
    let redirected = false;

    await assert.rejects(
      () =>
        handleTrainAthenaServerActionResult(
          async () => {
            throw success;
          },
          () => undefined,
        ),
      (error) => {
        redirected = error === success;
        return redirected;
      },
    );

    assert.equal(redirected, true);
    assert.equal(getNextRedirectUrl(success), "/identity?saved=true");
    assert.equal(isTrainAthenaSuccessRedirect("/identity?saved=true"), true);
  });

  it("3. sound failure does not prevent redirect", async () => {
    const success = redirectError("/identity?saved=true");

    await assert.rejects(
      () =>
        handleTrainAthenaServerActionResult(
          async () => {
            throw success;
          },
          () => {
            throw new Error("audio blocked");
          },
        ),
      (error) => error === success,
    );
  });

  it("4. unsuccessful response does not play sound", async () => {
    let plays = 0;
    const loginRedirect = redirectError("/login");

    await assert.rejects(
      () =>
        handleTrainAthenaServerActionResult(
          async () => {
            throw loginRedirect;
          },
          () => {
            plays += 1;
          },
        ),
      (error) => error === loginRedirect,
    );

    assert.equal(plays, 0);
    assert.equal(isTrainAthenaSuccessRedirect("/login"), false);
  });

  it("5. request failure does not play sound", async () => {
    let plays = 0;
    const failure = new Error("upsert failed");

    await assert.rejects(
      () =>
        handleTrainAthenaServerActionResult(
          async () => {
            throw failure;
          },
          () => {
            plays += 1;
          },
        ),
      (error) => error === failure,
    );

    assert.equal(plays, 0);
  });

  it("6. initial render / success path without running action does not play sound", async () => {
    let plays = 0;
    // No action run → no sound. Also ensure submit button render path has no play call.
    const button = read("components/identity/TrainAthenaSubmitButton.tsx");
    const submitFn = button.slice(
      button.indexOf("export function TrainAthenaSubmitButton"),
    );
    assert.doesNotMatch(submitFn, /playCompletionSound/);
    assert.doesNotMatch(read("app/identity/page.tsx"), /playCompletionSound/);
    assert.match(read("app/identity/page.tsx"), /TrainAthenaForm/);

    await handleTrainAthenaServerActionResult(
      async () => undefined,
      () => {
        plays += 1;
      },
    );
    assert.equal(plays, 0);
  });

  it("7. no polling, persistence, or cross-page mechanism is introduced", () => {
    const button = read("components/identity/TrainAthenaSubmitButton.tsx");
    assert.doesNotMatch(
      button,
      /localStorage|sessionStorage|setInterval|setTimeout|createBackgroundActionCompletionObserver|useBackgroundActionCompletionSound/,
    );
    assert.match(button, /playCompletionSound/);
    assert.match(
      read("app/identity/page.tsx"),
      /redirect\("\/identity\?saved=true"\)/,
    );
  });
});
