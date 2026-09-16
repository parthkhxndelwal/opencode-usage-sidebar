import { describe, expect, it } from "vitest";
import {
  QUOTA_CRIT_COLOR,
  QUOTA_WARN_COLOR,
  displayWindow,
  quotaLevelForRemaining,
  quotaLevelForUsed,
  remainingPct,
  resetDetailFor,
} from "./quota.js";
import type { ProviderUsage } from "./usage.js";

function state(
  providerId: ProviderUsage["providerId"],
  windows: ProviderUsage["windows"],
): ProviderUsage {
  return {
    providerId,
    providerName: providerId,
    configured: true,
    ok: true,
    windows,
    fetchedAt: 0,
  };
}

describe("remainingPct", () => {
  it("inverts used percent", () => {
    expect(remainingPct(75)).toBe(25);
    expect(remainingPct(0)).toBe(100);
    expect(remainingPct(null)).toBeUndefined();
    expect(remainingPct(undefined)).toBeUndefined();
  });
});

describe("quota levels", () => {
  it("warns at <=20 remaining, critical at <=5", () => {
    expect(quotaLevelForRemaining(50)).toBe("normal");
    expect(quotaLevelForRemaining(20)).toBe("warn");
    expect(quotaLevelForRemaining(10)).toBe("warn");
    expect(quotaLevelForRemaining(5)).toBe("critical");
    expect(quotaLevelForRemaining(0)).toBe("critical");
    expect(quotaLevelForRemaining(undefined)).toBe("normal");
  });

  it("maps used percent to levels", () => {
    expect(quotaLevelForUsed(10)).toBe("normal"); // 90 left
    expect(quotaLevelForUsed(85)).toBe("warn"); // 15 left
    expect(quotaLevelForUsed(97)).toBe("critical"); // 3 left
    expect(quotaLevelForUsed(null)).toBe("normal");
  });

  it("exports distinct signal colors", () => {
    expect(QUOTA_WARN_COLOR).not.toBe(QUOTA_CRIT_COLOR);
  });
});

describe("displayWindow", () => {
  it("picks monthly for Go, weekly-first for Codex, credits for Copilot", () => {
    const go = state("opencode-go", [
      { id: "5h", label: "5h", usedPercent: 1, resetAt: 1 },
      { id: "monthly", label: "M", usedPercent: 2, resetAt: 2 },
    ]);
    expect(displayWindow(go)?.id).toBe("monthly");

    const codex = state("codex", [
      { id: "5h", label: "5h", usedPercent: 1, resetAt: 1 },
      { id: "weekly", label: "W", usedPercent: 2, resetAt: 2 },
    ]);
    expect(displayWindow(codex)?.id).toBe("weekly");

    const copilot = state("github-copilot", [
      { id: "ai-credits", label: "C", usedPercent: 3, resetAt: 4 },
    ]);
    expect(displayWindow(copilot)?.id).toBe("ai-credits");
  });

  it("returns undefined for empty windows", () => {
    expect(displayWindow(state("opencode-go", []))).toBeUndefined();
  });
});

describe("resetDetailFor", () => {
  it("returns a reset label when a date exists", () => {
    const s = state("opencode-go", [
      {
        id: "monthly",
        label: "M",
        usedPercent: 80,
        resetAt: 1_700_000_000_000,
      },
    ]);
    expect(resetDetailFor(s)).toMatch(/^Resets /);
  });

  it("returns undefined without windows or reset dates", () => {
    expect(resetDetailFor(state("opencode-go", []))).toBeUndefined();
    expect(
      resetDetailFor(
        state("github-copilot", [
          {
            id: "ai-credits",
            label: "C",
            usedPercent: null,
            resetAt: null,
            valueLabel: "Unlimited",
          },
        ]),
      ),
    ).toBeUndefined();
  });
});
