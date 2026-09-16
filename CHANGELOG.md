# Changelog

All notable changes to `opencode-usage-sidebar` are documented here.
Format follows Keep a Changelog; versions follow SemVer.

## [0.1.0] - 2026-09-16

### Added

- TUI `sidebar.content` panel for OpenCode Go, Codex, and GitHub Copilot usage.
- API-only usage (percentages + resets); no console scraping.
- Configurable `providers` and `refreshMinutes` plugin options.
- Env token overrides: `OPENCODE_USAGE_GO_TOKEN`, `OPENCODE_USAGE_CODEX_TOKEN`,
  `OPENCODE_USAGE_COPILOT_TOKEN`, `OPENCODE_AUTH_FILE`, `OPENCODE_AUTH_CONTENT`.
- Click-to-refresh header with italic relative age (`just now ↻`).
- Vitest suite for usage parsers, auth helpers, config, and formatting (31 tests).

### Removed

- Console HTML scraping (`console.ts`, workspaceId, cookie handling).
- Palette `/usage-refresh` command; refresh is now header click + interval only.
