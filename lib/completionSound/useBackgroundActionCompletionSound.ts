"use client";

import { useState } from "react";
import {
  createBackgroundActionCompletionObserver,
  type BackgroundActionCompletionObserver,
} from "@/lib/completionSound/backgroundActionCompletion";

/**
 * Stable per-component observer for active→success completion chimes.
 */
export function useBackgroundActionCompletionSound(): BackgroundActionCompletionObserver {
  const [observer] = useState(() => createBackgroundActionCompletionObserver());
  return observer;
}
