# 118PROBOUCAT-006: Investigate `hasTransportLikeStateChangeFallback` viability probe restructuring

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: None — investigation only, may produce a follow-up spec
**Deps**: None

## Problem

`free-operation-viability.ts:587-591` catches `CHOICE_RUNTIME_VALIDATION_FAILED` and falls back to `hasTransportLikeStateChangeFallback()` — a 68-line heuristic (lines 348–415) that inspects move params for zone/token selections to guess whether a move would change game state. This is architecturally distinct from Groups A-C (which handle missing bindings during discovery); Group D handles choice validation failure during viability probing.

The heuristic is deterministic and bounded (no F8 or F10 violations), but it strains F15 (Architectural Completeness) — it patches a symptom (choice validation throws) rather than addressing the root cause (the viability probe can't complete because a sub-decision fails mid-execution).

This ticket is investigation-only. It answers three questions and produces a finding report, not code changes.

## Assumption Reassessment (2026-04-07)

1. `free-operation-viability.ts` exists at `packages/engine/src/kernel/free-operation-viability.ts` — confirmed.
2. `hasTransportLikeStateChangeFallback` defined at lines 348–415 (68 lines), signature `(def: GameDef, state: GameState, move: Move): boolean` — confirmed.
3. The catch block at line ~587 checks `isEffectRuntimeReason(error, 'CHOICE_RUNTIME_VALIDATION_FAILED')` — confirmed.
4. The heuristic inspects move params for zone IDs and token IDs, checking whether tokens would move to different zones — confirmed from code reading.

## Architecture Check

1. Investigation-only — no code changes, no risk.
2. The investigation results will determine whether a follow-up spec or ticket is needed.
3. No game-specific logic in the investigation scope — the heuristic operates on generic GameDef/GameState/Move.

## What to Change

### 1. Answer: Can the viability probe evaluate state-change potential before hitting choice validation?

Investigate whether effects can be run up to the first choice point and checked for token movement, bypassing the choice validation that triggers the fallback. Trace the viability probe call chain to determine:
- Where choice validation occurs in the effect execution sequence
- Whether partial effect execution is possible (effects before the first choice)
- What information is available at that point to determine state-change potential

### 2. Answer: Is `hasTransportLikeStateChangeFallback` empirically correct?

Run the FITL canary seeds with the heuristic enabled (current behavior) and disabled (always return `false` or always return `true`). Measure:
- How many moves are affected by the heuristic
- Whether disabling it causes legal-move enumeration divergence
- Whether any false positives or false negatives are detectable

### 3. Answer: Can the choice validation error be made recoverable?

Investigate whether the choice validation error can return a partial execution result that includes "effects applied so far." This would let the viability probe inspect actual effects rather than guessing from move params.

### 4. Produce finding report

Write a finding report to `reports/` summarizing answers to the 3 questions and recommending one of:
- **No action** — the heuristic is correct and the architectural strain is acceptable
- **Follow-up spec** — restructure the viability probe to eliminate the heuristic (describe the approach)
- **Incremental improvement** — a smaller change that reduces the strain without full restructuring

## Files to Touch

- `reports/118PROBOUCAT-006-viability-heuristic-investigation.md` (new)

## Out of Scope

- Implementing any code changes to the heuristic or viability probe
- Migrating Group A, B, or C catch blocks
- Changes to `classifyMissingBindingProbeError` or other classifiers

## Acceptance Criteria

### Tests That Must Pass

1. No tests affected — this is an investigation ticket
2. FITL canary seeds used as a measurement tool, not as a gate

### Invariants

1. No code changes — codebase state is unchanged after this ticket
2. Finding report answers all 3 investigation questions with evidence

## Test Plan

### New/Modified Tests

1. None — investigation only

### Commands

1. `pnpm -F @ludoforge/engine test` (verify no unintended changes)
