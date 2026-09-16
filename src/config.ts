import type { ProviderId } from "./usage.js";
import { PROVIDERS } from "./usage.js";

export type PluginOptions = {
  providers?: unknown;
  refreshMinutes?: unknown;
};

export type ResolvedConfig = {
  providers: ProviderId[];
  refreshMinutes: number;
};

const DEFAULT_PROVIDERS: ProviderId[] = PROVIDERS.map((p) => p.id);
const DEFAULT_REFRESH_MINUTES = 3;

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function resolveProviders(input: unknown): ProviderId[] {
  const valid = new Set<string>(DEFAULT_PROVIDERS);
  if (input === undefined) return [...DEFAULT_PROVIDERS];
  const list = Array.isArray(input) ? input : [input];
  const picked = [...new Set(list)].filter(
    (id): id is ProviderId => typeof id === "string" && valid.has(id),
  );
  return picked.length > 0 ? picked : [...DEFAULT_PROVIDERS];
}

export function resolveRefreshMinutes(input: unknown): number {
  const number = typeof input === "number" ? input : Number(input);
  return clampInt(number, 1, 60) ?? DEFAULT_REFRESH_MINUTES;
}

export function resolveConfig(options: PluginOptions = {}): ResolvedConfig {
  return {
    providers: resolveProviders(options.providers),
    refreshMinutes: resolveRefreshMinutes(options.refreshMinutes),
  };
}
