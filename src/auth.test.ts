import { afterEach, describe, expect, it } from "vitest";
import { accountId, credential, findAuthEntry } from "./auth.js";

afterEach(() => {
  delete process.env.OPENCODE_AUTH_CONTENT;
});

describe("findAuthEntry", () => {
  it("returns the first matching alias", () => {
    const auth = {
      openai: { access: "a" },
      codex: { access: "b" },
    };
    expect(findAuthEntry(auth, ["codex", "openai"])?.access).toBe("b");
    expect(findAuthEntry(auth, ["chatgpt", "openai"])?.access).toBe("a");
  });

  it("returns undefined when nothing matches", () => {
    expect(findAuthEntry({}, ["codex"])).toBeUndefined();
    expect(findAuthEntry({ other: {} }, ["codex"])).toBeUndefined();
  });
});

describe("credential", () => {
  it("prefers access over token over key", () => {
    expect(credential({ access: "a", token: "t", key: "k" })).toBe("a");
    expect(credential({ token: "t", key: "k" })).toBe("t");
    expect(credential({ key: "k" })).toBe("k");
  });

  it("rejects api keys for OAuth-only providers when asked", () => {
    expect(credential({ key: "k" }, false)).toBeUndefined();
    expect(credential({ token: "t" }, false)).toBe("t");
  });

  it("returns undefined for missing entry", () => {
    expect(credential(undefined)).toBeUndefined();
  });
});

describe("accountId", () => {
  it("reads both casings", () => {
    expect(accountId({ accountId: "a" })).toBe("a");
    expect(accountId({ account_id: "b" })).toBe("b");
    expect(accountId({})).toBeUndefined();
    expect(accountId(undefined)).toBeUndefined();
  });
});
