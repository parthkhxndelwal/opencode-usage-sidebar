import { formatReset } from "./format.js";
import type { ProviderUsage, UsageWindow } from "./usage.js";

// Remaining-percentage thresholds for the low-quota signal.
export const QUOTA_WARN_AT = 20;
export const QUOTA_CRIT_AT = 5;

// Fixed signal colors so the warning reads the same on any theme.
export const QUOTA_WARN_COLOR = "#FDE047";
export const QUOTA_CRIT_COLOR = "#FB923C";

export type QuotaLevel = "normal" | "warn" | "critical";

export function remainingPct(
  usedPercent: number | null | undefined,
): number | undefined {
  if (usedPercent === null || usedPercent === undefined) return undefined;
  return 100 - usedPercent;
}

export function quotaLevelForRemaining(
  remaining: number | null | undefined,
): QuotaLevel {
  if (remaining === null || remaining === undefined) return "normal";
  if (remaining <= QUOTA_CRIT_AT) return "critical";
  if (remaining <= QUOTA_WARN_AT) return "warn";
  return "normal";
}

export function quotaLevelForUsed(
  usedPercent: number | null | undefined,
): QuotaLevel {
  return quotaLevelForRemaining(remainingPct(usedPercent));
}

// The window behind each provider's one-liner. Mirrors the line functions
// in tui.tsx so color + accordion detail stay in sync with the display.
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
