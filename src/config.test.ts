import { describe, expect, it } from "vitest";
import {
  resolveConfig,
  resolveProviders,
  resolveRefreshMinutes,
} from "./config.js";

describe("resolveProviders", () => {
  it("defaults to all providers", () => {
    expect(resolveProviders(undefined)).toEqual([
      "opencode-go",
      "codex",
      "github-copilot",
    ]);
  });

  it("filters unknown ids and dedupes", () => {
    expect(resolveProviders(["codex", "nope", "codex"])).toEqual(["codex"]);
  });

  it("falls back to all when nothing valid", () => {
    expect(resolveProviders([])).toEqual([
      "opencode-go",
      "codex",
      "github-copilot",
    ]);
    expect(resolveProviders(["nope"])).toEqual([
      "opencode-go",
      "codex",
      "github-copilot",
    ]);
  });

  it("accepts a single string", () => {
    expect(resolveProviders("codex")).toEqual(["codex"]);
  });
});

describe("resolveRefreshMinutes", () => {
  it("clamps 1-60 and defaults to 3", () => {
    expect(resolveRefreshMinutes(undefined)).toBe(3);
    expect(resolveRefreshMinutes(10)).toBe(10);
    expect(resolveRefreshMinutes(0)).toBe(1);
    expect(resolveRefreshMinutes(999)).toBe(60);
    expect(resolveRefreshMinutes("nope")).toBe(3);
  });
});

describe("resolveConfig", () => {
  it("resolves defaults", () => {
    expect(resolveConfig({})).toEqual({
      providers: ["opencode-go", "codex", "github-copilot"],
      refreshMinutes: 3,
    });
  });
});
