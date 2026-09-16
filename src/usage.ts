import { accountId, credential, findAuthEntry, readAuthFile } from "./auth.js";

export type ProviderId = "opencode-go" | "codex" | "github-copilot";

export type UsageWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  resetAt: number | null;
  valueLabel?: string;
  used?: number;
  total?: number;
};

export type ProviderUsage = {
  providerId: ProviderId;
  providerName: string;
  configured: boolean;
  ok: boolean;
  windows: UsageWindow[];
  error?: string;
  fetchedAt: number;
};

export const PROVIDERS: ReadonlyArray<{ id: ProviderId; name: string }> = [
  { id: "opencode-go", name: "OpenCode Go" },
  { id: "codex", name: "Codex" },
  { id: "github-copilot", name: "GitHub Copilot" },
];

const providerAliases: Record<ProviderId, readonly string[]> = {
  "opencode-go": ["opencode-go"],
  codex: ["openai", "codex", "chatgpt"],
  "github-copilot": ["github-copilot", "copilot"],
};

const providerEnvironmentKeys: Record<ProviderId, string> = {
  "opencode-go": "OPENCODE_USAGE_GO_TOKEN",
  codex: "OPENCODE_USAGE_CODEX_TOKEN",
  "github-copilot": "OPENCODE_USAGE_COPILOT_TOKEN",
};

export async function fetchProviderUsage(
  providerId: ProviderId,
): Promise<ProviderUsage> {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  const entry = findAuthEntry(readAuthFile(), providerAliases[providerId]);
  const token =
    process.env[providerEnvironmentKeys[providerId]] ??
    credential(entry, providerId !== "codex");
  const fetchedAt = Date.now();

  if (!token) {
    return {
      providerId,
      providerName: provider.name,
      configured: false,
      ok: false,
      windows: [],
      error: "Not connected in OpenCode",
      fetchedAt,
    };
  }

  try {
    if (providerId === "opencode-go") {
      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "OpenCode usage sidebar",
        "x-opencode-session": "opencode-usage-sidebar",
      };
      try {
        const payload = await getJson(
          "https://opencode.ai/zen/go/v1/usage",
          headers,
        );
        return success(provider, parseOpenCodeGoUsage(payload), fetchedAt);
      } catch (error) {
        // The key can be valid for the API (models 200) yet rejected by the
        // usage endpoint (401). Probe once to tell the two cases apart.
        if (
          error instanceof HttpError &&
          (error.status === 401 || error.status === 403) &&
          (await probeGoKey(token))
        ) {
          throw new Error(
            "Key works but usage is rejected (HTTP 401) — check the Go subscription in console",
          );
        }
        throw error;
      }
    }

    if (providerId === "codex") {
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const id = accountId(entry);
      if (id) headers["ChatGPT-Account-Id"] = id;

      const payload = await getJson(
        "https://chatgpt.com/backend-api/wham/usage",
        headers,
      );
      return success(provider, parseCodexUsage(payload), fetchedAt);
    }

    const payload = await getJson(
      "https://api.github.com/copilot_internal/user",
      {
        Accept: "application/json",
        Authorization: `token ${token}`,
        "Editor-Version": "vscode/1.96.2",
        "X-Github-Api-Version": "2025-04-01",
      },
    );
    return success(provider, parseCopilotUsage(payload), fetchedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return {
      providerId,
      providerName: provider.name,
      configured: true,
      ok: false,
      windows: [],
      error:
        providerId === "opencode-go" && message === "Authentication failed"
          ? "Key rejected — reconnect OpenCode Go with /connect"
          : message,
      fetchedAt,
    };
  }
}

export async function fetchAllProviderUsage(
  providerIds: readonly ProviderId[] = PROVIDERS.map((p) => p.id),
) {
  const valid = new Set(PROVIDERS.map((p) => p.id));
  const ids = providerIds.filter((id) => valid.has(id));
  return Promise.all(
    (ids.length > 0 ? ids : PROVIDERS.map((p) => p.id)).map((id) =>
      fetchProviderUsage(id),
    ),
  );
}

export function isProviderId(id: unknown): id is ProviderId {
  return (
    typeof id === "string" &&
    (PROVIDERS as ReadonlyArray<{ id: string }>).some((p) => p.id === id)
  );
}

export function parseOpenCodeGoUsage(payload: unknown): UsageWindow[] {
  const usage = asRecord(payload)?.usage;
  if (!usage || typeof usage !== "object") return [];

  const definitions = [
    ["5h", "5 hours", "rolling"],
    ["weekly", "Weekly", "weekly"],
    ["monthly", "Monthly", "monthly"],
  ] as const;

  return definitions.flatMap(([id, label, key]) => {
    const entry = asRecord((usage as Record<string, unknown>)[key]);
    const usedPercent = finiteNumber(entry?.percent);
    const resetAt = timestamp(entry?.resetsAt);
    if (usedPercent === null || resetAt === null) return [];
    return [{ id, label, usedPercent: clampPercent(usedPercent), resetAt }];
  });
}

export function parseCodexUsage(payload: unknown): UsageWindow[] {
  const record = asRecord(payload);
  const rateLimit = asRecord(record?.rate_limit);
  const windows: UsageWindow[] = [];

  for (const key of ["primary_window", "secondary_window"] as const) {
    const window = asRecord(rateLimit?.[key]);
    if (!window) continue;

    const usedPercent = finiteNumber(window.used_percent);
    const windowSeconds = finiteNumber(window.limit_window_seconds);
    if (usedPercent === null) continue;

    const id = codexWindowId(windowSeconds);
    windows.push({
      id,
      label: codexWindowLabel(id, windowSeconds),
      usedPercent: clampPercent(usedPercent),
      resetAt: timestamp(window.reset_at),
    });
  }

  const credits = asRecord(record?.credits);
  if (credits?.unlimited === true) {
    windows.push({
      id: "credits",
      label: "Credits",
      usedPercent: null,
      resetAt: null,
      valueLabel: "Unlimited",
    });
  } else {
    const balance = finiteNumber(credits?.balance);
    if (balance !== null) {
      windows.push({
        id: "credits",
        label: "Credits",
        usedPercent: null,
        resetAt: null,
        valueLabel: `$${balance.toFixed(2)} balance`,
      });
    }
  }

  const spendLimit = asRecord(
    asRecord(record?.spend_control)?.individual_limit,
  );
  const spendUsedPercent = finiteNumber(spendLimit?.used_percent);
  const spendUsed = finiteNumber(spendLimit?.used);
  const spendLimitValue = finiteNumber(spendLimit?.limit);
  if (
    spendUsedPercent !== null ||
    (spendUsed !== null && spendLimitValue !== null)
  ) {
    windows.push({
      id: "spend",
      label: "Spend limit",
      usedPercent:
        spendUsedPercent !== null
          ? clampPercent(spendUsedPercent)
          : clampPercent((spendUsed! / spendLimitValue!) * 100),
      resetAt: null,
      valueLabel:
        spendUsed !== null && spendLimitValue !== null
          ? `${spendUsed.toFixed(0)} / ${spendLimitValue.toFixed(0)} used`
          : undefined,
    });
  }

  return windows;
}

export function parseCopilotUsage(payload: unknown): UsageWindow[] {
  const record = asRecord(payload);
  const snapshots = asRecord(record?.quota_snapshots);
  const snapshot = asRecord(snapshots?.premium_interactions);
  if (!snapshot) return [];

  const resetAt = timestamp(record?.quota_reset_date);
  if (snapshot.unlimited === true) {
    return [
      {
        id: "ai-credits",
        label: "AI Credits",
        usedPercent: null,
        resetAt,
        valueLabel: "Unlimited",
      },
    ];
  }

  const entitlement = finiteNumber(snapshot.entitlement);
  const remaining = finiteNumber(snapshot.remaining);
  let usedPercent: number | null = null;
  if (entitlement !== null && entitlement > 0 && remaining !== null) {
    usedPercent = 100 - (remaining / entitlement) * 100;
  } else {
    const percentRemaining = finiteNumber(snapshot.percent_remaining);
    if (percentRemaining !== null) usedPercent = 100 - percentRemaining;
  }

  if (usedPercent === null && entitlement === null && remaining === null)
    return [];

  return [
    {
      id: "ai-credits",
      label: "AI Credits",
      usedPercent: usedPercent === null ? null : clampPercent(usedPercent),
      resetAt,
      valueLabel:
        entitlement !== null && entitlement > 0 && remaining !== null
          ? `${remaining.toFixed(0)} / ${entitlement.toFixed(0)} left`
          : undefined,
      used:
        entitlement !== null && entitlement > 0 && remaining !== null
          ? entitlement - remaining
          : undefined,
      total: entitlement !== null && entitlement > 0 ? entitlement : undefined,
    },
  ];
}

async function getJson(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new HttpError(response.status, "Authentication failed");
      throw new HttpError(
        response.status,
        `API error: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function probeGoKey(token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://opencode.ai/zen/go/v1/models", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function success(
  provider: { id: ProviderId; name: string },
  windows: UsageWindow[],
  fetchedAt: number,
): ProviderUsage {
  return {
    providerId: provider.id,
    providerName: provider.name,
    configured: true,
    ok: true,
    windows,
    error: windows.length === 0 ? "No usage data returned" : undefined,
    fetchedAt,
  };
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function finiteNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(number) ? number : null;
}

function timestamp(value: unknown) {
  const number = finiteNumber(value);
  if (number !== null) {
    const milliseconds = number < 10_000_000_000 ? number * 1000 : number;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function codexWindowId(seconds: number | null) {
  if (seconds !== null && seconds <= 6 * 60 * 60) return "5h";
  if (seconds !== null && seconds <= 8 * 24 * 60 * 60) return "weekly";
  if (seconds !== null && seconds <= 32 * 24 * 60 * 60) return "monthly";
  return "window";
}

function codexWindowLabel(id: string, seconds: number | null) {
  if (id === "5h") return "5 hours";
  if (id === "weekly") return "Weekly";
  if (id === "monthly") return "Monthly";
  return seconds === null ? "Usage" : `${Math.round(seconds / 86_400)}d window`;
}
