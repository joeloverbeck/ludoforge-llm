# 109AGEPREAUD-002: Fix downstream event preview differentiation after trusted preparation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy-preview.ts, policy-eval.ts, preview surface / scoring path as indicated by audit
**Deps**: `archive/tickets/109AGEPREAUD-001.md`

## Problem

Ticket 001 disproved the original broad hypothesis that FITL event moves generally fail out of `preparePlayableMoves`. In the audited seeds:

- `card-17` shaded started `pending` but completed successfully and entered `trustedMoveIndex`
- `card-116` shaded and unshaded both classified `complete`, entered `trustedMoveIndex`, and reached `ready` preview

Yet materially different event sides can still score identically. So the remaining bug is downstream of basic move preparation: preview-state equivalence, projected-margin evaluation over trusted preview states, or another later-stage scoring-path collapse.

## Assumption Reassessment (2026-04-05)

1. Ticket 001 added verbose `movePreparations` diagnostics to the policy trace and captured FITL evidence in `reports/109-agent-preview-audit.md`.
2. Seed 1003: a shaded event move with inner decisions entered the pipeline as `pending`, completed successfully, entered `trustedMoveIndex`, and reached `previewOutcome=ready`.
3. Seed 1004: both shaded and unshaded sides of `card-116` entered `trustedMoveIndex` and reached `previewOutcome=ready`, yet still scored `-40`.
4. So the broad `preparePlayableMoves` / `trustedMoveIndex` failure path is not the general root cause. This ticket must target the downstream stage that still collapses materially different event sides to the same projected margin.

## Architecture Check

1. The fix must be game-agnostic (Foundation 1) — it applies to any game with sided events, not just FITL.
2. Event effects are already encoded in YAML (Foundation 7) — the fix ensures the engine evaluates them correctly during preview.
3. Preview must remain deterministic (Foundation 8) — same move + same state = same preview result.
4. No compatibility shims (Foundation 14) — fix the actual downstream collapse directly instead of preserving the disproved preparation-path hypothesis.

## What to Change

### 1. Fix the downstream stage that collapses trusted event previews

Based on ticket 001's audit findings, inspect the trusted-preview path for event moves that already survive preparation:

- Compare the preview-applied states for shaded vs unshaded trusted event candidates
- Verify whether the projected state is actually different and the scoring surface collapses later
- Or verify whether the trusted move / preview application path is still normalizing distinct event sides to the same effective move or state
- Fix the concrete downstream collapse point once identified

Potentially relevant surfaces:

- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/src/agents/policy-eval.ts`
- any preview-surface or projected-margin helper touched by the audit findings

### 2. Verify preview produces different margins for different sides

After the fix, confirm that for materially different event sides:
- Shaded event candidate → preview applies shaded effects → projected state A → margin A
- Unshaded event candidate → preview applies unshaded effects → projected state B → margin B
- margin A ≠ margin B (when effects genuinely differ)

### 3. Handle capability cards honestly

Capability events that install persistent modifiers: preview applies the move, projected state reflects the capability installation. If the margin doesn't change (capabilities are long-term), that's correct — no artificial bonuses.

### 4. Handle stochastic events under `tolerateStochastic`

Events with `rollRandom` in their effect tree: under `tolerateStochastic` mode, preview should produce a `stochastic` outcome (not `unknown`). Keep this requirement if the downstream bug touches stochastic handling, but do not force unrelated changes if the audited root cause is elsewhere.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify, if needed)
- `packages/engine/src/agents/policy-eval.ts` (modify, if needed)
- adjacent preview/scoring helpers implicated by the audited downstream collapse

## Out of Scope

- Enumeration-time filter (ticket 003)
- Preview trace diagnostics (ticket 004)
- Integration tests (ticket 005)
- Multi-step preview (out of spec scope)
- Non-event preview changes

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: dual-sided event card where shaded places tokens and unshaded removes them — preview produces different projected margins
2. Unit test: capability event — preview completes (not `unknown`) and returns projected state
3. Unit test: stochastic event under `tolerateStochastic` — preview returns `stochastic` outcome, not `unknown`
4. Existing suite: `pnpm turbo test`

### Invariants

1. Non-event moves preview unchanged — no regression on rally, terror, attack, etc.
2. Events with genuinely identical effects on both sides continue to score identically (correct behavior)
3. Preview remains deterministic: same move + same state = same result
4. No game-specific logic in the fix (Foundation 1)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/event-preview-differentiation.test.ts` (new) — test shaded vs unshaded trusted preview for dual-sided events with different effects
2. `packages/engine/test/unit/agents/capability-event-preview.test.ts` (new) — test capability card preview completes
3. `packages/engine/test/unit/agents/stochastic-event-preview.test.ts` (new) — test stochastic event under tolerateStochastic

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
