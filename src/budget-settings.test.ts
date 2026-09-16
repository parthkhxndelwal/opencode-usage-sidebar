import { describe, expect, it } from "vitest";
import {
  EMPTY_BUDGET_SETTINGS,
  effectiveBudgetCaps,
  effectiveMaxDailyFraction,
  parseBudgetInput,
  sanitizeStoredSettings,
} from "./budget-settings.js";

describe("sanitizeStoredSettings", () => {
  it("keeps valid caps and explicit offs, drops junk", () => {
    expect(
      sanitizeStoredSettings({
        caps: {
          "opencode-go": 30,
          codex: null,
          nope: 10,
          "github-copilot": "lots",
        },
        maxDailyFraction: 5,
      }),
    ).toEqual({
      caps: { "opencode-go": 30, codex: null },
      maxDailyFraction: 5,
    });
  });

  it("falls back to empty on malformed input", () => {
    expect(sanitizeStoredSettings(undefined)).toEqual(EMPTY_BUDGET_SETTINGS);
    expect(sanitizeStoredSettings([])).toEqual(EMPTY_BUDGET_SETTINGS);
    expect(sanitizeStoredSettings({ caps: null })).toEqual({ caps: {} });
  });
});

describe("effectiveBudgetCaps", () => {
  it("stored values win, null disables config caps", () => {
    expect(
      effectiveBudgetCaps(
        { "opencode-go": 30, codex: 25 },
        { caps: { codex: null, "github-copilot": 10 } },
      ),
    ).toEqual({ "opencode-go": 30, "github-copilot": 10 });
  });

  it("falls back to config when nothing stored", () => {
    expect(
      effectiveBudgetCaps({ "opencode-go": 30 }, EMPTY_BUDGET_SETTINGS),
    ).toEqual({ "opencode-go": 30 });
  });
});

describe("effectiveMaxDailyFraction", () => {
  it("stored value wins, null disables", () => {
    expect(
      effectiveMaxDailyFraction(5, { caps: {}, maxDailyFraction: 8 }),
    ).toBe(8);
    expect(
      effectiveMaxDailyFraction(5, { caps: {}, maxDailyFraction: null }),
    ).toBeUndefined();
    expect(effectiveMaxDailyFraction(5, EMPTY_BUDGET_SETTINGS)).toBe(5);
    expect(effectiveMaxDailyFraction(undefined, EMPTY_BUDGET_SETTINGS)).toBe(
      undefined,
    );
  });
});

describe("parseBudgetInput", () => {
  it("parses numbers and off", () => {
    expect(parseBudgetInput("30")).toBe(30);
    expect(parseBudgetInput(" 4.5 ")).toBe(4.5);
    expect(parseBudgetInput("off")).toBe("off");
    expect(parseBudgetInput("None")).toBe("off");
  });

  it("rejects out-of-range input", () => {
    expect(parseBudgetInput("0")).toBeUndefined();
    expect(parseBudgetInput("101")).toBeUndefined();
    expect(parseBudgetInput("lots")).toBeUndefined();
    expect(parseBudgetInput("")).toBeUndefined();
  });
});
