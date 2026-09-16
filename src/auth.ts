import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type AuthEntry = {
  type?: string;
  key?: string;
  token?: string;
  access?: string;
  accountId?: string;
  account_id?: string;
};

type AuthFile = Record<string, AuthEntry>;

function candidateAuthFiles() {
  const home = os.homedir();
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const localAppData = process.env.LOCALAPPDATA;
  const appData = process.env.APPDATA;

  return [
    process.env.OPENCODE_AUTH_FILE,
    path.join(
      xdgDataHome ?? path.join(home, ".local", "share"),
      "opencode",
      "auth.json",
    ),
    localAppData && path.join(localAppData, "opencode", "auth.json"),
    appData && path.join(appData, "opencode", "auth.json"),
    path.join(home, ".local", "share", "opencode", "auth.json"),
  ].filter((file): file is string => Boolean(file));
}

export function readAuthFile(): AuthFile {
  const content = process.env.OPENCODE_AUTH_CONTENT;
  if (content) {
    try {
      return parseAuth(content);
    } catch {
      return {};
    }
  }

  for (const file of candidateAuthFiles()) {
    try {
      if (!fs.existsSync(file)) continue;
      return parseAuth(fs.readFileSync(file, "utf8"));
    } catch {
      // Keep trying the platform-specific locations. A stale or unreadable
      // candidate should not prevent the other providers from rendering.
    }
  }

  return {};
}

function parseAuth(content: string): AuthFile {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) =>
      Boolean(entry && typeof entry === "object"),
    ),
  ) as AuthFile;
}

export function findAuthEntry(auth: AuthFile, aliases: readonly string[]) {
  for (const alias of aliases) {
    const entry = auth[alias];
    if (entry) return entry;
  }
  return undefined;
}

export function credential(entry: AuthEntry | undefined, allowApiKey = true) {
  if (!entry) return undefined;
  if (entry.access) return entry.access;
  if (entry.token) return entry.token;
  if (allowApiKey && entry.key) return entry.key;
  return undefined;
}

export function accountId(entry: AuthEntry | undefined) {
  return entry?.accountId ?? entry?.account_id;
}
