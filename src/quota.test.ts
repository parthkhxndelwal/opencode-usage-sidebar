import { describe, expect, it } from "vitest";
import { displayWindow, resetDetailFor } from "./quota.js";
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
