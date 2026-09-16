import { PROVIDERS, type ProviderId } from "./usage.js";

export type BudgetCaps = Partial<Record<ProviderId, number>>;

export type BurnStore = {
  date: string;
  baselines: Partial<Record<ProviderId, number>>;
};

export const EMPTY_BURN_STORE: BurnStore = { date: "", baselines: {} };

// Local calendar day, YYYY-MM-DD.
export function dayKey(now = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const VALID_IDS = new Set<string>(PROVIDERS.map((p) => p.id));

function validCap(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100) return undefined;
  return number;
}

// Per-provider daily burn caps, in used-percentage points per day.
// Unknown ids and out-of-range values are dropped.
export function resolveBudgetCaps(input: unknown): BudgetCaps {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const caps: BudgetCaps = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!VALID_IDS.has(id)) continue;
    const cap = validCap(value);
    if (cap !== undefined) caps[id as ProviderId] = cap;
  }
  return caps;
}

// Global relative cap: percent of remaining quota at day start that may burn
// per day. E.g. 5 with 90% remaining at day start allows 4.5 points.
export function resolveMaxDailyFraction(input: unknown): number | undefined {
  if (input === undefined || input === null) return undefined;
  return validCap(input);
}

export type BurnReading = {
  id: ProviderId;
  used: number;
};

// Fold one refresh of readings into the store. Day rollover resets all
// baselines atomically; a quota-window reset (used < baseline) rebases that
// provider without counting negative burn.
export function trackBurns(
  store: BurnStore,
  today: string,
  readings: ReadonlyArray<BurnReading>,
): { store: BurnStore; deltas: Partial<Record<ProviderId, number>> } {
  const fresh = store.date !== today;
  const baselines: Partial<Record<ProviderId, number>> = fresh
    ? {}
    : { ...store.baselines };
  const deltas: Partial<Record<ProviderId, number>> = {};

  for (const reading of readings) {
    if (!Number.isFinite(reading.used)) continue;
    const baseline = baselines[reading.id];
    if (baseline === undefined || reading.used < baseline) {
      baselines[reading.id] = reading.used;
      deltas[reading.id] = 0;
    } else {
      deltas[reading.id] = reading.used - baseline;
    }
  }

  return { store: { date: today, baselines }, deltas };
}

export function effectiveAllowance(options: {
  perProviderCap?: number;
  globalFraction?: number;
  baselineUsed?: number;
}): number | undefined {
  const { perProviderCap, globalFraction, baselineUsed } = options;
  let allowance = perProviderCap;
  if (
    globalFraction !== undefined &&
    baselineUsed !== undefined &&
    Number.isFinite(baselineUsed)
  ) {
    const derived = (globalFraction / 100) * (100 - baselineUsed);
    allowance =
      allowance === undefined ? derived : Math.min(allowance, derived);
  }
  return allowance;
}

export function isBreached(
  delta: number | undefined,
  allowance: number | undefined,
): boolean {
  return (
    delta !== undefined &&
    allowance !== undefined &&
    Number.isFinite(delta) &&
    delta >= allowance
  );
}

// Accordion budget line: remaining allowance for today, or overage.
export function budgetDetailFor(
  delta: number | undefined,
  allowance: number | undefined,
): string | undefined {
  if (
    delta === undefined ||
    allowance === undefined ||
    !Number.isFinite(delta) ||
    !Number.isFinite(allowance)
  ) {
    return undefined;
  }
  const remaining = allowance - delta;
  if (remaining < 0) {
    return `Over budget by ${(-remaining).toFixed(1)}pts today`;
  }
  return `${remaining.toFixed(1)}/${allowance.toFixed(1)}pts budget left today`;
}

export function providerShortName(id: ProviderId): string {
  const found = PROVIDERS.find((p) => p.id === id);
  return found ? found.name : id;
}
