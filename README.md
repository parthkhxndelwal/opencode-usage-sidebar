# OpenCode usage sidebar

TUI `sidebar.content` panel showing remaining quota for:

- OpenCode Go (`% monthly left`)
- Codex / ChatGPT (`% weekly left`)
- GitHub Copilot (`% monthly left`)

API-only. No scraping, no token writes, no context pollution. Refreshes on an
interval; click the `↻` header to refresh manually. Click a provider title
(`▸`) to expand its reset date; click again (`▾`) to collapse.

Usage lines turn light yellow (`#FDE047`) at ≤20% remaining and orange
(`#FB923C`) at ≤5% remaining.

## Install

Local path (development):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./plugins/opencode-usage-sidebar"],
}
```

Restart OpenCode after adding the entry.

## Options

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./plugins/opencode-usage-sidebar",
      "options": {
        "providers": ["opencode-go", "codex", "github-copilot"],
        "refreshMinutes": 3,
      },
    },
  ],
}
```

| Option             | Type       | Default   | Notes                                                                                                                                                                                 |
| ------------------ | ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`        | `string[]` | all three | Unknown ids are ignored. Empty falls back to all.                                                                                                                                     |
| `refreshMinutes`   | `number`   | `3`       | Clamped to 1–60.                                                                                                                                                                      |
| `budgets`          | `object`   | off       | Per-provider daily burn caps in percentage points, e.g. `{ "opencode-go": 30 }`. Values must be 0–100.                                                                                |
| `maxDailyFraction` | `number`   | off       | Global relative cap: percent of remaining quota at day start allowed per day. E.g. `5` with 90% remaining allows 4.5pts. Effective allowance is the min of the two when both are set. |

Daily burn is tracked from the displayed window's `usedPercent` against a
local-day baseline persisted in plugin storage (survives restarts). Quota
window resets rebase the baseline instead of counting negative burn. Breaches
show as a banner in the sidebar and a warning above the session composer
(`session.composer.top`). No toasts.

## AI Usage Budget (TUI setting)

Open the command palette and run **AI Usage Budget** to edit budgets without
touching the config file: pick a provider (shows current cap and today's
burn), the global relative cap, or reset everything to the config file.
Values set here persist in plugin storage and override the config file;
`off` disables that budget, and reset clears all overrides. Changes apply on
the next refresh.

## Authentication

Connect providers in OpenCode first with `/connect`. The plugin only reads
credentials already stored by OpenCode in `auth.json`; it never writes or
displays tokens. Codex usage requires the OAuth/session credential, not a
normal OpenAI API key.

Optional env overrides (take precedence over `auth.json`):

```text
OPENCODE_USAGE_GO_TOKEN
OPENCODE_USAGE_CODEX_TOKEN
OPENCODE_USAGE_COPILOT_TOKEN
OPENCODE_AUTH_FILE
OPENCODE_AUTH_CONTENT
```

## Endpoints

- Go: `https://opencode.ai/zen/go/v1/usage` (percentages only)
- Codex: `https://chatgpt.com/backend-api/wham/usage`
- Copilot: `https://api.github.com/copilot_internal/user` (undocumented;
  same endpoint Copilot clients use; may change independently of this plugin)

Failures render inline (`not connected`, `Key rejected — reconnect …`,
`API error: HTTP …`, `No usage data returned`). Last-good state is replaced
only on successful fetch.

## Development

```sh
npm install
npm test
npm run typecheck
npm run format:check
```

Uses `@opencode/plugin` + OpenTUI Solid components. No provider secret is
included in this project. See `CHANGELOG.md`.
