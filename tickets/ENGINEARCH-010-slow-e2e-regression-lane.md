# ENGINEARCH-010: Slow E2E Regression Lane for Loop/Runaway Detection

**Status**: PENDING
**Priority**: P2
**Depends on**: ENGINEARCH-006

---

## Summary

Operationalize slow end-to-end regression coverage so loop/runaway failures are caught reliably without slowing default local test runs.

---

## What Needs to Change

- Keep default `test:e2e` fast, but ensure slow tournament coverage is executed in at least one automated lane.
- Add explicit script and docs guidance for running slow suite locally and in CI.
- Ensure slow test gating env vars are consistently wired and discoverable.
- Add runtime assertions/diagnostics where useful for faster triage when long-run regressions occur.

---

## Invariants That Should Pass

- Default local test workflow remains fast and stable.
- Slow tournament regression suite runs in automation on a regular cadence (or protected branch path).
- Loop/runaway regressions in long-run play are detected before release.

---

## Tests That Should Pass

- Slow e2e path executes successfully when enabled:
  - `pnpm -F @ludoforge/engine test:e2e:slow`
  - `pnpm -F @ludoforge/engine test:e2e:all`
- Existing e2e suite remains green without slow flag:
  - `pnpm -F @ludoforge/engine test:e2e`
- Validate full engine/runner guardrails remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
