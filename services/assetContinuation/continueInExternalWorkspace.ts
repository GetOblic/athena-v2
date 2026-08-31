/**
 * Continue click sequence: preserve user-gesture window open, then clipboard,
 * then navigate the already-opened tab. Navigational only — no prompt injection.
 */

import { writeClipboardText } from "@/lib/clipboard";
import {
  DEFAULT_AI_WORKSPACE_PREFERENCES,
  resolveAssetContinuationDestination,
  type AiWorkspacePreferences,
} from "@/services/assetContinuation/destinationRegistry";

/** Features requested for the synchronous blank-tab open. */
export const CONTINUE_BLANK_OPEN_FEATURES = "noopener,noreferrer";

export type ContinueToastChrome = {
  unableToOpen?: string;
  copiedTabBlocked?: string;
  unableCopyTabBlocked?: string;
  copiedUnableToOpen?: string;
  unableCopyUnableToOpen?: string;
  copiedOpening?: string;
  unableCopyOpened?: string;
};

const DEFAULT_CONTINUE_TOASTS = {
  unableToOpen: "Unable to open destination.",
  copiedTabBlocked: "Content copied. Your browser blocked the new tab.",
  unableCopyTabBlocked:
    "Unable to copy automatically, and your browser blocked the new tab.",
  copiedUnableToOpen: "Content copied. Unable to open destination.",
  unableCopyUnableToOpen:
    "Unable to copy automatically. Unable to open destination.",
  copiedOpening: "Copied to clipboard. Opening {destination}...",
  unableCopyOpened: "Unable to copy automatically. Destination opened.",
} as const;

function resolveContinueToasts(toasts?: ContinueToastChrome | null) {
  return {
    unableToOpen: toasts?.unableToOpen ?? DEFAULT_CONTINUE_TOASTS.unableToOpen,
    copiedTabBlocked:
      toasts?.copiedTabBlocked ?? DEFAULT_CONTINUE_TOASTS.copiedTabBlocked,
    unableCopyTabBlocked:
      toasts?.unableCopyTabBlocked ??
      DEFAULT_CONTINUE_TOASTS.unableCopyTabBlocked,
    copiedUnableToOpen:
      toasts?.copiedUnableToOpen ?? DEFAULT_CONTINUE_TOASTS.copiedUnableToOpen,
    unableCopyUnableToOpen:
      toasts?.unableCopyUnableToOpen ??
      DEFAULT_CONTINUE_TOASTS.unableCopyUnableToOpen,
    copiedOpening: toasts?.copiedOpening ?? DEFAULT_CONTINUE_TOASTS.copiedOpening,
    unableCopyOpened:
      toasts?.unableCopyOpened ?? DEFAULT_CONTINUE_TOASTS.unableCopyOpened,
  };
}

function fillContinueToast(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : value;
  });
}

export type ContinueInExternalWorkspaceInput = {
  text: string;
  assetType?: string | null;
  preferences?: AiWorkspacePreferences | null;
  /** Optional localized toast templates. English defaults remain. */
  toasts?: ContinueToastChrome | null;
  /** Injected for tests; defaults to browserOpenBlankTab. */
  openWindow?: (
    url?: string | URL,
    target?: string,
    features?: string,
  ) => Window | null;
  /** Injected for tests; defaults to writeClipboardText. */
  writeClipboard?: (value: string) => Promise<void>;
};

export type ContinueInExternalWorkspaceResult = {
  toast: string;
  copied: boolean;
  opened: boolean;
  openCallCount: number;
  navigatedUrl: string | null;
};

type OpenedTab = {
  closed: boolean;
  opener: Window | null;
  location: { href: string; replace: (url: string) => void };
  close: () => void;
};

function asOpenedTab(value: Window | null): OpenedTab | null {
  if (!value) return null;
  return value as unknown as OpenedTab;
}

function closeOpenedTabSafely(openedWindow: OpenedTab | null) {
  if (!openedWindow || openedWindow.closed) return;
  try {
    openedWindow.close();
  } catch {
    // Ignore cross-window close failures.
  }
}

/**
 * Production blank-tab open.
 *
 * Callers always request CONTINUE_BLANK_OPEN_FEATURES. Chromium returns null
 * from window.open when "noopener" is in the features string (even when a tab
 * was created), which would strand about:blank and block post-clipboard
 * navigation. We therefore open a navigable about:blank handle and apply
 * equivalent protections in navigateOpenedTab (opener = null + replace).
 */
export function browserOpenBlankTab(
  url?: string | URL,
  target?: string,
  features?: string,
): Window | null {
  if (
    String(url) === "about:blank" &&
    features === CONTINUE_BLANK_OPEN_FEATURES
  ) {
    return window.open("about:blank", target ?? "_blank");
  }
  return window.open(url, target, features);
}

function navigateOpenedTab(openedWindow: OpenedTab, url: string) {
  try {
    openedWindow.opener = null;
  } catch {
    // Ignore if the browser forbids opener assignment.
  }
  openedWindow.location.replace(url);
}

/**
 * Run the Continue action. Call from a click handler so the blank-tab open
 * stays inside the user gesture (before any await).
 */
export async function continueInExternalWorkspace(
  input: ContinueInExternalWorkspaceInput,
): Promise<ContinueInExternalWorkspaceResult> {
  const value = input.text ?? "";
  if (!value.trim()) {
    return {
      toast: "",
      copied: false,
      opened: false,
      openCallCount: 0,
      navigatedUrl: null,
    };
  }

  const openWindow = input.openWindow ?? browserOpenBlankTab;
  const writeClipboard = input.writeClipboard ?? writeClipboardText;
  const toasts = resolveContinueToasts(input.toasts);

  let destinationUrl: string;
  let destinationLabel: string;
  let openedWindow: OpenedTab | null = null;
  let openCallCount = 0;

  try {
    const destination = resolveAssetContinuationDestination({
      assetType: input.assetType,
      preferences: input.preferences ?? DEFAULT_AI_WORKSPACE_PREFERENCES,
    });
    destinationUrl = destination.url;
    destinationLabel = destination.label;

    // 1) Synchronous blank open inside the user gesture (before any await).
    openedWindow = asOpenedTab(
      openWindow("about:blank", "_blank", CONTINUE_BLANK_OPEN_FEATURES),
    );
    openCallCount = 1;
  } catch {
    closeOpenedTabSafely(openedWindow);
    return {
      toast: toasts.unableToOpen,
      copied: false,
      opened: false,
      openCallCount,
      navigatedUrl: null,
    };
  }

  // 2) Clipboard (async — user gesture may be gone after this).
  let copied = false;
  try {
    await writeClipboard(value);
    copied = true;
  } catch {
    copied = false;
  }

  // 3) Navigate the already-opened tab — never call window.open again here.
  if (!openedWindow) {
    return {
      toast: copied
        ? toasts.copiedTabBlocked
        : toasts.unableCopyTabBlocked,
      copied,
      opened: false,
      openCallCount,
      navigatedUrl: null,
    };
  }

  try {
    navigateOpenedTab(openedWindow, destinationUrl);
  } catch {
    closeOpenedTabSafely(openedWindow);
    return {
      toast: copied
        ? toasts.copiedUnableToOpen
        : toasts.unableCopyUnableToOpen,
      copied,
      opened: false,
      openCallCount,
      navigatedUrl: null,
    };
  }

  return {
    toast: copied
      ? fillContinueToast(toasts.copiedOpening, {
          destination: destinationLabel,
        })
      : toasts.unableCopyOpened,
    copied,
    opened: true,
    openCallCount,
    navigatedUrl: destinationUrl,
  };
}
