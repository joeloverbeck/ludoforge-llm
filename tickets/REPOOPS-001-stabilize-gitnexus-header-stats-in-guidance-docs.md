# REPOOPS-001: Stabilize GitNexus header stats in guidance docs

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — repository workflow/docs hygiene
**Deps**: AGENTS.md, CLAUDE.md, package.json

## Problem

`npx gitnexus analyze` currently rewrites numeric repository stats in `AGENTS.md` and `CLAUDE.md` (`symbols`, `relationships`, `execution flows`). These values are operationally non-critical and create noisy unrelated diffs that increase merge churn and reduce signal in implementation commits.

## Assumption Reassessment (2026-03-05)

1. Current uncommitted state shows only numeric GitNexus header-stat changes in both guidance docs after analysis refresh.
2. These edits are not required to preserve engine/runtime behavior or ticket/spec correctness.
3. No active ticket currently enforces stable handling for this generated-doc churn.

## Architecture Check

1. Stabilizing generated metadata handling improves repository hygiene and keeps architecture/behavioral diffs focused.
2. This is process/tooling scope only and does not alter game-agnostic runtime, GameDef, GameSpecDoc, or visual-config semantics.
3. No backwards-compatibility shims are needed; adopt one canonical policy for generated GitNexus header stats.

## What to Change

### 1. Choose a single canonical policy for GitNexus header stats

1. Either stop persisting volatile numeric stats in tracked docs (preferred), or
2. Keep stats but enforce deterministic update scope (for example dedicated maintenance commit policy + validation).

### 2. Add an automated guard

1. Add a lightweight check that flags mixed-purpose commits where only GitNexus stat counters changed in `AGENTS.md`/`CLAUDE.md`.
2. Make diagnostics actionable (file path + line + remediation guidance).

## Files to Touch

- `AGENTS.md` (modify policy section if needed)
- `CLAUDE.md` (modify policy section if needed)
- `scripts/` (new guard script, if chosen)
- `package.json` (modify if wiring guard command)

## Out of Scope

- Engine kernel/runtime behavior changes
- Ticket archival integrity logic (`tickets/KERQUERY-016-enforce-active-ticket-reference-integrity-after-archival.md`)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Repository workflow has a deterministic, documented policy for GitNexus header stats.
2. Automated check catches unintended stat-churn diffs (or confirms stable clean state).
3. Existing quality gate remains green (at minimum `pnpm run check:ticket-deps`).

### Invariants

1. Guidance-doc operational metadata updates do not pollute feature/bugfix diffs.
2. GameDef/runtime/simulator remain game-agnostic and unaffected.

## Test Plan

### New/Modified Tests

1. Script-level check coverage (or fixture-based dry run) validating stat-churn detection behavior.

### Commands

1. `pnpm run check:ticket-deps`
2. `<new guard command>` (for example `pnpm run check:repo-hygiene`)
