# ENGINEARCH-010: Slow E2E Regression Lane for Loop/Runaway Detection

**Status**: ✅ COMPLETED
**Priority**: P2
**Depends on**: ENGINEARCH-006

---

## Summary

Operationalize slow end-to-end regression coverage so loop/runaway failures are caught reliably without slowing default local test runs.

## Reassessed Current State (2026-02-18)

- `packages/engine/package.json` already defines:
  - `test:e2e` (default fast lane)
  - `test:e2e:slow` (slow tournament-only lane with `RUN_SLOW_E2E=1`)
  - `test:e2e:all` (full e2e lane with slow test enabled)
- `packages/engine/test/e2e/texas-holdem-tournament.test.ts` already gates `[slow]` coverage behind `RUN_SLOW_E2E`.
- Remaining gaps are architectural/operational:
  - No explicit repository-level CI lane contract documenting where/when `test:e2e:slow` must run.
  - Slow tournament test currently permits `stopReason === 'maxTurns'` without strong diagnostics, which weakens triage quality.
  - No concise root-level testing guidance for contributors on when to run fast vs slow e2e lanes.

---

## What Needs to Change

- Preserve current fast/slow script split (do not add redundant aliases).
- Tighten slow tournament assertions so:
  - runtime stalls/no-progress signatures fail clearly, and
  - `maxTurns` outcomes include explicit diagnostics and invariant checks (instead of permissive pass-through).
- Add concise contributor docs that define:
  - fast local default (`test:e2e`)
  - opt-in slow local lane (`test:e2e:slow`)
  - automation lane requirement (`test:e2e:all` or `test:e2e` + `test:e2e:slow`)
- Add failure diagnostics in slow tournament coverage to reduce triage time when runaways occur.

---

## Invariants That Should Pass

- Default local test workflow remains fast and stable.
- Slow tournament regression suite has an explicit automation contract.
- Loop/runaway regressions in long-run play fail the slow lane with actionable diagnostics.

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

---

## Outcome

- **Completion date**: 2026-02-18
- **What actually changed**:
  - Reassessed and corrected ticket assumptions to reflect existing fast/slow e2e script/env wiring.
  - Added explicit repository testing-lane guidance and automation contract in `README.md`.
  - Strengthened slow tournament e2e assertions to fail on `noLegalMoves` and emit actionable diagnostics for non-terminal outcomes, while preserving bounded `maxTurns` behavior checks.
- **Deviations from original plan**:
  - Original plan implied treating `maxTurns` as outright failure; this was revised after validation because deterministic slow stress seed `42` does not terminate even at higher turn budgets.
  - Final design enforces stronger invariants/diagnostics for `maxTurns` rather than forcing terminal completion for that seed.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm -F @ludoforge/engine test:e2e:slow`
  - `pnpm -F @ludoforge/engine test:e2e:all`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo lint`
