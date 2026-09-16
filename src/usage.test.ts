import { describe, expect, it } from "vitest";
import {
  parseCodexUsage,
  parseCopilotUsage,
  parseOpenCodeGoUsage,
} from "./usage.js";

describe("parseOpenCodeGoUsage", () => {
  it("parses rolling/weekly/monthly windows", () => {
    const payload = {
      usage: {
        rolling: { percent: 12.4, resetsAt: 1_700_000_000 },
        weekly: { percent: 55, resetsAt: "2026-09-20T00:00:00Z" },
        monthly: { percent: 80.6, resetsAt: 1_700_000_000_000 },
      },
    };
    const windows = parseOpenCodeGoUsage(payload);
    expect(windows).toHaveLength(3);
    expect(windows.map((w) => w.id)).toEqual(["5h", "weekly", "monthly"]);
    expect(windows[0].usedPercent).toBeCloseTo(12.4);
    expect(windows[2].usedPercent).toBeCloseTo(80.6);
    expect(windows.every((w) => typeof w.resetAt === "number")).toBe(true);
  });

  it("clamps percentages to 0-100", () => {
    const payload = {
      usage: {
        rolling: { percent: 140, resetsAt: 1_700_000_000 },
        weekly: { percent: -5, resetsAt: 1_700_000_000 },
        monthly: { percent: 50, resetsAt: 1_700_000_000 },
      },
    };
    const windows = parseOpenCodeGoUsage(payload);
    expect(windows.find((w) => w.id === "5h")?.usedPercent).toBe(100);
    expect(windows.find((w) => w.id === "weekly")?.usedPercent).toBe(0);
  });

  it("accepts numeric strings", () => {
    const payload = {
      usage: {
        rolling: { percent: "25", resetsAt: "2026-09-20T00:00:00Z" },
        weekly: { percent: "50", resetsAt: 1_700_000_000 },
        monthly: { percent: "75", resetsAt: 1_700_000_000 },
      },
    };
    expect(parseOpenCodeGoUsage(payload)).toHaveLength(3);
  });

  it("drops windows missing percent or reset", () => {
    expect(
      parseOpenCodeGoUsage({ usage: { monthly: { percent: 10 } } }),
    ).toEqual([]);
    expect(
      parseOpenCodeGoUsage({ usage: { monthly: { resetsAt: 1 } } }),
    ).toEqual([]);
  });

  it("returns [] for malformed payloads", () => {
    expect(parseOpenCodeGoUsage(null)).toEqual([]);
    expect(parseOpenCodeGoUsage({})).toEqual([]);
    expect(parseOpenCodeGoUsage({ usage: null })).toEqual([]);
    expect(parseOpenCodeGoUsage({ usage: [] })).toEqual([]);
  });
});

describe("parseCodexUsage", () => {
  it("maps primary/secondary windows by duration", () => {
    const payload = {
      rate_limit: {
        primary_window: {
          used_percent: 30,
          limit_window_seconds: 5 * 3600,
          reset_at: 1_700_000_000,
        },
        secondary_window: {
          used_percent: 60,
          limit_window_seconds: 7 * 86400,
          reset_at: "2026-09-20T00:00:00Z",
        },
      },
    };
    const windows = parseCodexUsage(payload);
    expect(windows.map((w) => w.id)).toEqual(["5h", "weekly"]);
    expect(windows[0].usedPercent).toBe(30);
    expect(windows[1].label).toBe("Weekly");
  });

  it("labels long windows as monthly and unknown as Nd window", () => {
    const payload = {
      rate_limit: {
        primary_window: {
          used_percent: 10,
          limit_window_seconds: 30 * 86400,
        },
        secondary_window: {
          used_percent: 20,
          limit_window_seconds: 90 * 86400,
        },
      },
    };
    const windows = parseCodexUsage(payload);
    expect(windows[0].id).toBe("monthly");
    expect(windows[1].label).toMatch(/d window/);
  });

  it("reports unlimited credits", () => {
    const windows = parseCodexUsage({ credits: { unlimited: true } });
    expect(windows).toContainEqual(
      expect.objectContaining({ id: "credits", valueLabel: "Unlimited" }),
    );
  });

  it("reports credit balance", () => {
    const windows = parseCodexUsage({ credits: { balance: 12.345 } });
    expect(windows).toContainEqual(
      expect.objectContaining({ id: "credits", valueLabel: "$12.35 balance" }),
    );
  });

  it("reports spend limit from percent or used/limit", () => {
    const fromPercent = parseCodexUsage({
      spend_control: { individual_limit: { used_percent: 40 } },
    });
    expect(fromPercent.find((w) => w.id === "spend")?.usedPercent).toBe(40);

    const fromRatio = parseCodexUsage({
      spend_control: { individual_limit: { used: 30, limit: 100 } },
    });
    const spend = fromRatio.find((w) => w.id === "spend");
    expect(spend?.usedPercent).toBeCloseTo(30);
    expect(spend?.valueLabel).toBe("30 / 100 used");
  });

  it("returns [] for empty payloads", () => {
    expect(parseCodexUsage(null)).toEqual([]);
    expect(parseCodexUsage({})).toEqual([]);
  });
});

describe("parseCopilotUsage", () => {
  it("computes used percent from entitlement/remaining", () => {
    const payload = {
      quota_snapshots: {
        premium_interactions: { entitlement: 1000, remaining: 250 },
      },
      quota_reset_date: "2026-10-01T00:00:00Z",
    };
    const windows = parseCopilotUsage(payload);
    expect(windows).toHaveLength(1);
    expect(windows[0].usedPercent).toBeCloseTo(75);
    expect(windows[0].used).toBe(750);
    expect(windows[0].total).toBe(1000);
    expect(typeof windows[0].resetAt).toBe("number");
  });

  it("falls back to percent_remaining", () => {
    const payload = {
      quota_snapshots: { premium_interactions: { percent_remaining: 20 } },
    };
    expect(parseCopilotUsage(payload)[0].usedPercent).toBeCloseTo(80);
  });

  it("reports unlimited", () => {
    const payload = {
      quota_snapshots: { premium_interactions: { unlimited: true } },
    };
    const windows = parseCopilotUsage(payload);
    expect(windows[0].valueLabel).toBe("Unlimited");
    expect(windows[0].usedPercent).toBeNull();
  });

  it("returns [] when no snapshot", () => {
    expect(parseCopilotUsage(null)).toEqual([]);
    expect(parseCopilotUsage({})).toEqual([]);
    expect(parseCopilotUsage({ quota_snapshots: {} })).toEqual([]);
  });
});
