/**
 * Previous-state tracking for background-action completion sound.
 * Plays only on observed active → success transitions in the current session.
 */

import {
  playCompletionSound,
  unlockCompletionSound,
} from "@/lib/completionSound/playCompletionSound";

export const BACKGROUND_ACTION_ACTIVE_STATUSES = new Set([
  "queued",
  "pending",
  "processing",
  "running",
  "generating",
  "scraping",
  "importing",
  "training",
  "awaiting_follow_on",
  "retryable",
]);

export const BACKGROUND_ACTION_SUCCESS_STATUSES = new Set([
  "completed",
  "complete",
  "succeeded",
  "ready",
  "success",
]);

export function normalizeBackgroundActionStatus(
  status: string | null | undefined,
): string | null {
  if (typeof status !== "string") {
    return null;
  }
  const normalized = status.trim().toLowerCase();
  return normalized || null;
}

/**
 * Pure transition check — does not play audio.
 */
export function shouldPlayCompletionSound(
  previousStatus: string | null | undefined,
  currentStatus: string | null | undefined,
): boolean {
  const previous = normalizeBackgroundActionStatus(previousStatus);
  const current = normalizeBackgroundActionStatus(currentStatus);

  if (!current || !BACKGROUND_ACTION_SUCCESS_STATUSES.has(current)) {
    return false;
  }

  if (!previous || !BACKGROUND_ACTION_ACTIVE_STATUSES.has(previous)) {
    return false;
  }

  return true;
}

export type BackgroundActionCompletionObserver = {
  /** Last observed normalized status. */
  getPreviousStatus: () => string | null;
  /**
   * Observe a status update. Plays the completion sound at most once per
   * active→success transition. Never throws.
   */
  observe: (status: string | null | undefined) => boolean;
  /**
   * Unlock the shared AudioContext during the user's initiating gesture.
   * Must be called synchronously from click/submit before awaits. Never plays.
   */
  unlock: () => void;
  reset: () => void;
};

export function createBackgroundActionCompletionObserver(options?: {
  play?: () => void | Promise<void>;
  unlockAudio?: () => void;
}): BackgroundActionCompletionObserver {
  let previousStatus: string | null = null;
  const play = options?.play ?? playCompletionSound;
  const unlockAudio = options?.unlockAudio ?? unlockCompletionSound;

  return {
    getPreviousStatus: () => previousStatus,
    unlock() {
      try {
        unlockAudio();
      } catch {
        // Ignore unlock failure.
      }
    },
    observe(status: string | null | undefined): boolean {
      try {
        const current = normalizeBackgroundActionStatus(status);
        const shouldPlay = shouldPlayCompletionSound(previousStatus, current);

        if (current !== null) {
          previousStatus = current;
        }

        if (shouldPlay) {
          try {
            void Promise.resolve(play()).catch(() => {
              // Ignore playback rejection.
            });
          } catch {
            // Ignore synchronous playback failure.
          }
        }

        return shouldPlay;
      } catch {
        return false;
      }
    },
    reset() {
      previousStatus = null;
    },
  };
}
