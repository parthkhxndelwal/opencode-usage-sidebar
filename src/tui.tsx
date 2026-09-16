import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { For, Show, createSignal, type Accessor } from "solid-js";
import { resolveConfig } from "./config.js";
import { formatAge } from "./format.js";
import {
  EMPTY_BUDGET_SETTINGS,
  effectiveBudgetCaps,
  effectiveMaxDailyFraction,
  parseBudgetInput,
  sanitizeStoredSettings,
} from "./budget-settings.js";
import {
  EMPTY_BURN_STORE,
  budgetDetailFor,
  dayKey,
  effectiveAllowance,
  isBreached,
  providerShortName,
  trackBurns,
  type BurnStore,
} from "./budgets.js";
import {
  QUOTA_CRIT_COLOR,
  QUOTA_WARN_COLOR,
  displayWindow,
  quotaLevelForUsed,
  resetDetailFor,
} from "./quota.js";
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
  breaches: Accessor<Record<string, { delta: number; allowance: number }>>;
  burn: Accessor<
    Partial<Record<ProviderId, { delta: number; allowance: number }>>
  >;
  onRefresh: () => Promise<void>;
}) {
  const context = usePlugin();
  const theme = context.theme;
  const subdued = theme.text.subdued;
  const errorFg = theme.text.feedback.error.default;
  const tick = props.tick;
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  const breachText = () => {
    const entries = Object.entries(props.breaches());
    if (entries.length === 0) return undefined;
    const parts = entries.map(
      ([id, breach]) =>
        `${providerShortName(id as ProviderId)} +${breach.delta.toFixed(1)}/${breach.allowance.toFixed(1)}pts`,
    );
    return `⚠ Over daily budget: ${parts.join(" · ")}`;
  };

  return (
    <box flexDirection="column" width="100%">
      <Show when={breachText()}>
        {(text) => (
          <box paddingBottom={1}>
            <text fg={QUOTA_CRIT_COLOR}>{text()}</text>
          </box>
        )}
      </Show>
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
          <ProviderRow
            state={() => props.states()[provider.id]}
            burn={() => props.burn()[provider.id]}
            expanded={() => expanded()[provider.id] === true}
            onToggle={() => toggle(provider.id)}
          />
        )}
      </For>
    </box>
  );

  function ProviderRow(props: {
    state: Accessor<ProviderState>;
    burn: Accessor<{ delta: number; allowance: number } | undefined>;
    expanded: Accessor<boolean>;
    onToggle: () => void;
  }) {
    const state = props.state;
    const line = () => {
      const s = state();
      if (s.providerId === "opencode-go") return goLine(s);
      if (s.providerId === "codex") return codexLine(s);
      return copilotLine(s);
    };
    const lineFg = () => {
      const level = quotaLevelForUsed(displayWindow(state())?.usedPercent);
      if (level === "critical") return QUOTA_CRIT_COLOR;
      if (level === "warn") return QUOTA_WARN_COLOR;
      return subdued;
    };
    const budgetLine = () => {
      const tracked = props.burn();
      if (!tracked) return undefined;
      return budgetDetailFor(tracked.delta, tracked.allowance);
    };

    return (
      <box flexDirection="column" paddingTop={1} width="100%">
        <box
          onMouseUp={() => props.onToggle()}
          flexDirection="row"
          width="100%"
          justifyContent="space-between"
          alignItems="center"
        >
          <ProviderTitle
            name={state().providerName}
            loading={state().loading}
          />
          <text fg={subdued}>{props.expanded() ? "▾" : "▸"}</text>
        </box>

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
          {(text) => <text fg={lineFg()}>{text()}</text>}
        </Show>

        <Show when={props.expanded() && resetDetailFor(state())}>
          {(detail) => <text fg={subdued}>{detail()}</text>}
        </Show>

        <Show when={props.expanded() && budgetLine()}>
          {(detail) => <text fg={subdued}>{detail()}</text>}
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
    const [breaches, setBreaches] = createSignal<
      Record<string, { delta: number; allowance: number }>
    >({});
    const [burn, setBurn] = createSignal<
      Partial<Record<ProviderId, { delta: number; allowance: number }>>
    >({});
    const [burnStore, setBurnStore] = context.storage.store<BurnStore>(
      "daily-burn",
      { initial: EMPTY_BURN_STORE },
    );
    const [budgetSettings, setBudgetSettings] = context.storage.store(
      "budget-settings",
      { initial: EMPTY_BUDGET_SETTINGS },
    );
    const effectiveCaps = () =>
      effectiveBudgetCaps(
        config.budgetCaps,
        sanitizeStoredSettings(budgetSettings),
      );
    const effectiveFraction = () =>
      effectiveMaxDailyFraction(
        config.maxDailyFraction,
        sanitizeStoredSettings(budgetSettings),
      );
    const budgetsEnabled = () => {
      const caps = effectiveCaps();
      return Object.keys(caps).length > 0 || effectiveFraction() !== undefined;
    };
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
        if (budgetsEnabled() && !disposed) {
          const today = dayKey();
          const readings = results.flatMap((result) => {
            const used = displayWindow(result)?.usedPercent;
            return typeof used === "number" && Number.isFinite(used)
              ? [{ id: result.providerId, used }]
              : [];
          });
          const snapshot: BurnStore = {
            date: burnStore.date,
            baselines: { ...burnStore.baselines },
          };
          const tracked = trackBurns(snapshot, today, readings);
          await setBurnStore((draft) => {
            draft.date = tracked.store.date;
            draft.baselines = tracked.store.baselines;
          });
          const caps = effectiveCaps();
          const fraction = effectiveFraction();
          const next: Record<string, { delta: number; allowance: number }> = {};
          const tracked2: Partial<
            Record<ProviderId, { delta: number; allowance: number }>
          > = {};
          for (const result of results) {
            const delta = tracked.deltas[result.providerId];
            if (delta === undefined) continue;
            const allowance = effectiveAllowance({
              perProviderCap: caps[result.providerId],
              globalFraction: fraction,
              baselineUsed: tracked.store.baselines[result.providerId],
            });
            if (allowance === undefined) continue;
            tracked2[result.providerId] = { delta, allowance };
            if (isBreached(delta, allowance)) {
              next[result.providerId] = { delta, allowance };
            }
          }
          setBurn(tracked2);
          setBreaches(next);
        }
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

    const openBudgetEditor = async () => {
      const stored = sanitizeStoredSettings(budgetSettings);
      const caps = effectiveBudgetCaps(config.budgetCaps, stored);
      const fraction = effectiveMaxDailyFraction(
        config.maxDailyFraction,
        stored,
      );
      const deltas = burn();
      const choice = await context.ui.dialog.select({
        title: "AI Usage Budget",
        placeholder: "Choose a budget to edit",
        options: [
          ...visibleProviders.map((p) => {
            const burned = deltas[p.id]?.delta;
            const cap = caps[p.id];
            return {
              title: p.name,
              value: `provider:${p.id}`,
              description: `${cap !== undefined ? `${cap}pts/day` : "no cap"}${burned !== undefined ? ` · burned ${burned.toFixed(1)} today` : ""}`,
            };
          }),
          {
            title: "Global relative cap",
            value: "global",
            description:
              fraction !== undefined ? `${fraction}% of remaining/day` : "off",
          },
          {
            title: "Reset to config file",
            value: "reset",
            description: "Clear budgets set here",
          },
        ],
      });
      if (choice === undefined) return;
      if (choice === "reset") {
        await setBudgetSettings((draft) => {
          draft.caps = {};
          draft.maxDailyFraction = undefined;
        });
        void refresh();
        return;
      }
      if (choice === "global") {
        for (;;) {
          const input = await context.ui.dialog.prompt({
            title: "Global relative cap",
            description: "Percent of remaining quota allowed per day, or off.",
            value: fraction !== undefined ? `${fraction}` : "",
            placeholder: "e.g. 5, or off",
          });
          if (input === undefined) return;
          const parsed = parseBudgetInput(input);
          if (parsed === undefined) {
            await context.ui.dialog.alert({
              title: "Invalid budget",
              message: "Enter a number 0–100 or off.",
            });
            continue;
          }
          await setBudgetSettings((draft) => {
            draft.maxDailyFraction = parsed === "off" ? null : parsed;
          });
          void refresh();
          return;
        }
      }
      const provider = visibleProviders.find(
        (p) => `provider:${p.id}` === choice,
      );
      if (!provider) return;
      const burned = deltas[provider.id]?.delta;
      const current = caps[provider.id];
      for (;;) {
        const input = await context.ui.dialog.prompt({
          title: `Daily burn cap — ${provider.name}`,
          description: `Percentage points per day, or off.${burned !== undefined ? ` Burned ${burned.toFixed(1)} today.` : ""}`,
          value: current !== undefined ? `${current}` : "",
          placeholder: "e.g. 30, or off",
        });
        if (input === undefined) return;
        const parsed = parseBudgetInput(input);
        if (parsed === undefined) {
          await context.ui.dialog.alert({
            title: "Invalid budget",
            message: "Enter a number 0–100 or off.",
          });
          continue;
        }
        const value = parsed === "off" ? null : parsed;
        await setBudgetSettings((draft) => {
          draft.caps[provider.id] = value;
        });
        void refresh();
        return;
      }
    };

    const unregisterApp = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "opencode-usage-sidebar.budget",
              title: "AI Usage Budget",
              group: "Usage",
              palette: true,
              run: () => void openBudgetEditor(),
            },
          ],
        }));
        return null;
      },
    });

    const unregister = context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <UsageSidebar
          states={states}
          providers={providers}
          refreshing={refreshing}
          lastRefreshed={lastRefreshed}
          tick={tick}
          breaches={breaches}
          burn={burn}
          onRefresh={() => refresh()}
        />
      ),
    });

    const breachEntries = () => Object.entries(breaches());
    const unregisterComposer = context.ui.slot({
      append: "session.composer.top",
      render: () => (
        <Show when={breachEntries().length > 0}>
          <box width="100%">
            <text fg={QUOTA_CRIT_COLOR}>
              {`⚠ Over daily budget: ${breachEntries()
                .map(
                  ([id, breach]) =>
                    `${providerShortName(id as ProviderId)} +${breach.delta.toFixed(1)}/${breach.allowance.toFixed(1)}pts today`,
                )
                .join(" · ")}`}
            </text>
          </box>
        </Show>
      ),
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      clearInterval(pulse);
      unregister();
      unregisterApp();
      unregisterComposer();
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
