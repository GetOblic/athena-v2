/**
 * Bounded detail-page refresh after SEO Ready.
 *
 * The worker marks the report Ready, then writes the accompanying email.
 * The status poll refreshes once on Ready, which can render before that write.
 * Follow-up refreshes reuse router.refresh and stop when the email is visible,
 * the Ready timestamp leaves this window, or the attempt cap is hit.
 *
 * updated_at is the Ready transition time: email persistence does not change it.
 * Historical Ready reports with a null email sit outside the window and do not refresh.
 */

export const SEO_READY_EMAIL_REFRESH_INTERVAL_MS = 2_000;
export const SEO_READY_EMAIL_REFRESH_WINDOW_MS = 20_000;
export const SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS = 8;

export type ReadyEmailRefreshSnapshot = {
  status: string;
  accompanyingEmailVisible: boolean;
  reportUpdatedAt: string | null;
};

export function shouldRefreshReadyReportForAccompanyingEmail(input: {
  status: string;
  accompanyingEmailVisible: boolean;
  reportUpdatedAt: string | null;
  nowMs: number;
  attempts: number;
}): boolean {
  if (input.status !== "Ready") return false;
  if (input.accompanyingEmailVisible) return false;
  if (input.attempts >= SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS) return false;
  if (!input.reportUpdatedAt) return false;

  const readyMs = Date.parse(input.reportUpdatedAt);
  if (!Number.isFinite(readyMs)) return false;
  if (input.nowMs >= readyMs + SEO_READY_EMAIL_REFRESH_WINDOW_MS) return false;
  return true;
}

type ReadyEmailRefreshDeps = {
  refresh: () => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (timerId: unknown) => void;
};

export type ReadyEmailRefreshController = {
  sync: (snapshot: ReadyEmailRefreshSnapshot) => void;
  stop: () => void;
};

export function createReadyEmailRefreshController(
  deps: ReadyEmailRefreshDeps,
): ReadyEmailRefreshController {
  const now = deps.now ?? (() => Date.now());
  const schedule =
    deps.schedule ??
    ((callback: () => void, delayMs: number) =>
      setInterval(callback, delayMs));
  const cancel =
    deps.cancel ??
    ((timerId: unknown) => {
      clearInterval(timerId as ReturnType<typeof setInterval>);
    });

  let timer: unknown = null;
  let attempts = 0;
  let snapshot: ReadyEmailRefreshSnapshot = {
    status: "",
    accompanyingEmailVisible: false,
    reportUpdatedAt: null,
  };

  function clearTimer() {
    if (timer == null) return;
    cancel(timer);
    timer = null;
  }

  function eligible(): boolean {
    return shouldRefreshReadyReportForAccompanyingEmail({
      status: snapshot.status,
      accompanyingEmailVisible: snapshot.accompanyingEmailVisible,
      reportUpdatedAt: snapshot.reportUpdatedAt,
      nowMs: now(),
      attempts,
    });
  }

  function tick() {
    if (!eligible()) {
      clearTimer();
      return;
    }
    attempts += 1;
    deps.refresh();
    if (!eligible()) clearTimer();
  }

  return {
    sync(next) {
      snapshot = next;
      if (next.status === "Queued" || next.status === "Processing") {
        attempts = 0;
        clearTimer();
        return;
      }
      if (!eligible()) {
        clearTimer();
        return;
      }
      if (timer == null) {
        timer = schedule(tick, SEO_READY_EMAIL_REFRESH_INTERVAL_MS);
      }
    },
    stop() {
      clearTimer();
    },
  };
}
