import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { For, Show, createSignal, type Accessor } from "solid-js";
import { resolveConfig } from "./config.js";
import { formatAge, formatReset } from "./format.js";
import {
  PROVIDERS,
  fetchAllProviderUsage,
  type ProviderId,
  type ProviderUsage,
} from "./usage.js";

type ProviderState = ProviderUsage & { loading: boolean };
type StateMap = Record<ProviderId, ProviderState>;

const MAX_TITLE_LEN = Math.max(
  ...PROVIDERS.map((provider) => provider.name.length),
);
const TICK_MS = 40;
const CYCLE_TICKS = MAX_TITLE_LEN + 8 + 5;
const MIN_LOADING_MS = 2000;

const initialState = (
  ids: readonly ProviderId[] = PROVIDERS.map((p) => p.id),
): StateMap =>
  Object.fromEntries(
    PROVIDERS.filter((p) => ids.includes(p.id)).map((provider) => [
      provider.id,
      {
        providerId: provider.id,
        providerName: provider.name,
        configured: false,
        ok: false,
        windows: [],
        loading: false,
        fetchedAt: 0,
      },
    ]),
  ) as unknown as StateMap;

function UsageSidebar(props: {
  states: Accessor<StateMap>;
  providers: Accessor<ReadonlyArray<{ id: ProviderId; name: string }>>;
  refreshing: Accessor<boolean>;
  lastRefreshed: Accessor<number | undefined>;
  tick: Accessor<number>;
  onRefresh: () => Promise<void>;
}) {
  const context = usePlugin();
  const theme = context.theme;
  const subdued = theme.text.subdued;
  const errorFg = theme.text.feedback.error.default;
  const tick = props.tick;

  return (
    <box flexDirection="column" width="100%">
      <box
        flexDirection="row"
        width="100%"
        justifyContent="space-between"
        alignItems="center"
      >
        <text fg={theme.text.default}>AI Usage</text>
        <box onMouseUp={() => void props.onRefresh()}>
          <text fg={subdued}>
            {props.refreshing() ? (
              <>
                <em>Updating…</em>
                {" ↻"}
              </>
            ) : props.lastRefreshed() ? (
              <>
                <em>{formatAge(props.lastRefreshed()!)}</em>
                {" ↻"}
              </>
            ) : (
              "↻"
            )}
          </text>
        </box>
      </box>

      <For each={props.providers()}>
        {(provider) => (
          <ProviderRow state={() => props.states()[provider.id]} />
        )}
      </For>
    </box>
  );

  function ProviderRow(props: { state: Accessor<ProviderState> }) {
    const state = props.state;
    const line = () => {
      const s = state();
      if (s.providerId === "opencode-go") return goLine(s);
      if (s.providerId === "codex") return codexLine(s);
      return copilotLine(s);
    };

    return (
      <box flexDirection="column" paddingTop={1} width="100%">
        <ProviderTitle name={state().providerName} loading={state().loading} />

        <Show
          when={state().ok && state().windows.length > 0 && line()}
          fallback={
            <text fg={state().configured ? errorFg : subdued}>
              {state().loading
                ? "…"
                : !state().configured
                  ? "not connected"
                  : (state().error ?? "no data")}
            </text>
          }
        >
          {(text) => <text fg={subdued}>{text()}</text>}
        </Show>
      </box>
    );
  }

  function ProviderTitle(props: { name: string; loading: boolean }) {
    const chars = () => props.name.split("");
    // Shared cycle based on the longest title so every provider's shine
    // starts and finishes its sweep at the same time, plus a short pause
    // before the sweep restarts.
    const pos = () => tick() % CYCLE_TICKS;
    const center = () => pos() - 4;
    const fg = (i: number) => {
      const b = toIntsSafe(theme.text.default);
      const d = toIntsSafe(subdued);
      if (!b || !d) {
        return Math.abs(i - center()) <= 1 ? theme.text.default : subdued;
      }
      const dist = Math.abs(i - center());
      const radius = 4;
      const t =
        dist >= radius ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * dist) / radius);
      return rgbHex(
        Math.round(d[0] + (b[0] - d[0]) * t),
        Math.round(d[1] + (b[1] - d[1]) * t),
        Math.round(d[2] + (b[2] - d[2]) * t),
      );
    };
    return (
      <Show
        when={props.loading}
        fallback={<text fg={theme.text.default}>{props.name}</text>}
      >
        <box flexDirection="row">
          <For each={chars()}>{(ch, i) => <text fg={fg(i())}>{ch}</text>}</For>
        </box>
      </Show>
    );
  }

  function goLine(state: ProviderState): string | undefined {
    const monthly =
      state.windows.find((w) => w.id === "monthly") ?? state.windows[0];
    const pct =
      monthly?.usedPercent === null || monthly?.usedPercent === undefined
        ? undefined
        : Math.round(100 - monthly.usedPercent);
    if (pct === undefined) return state.error ?? "no data";
    return `${pct}% monthly left`;
  }

  function codexLine(state: ProviderState): string | undefined {
    const weekly =
      state.windows.find((w) => w.id === "weekly") ??
      state.windows.find((w) => w.id === "5h") ??
      state.windows[0];
    const pct =
      weekly?.usedPercent === null || weekly?.usedPercent === undefined
        ? undefined
        : Math.round(100 - weekly.usedPercent);
    if (pct === undefined) return state.error ?? "no data";
    if (weekly?.resetAt) {
      return `${pct}% weekly left · resets ${formatReset(weekly.resetAt)}`;
    }
    return `${pct}% weekly left`;
  }

  function copilotLine(state: ProviderState): string | undefined {
    const window =
      state.windows.find((w) => w.id === "ai-credits") ?? state.windows[0];
    if (!window) return state.error ?? "no data";
    const pct =
      window.usedPercent === null || window.usedPercent === undefined
        ? undefined
        : Math.round(100 - window.usedPercent);
    if (pct !== undefined) return `${pct}% monthly left`;
    if (window.valueLabel) return window.valueLabel;
    if (window.used !== undefined && window.total !== undefined) {
      return `${Math.round(window.total - window.used)}/${Math.round(window.total)} left`;
    }
    return state.error ?? "no data";
  }
}

export default Plugin.define({
  id: "opencode-usage-sidebar.tui",
  setup(context) {
    const config = resolveConfig(context.options ?? {});
    const visibleProviders = PROVIDERS.filter((p) =>
      config.providers.includes(p.id),
    );
    const [providers] = createSignal(visibleProviders);
    const [states, setStates] = createSignal<StateMap>(
      initialState(config.providers),
    );
    const [refreshing, setRefreshing] = createSignal(false);
    const [lastRefreshed, setLastRefreshed] = createSignal<number>();
    const [tick, setTick] = createSignal(0);
    const pulse = setInterval(() => setTick((t) => t + 1), TICK_MS);
    let disposed = false;

    const refresh = async () => {
      if (refreshing() || disposed) return;
      setRefreshing(true);
      const startedAt = Date.now();
      setStates(
        (current) =>
          Object.fromEntries(
            visibleProviders.map((provider) => [
              provider.id,
              { ...current[provider.id], loading: true },
            ]),
          ) as unknown as StateMap,
      );

      try {
        const results = await fetchAllProviderUsage(config.providers);
        if (disposed) return;
        // Hold the loading shine for at least 2s and until the active
        // sweep cycle finishes before showing the results.
        while (!disposed) {
          const elapsed = Date.now() - startedAt;
          if (elapsed >= MIN_LOADING_MS && tick() % CYCLE_TICKS === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        if (disposed) return;
        setStates(
          Object.fromEntries(
            results.map((result) => [
              result.providerId,
              { ...result, loading: false },
            ]),
          ) as StateMap,
        );
        setLastRefreshed(Date.now());
      } finally {
        if (!disposed) {
          setRefreshing(false);
          setStates(
            (current) =>
              Object.fromEntries(
                visibleProviders.map((provider) => [
                  provider.id,
                  { ...current[provider.id], loading: false },
                ]),
              ) as unknown as StateMap,
          );
        }
      }
    };

    void refresh();
    const interval = setInterval(
      () => void refresh(),
      config.refreshMinutes * 60_000,
    );

    const unregister = context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <UsageSidebar
          states={states}
          providers={providers}
          refreshing={refreshing}
          lastRefreshed={lastRefreshed}
          tick={tick}
          onRefresh={() => refresh()}
        />
      ),
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      clearInterval(pulse);
      unregister();
    };
  },
});

function toIntsSafe(color: unknown): [number, number, number] | null {
  try {
    const ints = (color as { toInts?: () => unknown })?.toInts?.();
    if (
      Array.isArray(ints) &&
      ints.length >= 3 &&
      ints.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return [ints[0] as number, ints[1] as number, ints[2] as number];
    }
  } catch {
    // Fall through to two-tone fallback.
  }
  return null;
}

function rgbHex(r: number, g: number, b: number) {
  const hex = (n: number) =>
    Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
