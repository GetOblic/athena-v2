/**
 * Subtle client-only completion chime via Web Audio API.
 * No files, no packages. Failures never throw into UI.
 *
 * Browser autoplay policy: AudioContext created outside a user gesture starts
 * suspended. Call unlockCompletionSound() synchronously during the click /
 * submit that starts a background task; play only on confirmed completion.
 */

const MASTER_GAIN = 0.07;
const TONE_PEAK = 0.18;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AnyWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
  const Ctor = AnyWindow.AudioContext ?? AnyWindow.webkitAudioContext;
  if (!Ctor) {
    return null;
  }

  if (!sharedContext || sharedContext.state === "closed") {
    try {
      sharedContext = new Ctor();
    } catch {
      return null;
    }
  }

  return sharedContext;
}

function scheduleTone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  durationSec: number,
) {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);

  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(TONE_PEAK, startAt + 0.018);
  envelope.gain.exponentialRampToValueAtTime(
    0.0001,
    startAt + Math.max(durationSec, 0.04),
  );

  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec + 0.03);
}

/**
 * Prime / resume the shared AudioContext during a user gesture.
 * Does not play the chime. Safe to call repeatedly. Never throws.
 */
export function unlockCompletionSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        // Gesture may have expired; completion play will best-effort resume.
      });
    }
  } catch {
    // Unsupported / blocked — ignore.
  }
}

/**
 * Play a restrained two-note completion chime.
 * Safe to call from completion handlers; never throws.
 */
export async function playCompletionSound(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    if (ctx.state !== "running") {
      return;
    }

    const master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
    master.connect(ctx.destination);

    const now = ctx.currentTime;
    // Soft E5 → A5 (~270ms total)
    scheduleTone(ctx, master, 659.25, now, 0.12);
    scheduleTone(ctx, master, 880, now + 0.11, 0.16);
  } catch {
    // Browser policy / autoplay / unsupported — ignore.
  }
}

/** Test helper — resets the shared AudioContext reference. */
export function resetCompletionSoundContextForTests() {
  sharedContext = null;
}
