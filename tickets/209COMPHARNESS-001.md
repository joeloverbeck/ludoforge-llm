# 209COMPHARNESS-001: Live-frontier competence runner + `competence/` module scaffolding

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: `specs/209-game-agnostic-executed-turn-competence-harness.md`

## Problem

The `policy-profile-quality` suite proves binding/proposal-level facts but never executes a turn against the kernel's real published frontier (0/114 test files assert a board-outcome delta; synthetic-root helpers `us-plan-witness-helpers.ts` / `arvn-plan-witness-helpers.ts` build a synthetic candidate, not a live frontier). Closing that proof gap (FOUNDATIONS #16) needs a game-agnostic runner that drives a real game to a target decision point, exposes the kernel-published `actionSelection` frontier, lets the supplied `PolicyAgent` select normally, drives the plan controller through subsequent microturns, and executes through the end of the human-visible turn (grouped by `turnId`). This ticket lands that runner plus the `competence/` module scaffolding every later helper consumes (spec §3.1).

## Assumption Reassessment (2026-06-03)

1. `runGame`/`runGames` (`packages/engine/src/sim/index.ts`) accept `readonly Agent[]` — `PolicyAgent` is an `Agent` — plus a seed; confirmed in the spec-209 reassessment this session.
2. `publishMicroturn` and `applyPublishedDecision` are exported from `packages/engine/src/kernel/index.ts` (`./microturn/publish.js`, `./microturn/apply.js`); `initialState`, `createGameDefRuntime`, and `terminalResult` are available — confirmed by `cross-family-conformance.test.ts` which already builds real state, calls `publishMicroturn`, and applies decisions.
3. `policy-agent-plan-root.ts` throws `'PolicyAgent: plan-selected root not present in the published action frontier.'` when the selected root is absent — the runner relies on the agent selecting **from** the published frontier, so it must invoke the agent against the real `microturn.legalActions`, not a synthetic root list.
4. Test discovery: `packages/engine/package.json` `test:unit` globs `dist/test/unit/**` and `dist/test/architecture/**` only — **not** `dist/test/helpers/**`. Therefore helper **modules** live under `test/helpers/competence/` (imported, never auto-run), and the runnable smoke test for this ticket lives under the discovered `test/architecture/` directory.

## Architecture Check

1. Reuses the existing `publishMicroturn` → agent-select → `applyPublishedDecision` surface (the same path `cross-family-conformance.test.ts` exercises), so the harness adds zero engine entry points and no kernel/compiler/runtime change (FOUNDATIONS #1, #5, #15).
2. The runner is fully game-agnostic: it takes a `GameDef`, seed, agent set, and an "advance until" predicate over generic state — no game-specific identifiers. Any FITL-specific quantity is expressed downstream by the fixture, never here (FOUNDATIONS #1, #9).
3. No backwards-compatibility shims: this is net-new test infrastructure; nothing is aliased or deprecated.

## What to Change

### 1. Create the `competence/` module directory + barrel

`packages/engine/test/helpers/competence/index.ts` — barrel re-exporting the runner now, extended by later tickets (002–005). Each later ticket appends one export line (see Out of Scope: serialize barrel edits).

### 2. Live-frontier runner

`packages/engine/test/helpers/competence/live-frontier-runner.ts`:
- Signature roughly `runToCompetenceDecision({ def, seed, agents, playerCount?, runtime?, advanceUntil })` returning a structured result: `{ targetMicroturn, selectedDecision, preState, postState, decisions, planTrace, microturnTraces, stopReason }`.
- Loop: `initialState` → for each microturn, `publishMicroturn(def, state, runtime)`; if the `advanceUntil(state, microturn)` predicate matches, capture `preState` and the published frontier, invoke the supplied `PolicyAgent` so it selects a root from `microturn.legalActions`, then drive the plan controller through subsequent microturns via `applyPublishedDecision` until the human-visible turn (same `turnId`) completes; capture `postState`.
- Surface the agent's `PolicyPlanTrace` / `PolicyPlanMicroturnTrace[]` (from `packages/engine/src/kernel/types-plan-trace.ts`) so later helpers (002, 004) can assert against real trace records without re-running.
- Bounded by a `microturnBound` guard (mirror `cross-family-conformance.test.ts`); never unbounded (FOUNDATIONS #10).

### 3. Discovered smoke test

`packages/engine/test/architecture/competence-runner-smoke.test.ts` (`// @test-class: architectural-invariant`): builds a real game (FITL), advances to a chosen `actionSelection` decision, asserts the agent selected a member of the published frontier and the turn executed to a `postState` distinct from `preState`. Proves the runner is wired correctly independent of the later helpers.

## Files to Touch

- `packages/engine/test/helpers/competence/index.ts` (new)
- `packages/engine/test/helpers/competence/live-frontier-runner.ts` (new)
- `packages/engine/test/architecture/competence-runner-smoke.test.ts` (new)

## Out of Scope

- The assertion helpers (§3.2–§3.6) — separate tickets 002–005.
- The cross-game `__reference__/` fixture and replay-identity proof — ticket 007 (per spec AC#2/#3/#4).
- The `@proof-tier` convention — ticket 006.
- **Barrel serialization**: tickets 002–005 each append one export to `competence/index.ts`; their implementation sessions must serialize edits to this file (no concurrent merge).

## Acceptance Criteria

### Tests That Must Pass

1. `competence-runner-smoke.test.ts`: the runner advances a real FITL game to a target `actionSelection` microturn, the `PolicyAgent` selects a decision present in `microturn.legalActions`, and the executed turn yields a `postState` whose canonical serialization differs from `preState`.
2. The runner exposes the agent's plan trace (`PolicyPlanTrace`) and per-microturn traces for the executed turn.
3. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`

### Invariants

1. The runner contains no game-specific identifier — only generic `GameDef`/`GameState` queries and the supplied predicate (FOUNDATIONS #1).
2. The agent is always invoked against the kernel-published frontier; the runner never fabricates a synthetic root (FOUNDATIONS #5, #18).
3. Execution is bounded by an explicit microturn cap (FOUNDATIONS #10).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/competence-runner-smoke.test.ts` — proves the runner primitive end-to-end before any helper depends on it.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "dist/test/architecture/competence-runner-smoke.test.js"`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
