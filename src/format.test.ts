import { describe, expect, it } from "vitest";
import { formatAge, numberOption } from "./format.js";

describe("formatAge", () => {
  it("reports just now under a minute", () => {
    expect(formatAge(Date.now())).toBe("just now");
    expect(formatAge(Date.now() - 30_000)).toBe("just now");
  });

  it("reports minutes and hours", () => {
    expect(formatAge(Date.now() - 5 * 60_000)).toBe("5m ago");
    expect(formatAge(Date.now() - 3 * 3_600_000)).toBe("3h ago");
  });

  it("clamps future timestamps", () => {
    expect(formatAge(Date.now() + 60_000)).toBe("just now");
  });
});

describe("numberOption", () => {
  it("clamps to min/max and falls back", () => {
    expect(numberOption(5, 3, 1, 60)).toBe(5);
    expect(numberOption(0, 3, 1, 60)).toBe(1);
    expect(numberOption(999, 3, 1, 60)).toBe(60);
    expect(numberOption(undefined, 3, 1, 60)).toBe(3);
    expect(numberOption("10", 3, 1, 60)).toBe(10);
    expect(numberOption("nope", 3, 1, 60)).toBe(3);
  });
});
