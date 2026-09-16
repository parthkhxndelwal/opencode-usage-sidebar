import { resolveMaxDailyFraction } from "./budgets.js";
import { isProviderId, type ProviderId } from "./usage.js";

// TUI overrides for daily burn budgets, persisted in plugin storage.
// A `null` value means explicitly off (ignores the config file);
// absence means fall back to the config file.
export type StoredBudgetSettings = {
  caps: Partial<Record<ProviderId, number | null>>;
  maxDailyFraction?: number | null;
};

export const EMPTY_BUDGET_SETTINGS: StoredBudgetSettings = { caps: {} };

function validCapNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100) return undefined;
  return number;
}

export function sanitizeStoredSettings(input: unknown): StoredBudgetSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { caps: {} };
  }
  const raw = input as Record<string, unknown>;
  const caps: Partial<Record<ProviderId, number | null>> = {};
  const rawCaps = raw.caps;
  if (rawCaps && typeof rawCaps === "object" && !Array.isArray(rawCaps)) {
    for (const [id, value] of Object.entries(
      rawCaps as Record<string, unknown>,
    )) {
      if (!isProviderId(id)) continue;
      if (value === null) {
        caps[id] = null;
      } else {
        const cap = validCapNumber(value);
        if (cap !== undefined) caps[id] = cap;
      }
    }
  }
  const fraction = (raw as { maxDailyFraction?: unknown }).maxDailyFraction;
  if (fraction === null) return { caps, maxDailyFraction: null };
  const parsed = resolveMaxDailyFraction(fraction);
  return parsed === undefined ? { caps } : { caps, maxDailyFraction: parsed };
}

export function effectiveBudgetCaps(
  configCaps: Partial<Record<ProviderId, number>>,
  stored: StoredBudgetSettings,
): Partial<Record<ProviderId, number>> {
  const out: Partial<Record<ProviderId, number>> = { ...configCaps };
  for (const [id, value] of Object.entries(stored.caps)) {
    if (!isProviderId(id)) continue;
    if (value === null) {
      delete out[id];
    } else if (typeof value === "number") {
      out[id] = value;
    }
  }
  return out;
}

export function effectiveMaxDailyFraction(
  configFraction: number | undefined,
  stored: StoredBudgetSettings,
): number | undefined {
  if (stored.maxDailyFraction === null) return undefined;
  if (typeof stored.maxDailyFraction === "number") {
    return stored.maxDailyFraction;
  }
  return configFraction;
}

// Parses the budget dialog input: a number, "off" to disable, or undefined
// when the input is invalid.
export function parseBudgetInput(input: string): number | "off" | undefined {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "off" || trimmed === "none" || trimmed === "disable") {
    return "off";
  }
  return validCapNumber(trimmed);
}
