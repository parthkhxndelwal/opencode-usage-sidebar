import { formatReset } from "./format.js";
import type { ProviderUsage, UsageWindow } from "./usage.js";

// The window behind each provider's one-liner. Mirrors the line functions
// in tui.tsx so the accordion detail stays in sync with the display.
export function displayWindow(state: ProviderUsage): UsageWindow | undefined {
  if (state.providerId === "opencode-go") {
    return state.windows.find((w) => w.id === "monthly") ?? state.windows[0];
  }
  if (state.providerId === "codex") {
    return (
      state.windows.find((w) => w.id === "weekly") ??
      state.windows.find((w) => w.id === "5h") ??
      state.windows[0]
    );
  }
  return state.windows.find((w) => w.id === "ai-credits") ?? state.windows[0];
}

// Accordion detail: reset countdown for the displayed window, or undefined
// when there is no reset date (e.g. Unlimited, not connected).
export function resetDetailFor(state: ProviderUsage): string | undefined {
  const window = displayWindow(state);
  if (!window || window.resetAt === null || window.resetAt === undefined) {
    return undefined;
  }
  return `Resets ${formatReset(window.resetAt)}`;
}
