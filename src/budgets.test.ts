import { describe, expect, it } from "vitest";
import {
  budgetDetailFor,
  dayKey,
  effectiveAllowance,
  isBreached,
  resolveBudgetCaps,
  resolveMaxDailyFraction,
  trackBurns,
} from "./budgets.js";

describe("dayKey", () => {
  it("formats the local calendar day", () => {
    expect(dayKey(new Date(2026, 8, 16, 23, 59))).toBe("2026-09-16");
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("resolveBudgetCaps", () => {
  it("keeps valid per-provider caps only", () => {
    expect(
      resolveBudgetCaps({ "opencode-go": 30, codex: "25", nope: 10 }),
    ).toEqual({ "opencode-go": 30, codex: 25 });
  });

  it("drops out-of-range values and non-objects", () => {
    expect(resolveBudgetCaps({ "opencode-go": 0 })).toEqual({});
    expect(resolveBudgetCaps({ "opencode-go": 101 })).toEqual({});
    expect(resolveBudgetCaps({ "opencode-go": "lots" })).toEqual({});
    expect(resolveBudgetCaps([])).toEqual({});
    expect(resolveBudgetCaps(undefined)).toEqual({});
  });
});

describe("resolveMaxDailyFraction", () => {
  it("accepts 0 < fraction <= 100", () => {
    expect(resolveMaxDailyFraction(5)).toBe(5);
    expect(resolveMaxDailyFraction("5")).toBe(5);
    expect(resolveMaxDailyFraction(0)).toBeUndefined();
    expect(resolveMaxDailyFraction(101)).toBeUndefined();
    expect(resolveMaxDailyFraction(undefined)).toBeUndefined();
  });
});

describe("trackBurns", () => {
  it("baselines first sighting with zero delta", () => {
    const { store, deltas } = trackBurns(
      { date: "", baselines: {} },
      "2026-09-16",
      [{ id: "opencode-go", used: 10 }],
    );
    expect(store).toEqual({
      date: "2026-09-16",
      baselines: { "opencode-go": 10 },
    });
    expect(deltas["opencode-go"]).toBe(0);
  });

  it("accumulates burn within a day", () => {
    const first = trackBurns({ date: "", baselines: {} }, "2026-09-16", [
      { id: "opencode-go", used: 10 },
    ]);
    const second = trackBurns(first.store, "2026-09-16", [
      { id: "opencode-go", used: 16.5 },
    ]);
    expect(second.deltas["opencode-go"]).toBeCloseTo(6.5);
    expect(second.store.baselines["opencode-go"]).toBe(10);
  });

  it("resets all baselines on day rollover atomically", () => {
    const { store, deltas } = trackBurns(
      {
        date: "2026-09-15",
        baselines: { "opencode-go": 80, codex: 40 },
      },
      "2026-09-16",
      [
        { id: "opencode-go", used: 12 },
        { id: "codex", used: 5 },
      ],
    );
    expect(store.baselines).toEqual({ "opencode-go": 12, codex: 5 });
    expect(deltas).toEqual({ "opencode-go": 0, codex: 0 });
  });

  it("rebases on quota-window reset instead of negative burn", () => {
    const { store, deltas } = trackBurns(
      { date: "2026-09-16", baselines: { "opencode-go": 80 } },
      "2026-09-16",
      [{ id: "opencode-go", used: 5 }],
    );
    expect(store.baselines["opencode-go"]).toBe(5);
    expect(deltas["opencode-go"]).toBe(0);
  });

  it("skips non-finite readings", () => {
    const { deltas } = trackBurns(
      { date: "2026-09-16", baselines: {} },
      "2026-09-16",
      [{ id: "opencode-go", used: Number.NaN }],
    );
    expect(deltas["opencode-go"]).toBeUndefined();
  });
});

describe("effectiveAllowance", () => {
  it("derives the global fraction from remaining at day start", () => {
    // 5% of 90% remaining = 4.5 points.
    expect(
      effectiveAllowance({
        globalFraction: 5,
        baselineUsed: 10,
      }),
    ).toBeCloseTo(4.5);
  });

  it("takes the min of per-provider cap and global derivation", () => {
    expect(
      effectiveAllowance({
        perProviderCap: 30,
        globalFraction: 5,
        baselineUsed: 10,
      }),
    ).toBeCloseTo(4.5);
    expect(
      effectiveAllowance({
        perProviderCap: 2,
        globalFraction: 5,
        baselineUsed: 10,
      }),
    ).toBe(2);
  });

  it("returns undefined without any cap", () => {
    expect(effectiveAllowance({})).toBeUndefined();
  });
});

describe("isBreached", () => {
  it("breaches at or above the allowance", () => {
    expect(isBreached(4.5, 4.5)).toBe(true);
    expect(isBreached(6, 4.5)).toBe(true);
    expect(isBreached(4.4, 4.5)).toBe(false);
    expect(isBreached(undefined, 4.5)).toBe(false);
    expect(isBreached(6, undefined)).toBe(false);
  });
});

describe("budgetDetailFor", () => {
  it("shows remaining budget for today", () => {
    expect(budgetDetailFor(2.1, 4.5)).toBe("2.4/4.5pts budget left today");
    expect(budgetDetailFor(0, 4.5)).toBe("4.5/4.5pts budget left today");
  });

  it("shows overage when breached", () => {
    expect(budgetDetailFor(6.2, 4.5)).toBe("Over budget by 1.7pts today");
  });

  it("returns undefined without tracking", () => {
    expect(budgetDetailFor(undefined, 4.5)).toBeUndefined();
    expect(budgetDetailFor(2, undefined)).toBeUndefined();
  });
});
