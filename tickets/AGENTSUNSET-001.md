# AGENTSUNSET-001: Replace built-in agent test usage with explicit test-only agent helpers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test harness and proof-surface only
**Deps**: None

## Problem

`RandomAgent` and `GreedyAgent` are still heavily used across engine determinism, performance, memory, integration, and Texas e2e tests. Those agents are no longer part of the intended product direction now that authored policy agents exist. Continuing to repair CI around those deprecated built-ins wastes time, obscures the real post-Spec-140 regressions, and keeps test ownership coupled to a shipped fallback-agent contract we plan to remove.

## Assumption Reassessment (2026-04-22)

1. Current HEAD still uses `RandomAgent` and `GreedyAgent` throughout engine tests, including `packages/engine/test/memory/draft-state-gc-measurement.test.ts`, `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts`, `packages/engine/test/integration/spec-140-bounded-termination.test.ts`, and `packages/engine/test/e2e/texas-holdem-tournament.test.ts`.
2. Many generic simulator/unit tests do not need authored policy behavior; they only need a deterministic, explicit decision-selection policy. Several files already define ad hoc `firstLegalAgent` helpers locally.
3. Texas Hold'em now has authored policy profiles in `data/games/texas-holdem/92-agents.md`, so production Texas tests do not need built-in agents for realistic game execution.
4. `docs/FOUNDATIONS.md` requires architecturally comprehensive solutions and one rules protocol for all clients. Test-only decision policies should live in test helpers, not in shipped engine agent exports.

## Architecture Check

1. Replacing built-in test usage with explicit test-only helpers keeps product agent surfaces aligned with the authored-policy model while preserving small, deterministic harnesses for simulator proof.
2. This approach avoids reintroducing a hidden production fallback path. The engine remains game-agnostic; test helpers express only selection strategy, not game-specific rules.
3. No backwards-compatibility shims should be added. Test suites should depend either on authored `PolicyAgent` profiles or on shared test helpers under `packages/engine/test/helpers/`.

## What to Change

### 1. Introduce canonical test-only agent helpers

Add shared helpers for the recurring test roles currently served by `RandomAgent` and local ad hoc objects:

- deterministic `firstLegalAgent`
- deterministic seeded-choice agent for replay/determinism/property coverage
- chooseN-aware helper for microturn frontier tests where confirm/add/remove order matters

These helpers must live under `packages/engine/test/helpers/` and return objects satisfying the `Agent` interface without becoming part of shipped engine exports.

### 2. Migrate engine tests off built-in agents

Replace `RandomAgent` / `GreedyAgent` usage across memory, performance, determinism, integration, and e2e suites with either:

- authored `PolicyAgent` profiles where the test is about real production behavior, or
- shared test-only helpers where the test is about generic simulator/runtime invariants.

The migration should also consolidate repeated local `firstLegalAgent` definitions onto the shared helper.

### 3. Reassess stale proof intent

Rewrite any test whose real purpose was “some agent can progress” rather than “the shipped random/greedy agents behave this way”. Remove or replace the dedicated built-in-agent unit/integration witnesses accordingly.

## Files to Touch

- `packages/engine/test/helpers/**` (add)
- `packages/engine/test/**/*.test.ts` (modify, exact files determined by migration)

## Out of Scope

- Removing built-in agents from shipped engine exports, types, or schemas.
- Runner pre-game UI changes.
- Adding new authored policy profiles outside the minimum needed to replace test usage.

## Acceptance Criteria

### Tests That Must Pass

1. No engine test imports `RandomAgent` or `GreedyAgent` from shipped agent modules.
2. Generic simulator/runtime tests use shared test-only helpers instead of copy-pasted local agent objects.
3. Production-game execution tests that still need autonomous play use authored `PolicyAgent` profiles where available.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Test-only selection policies do not leak into `packages/engine/src/**` shipped exports.
2. Test intent is explicit: authored-policy behavior is proved with `PolicyAgent`; generic simulator behavior is proved with test helpers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/<new helper tests or coverage site>` — prove shared test-only agents are deterministic and choose from published legal actions only.
2. `packages/engine/test/**` migrated suites — preserve each suite’s original invariant while removing built-in-agent coupling.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

