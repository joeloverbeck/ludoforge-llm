# 132AGESTUVIA-001: Unify enumerate/probe viability behind a shared predicate (S1 + I1 + S4.1)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel viability predicate extraction; updates to `legal-moves.ts` and `apply-move.ts` call sites
**Deps**: `specs/132-agent-stuck-viable-template-completion-mismatch.md`

## Problem

On HEAD, `enumerateLegalMoves(...)` and `probeMoveViability(...)` deterministically disagree on the viability of free-operation `march` template moves for FITL seed 1000 at NVA turn 1, move 140. Enumerate emits the moves as VIABLE; a fresh probe on the same `(def, state, move, runtime)` returns `viable=false, code=ILLEGAL_MOVE`. This disagreement is the first of two defects that combine to produce the `NoPlayableMovesAfterPreparationError` / `stopReason=agentStuck` crash blocking the `fitl-arvn-agent-evolution` campaign. Foundation #5 requires a single source of truth for legality; two divergent viability paths violate that principle directly.

## Assumption Reassessment (2026-04-16)

1. `packages/engine/src/kernel/legal-moves.ts:1428` exports `enumerateLegalMoves` — confirmed during reassess-spec session.
2. `packages/engine/src/kernel/apply-move.ts` contains `probeMoveViability` — confirmed.
3. `packages/engine/src/kernel/playable-candidate.ts` hosts `classifyPlayableCandidateViability` and `evaluatePlayableMoveCandidate`; both consume `probeMoveViability` output — confirmed.
4. No pre-existing shared predicate named `viability-predicate.ts` — confirmed greenfield.
5. `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` reproduces the divergence deterministically on seed 1000 (stateHash `6539610714732013105`).

## Architecture Check

1. Extracting a single pure predicate eliminates enumerate/probe drift at its source rather than papering over it in downstream filters. Foundation #15 — root-cause fix, not symptom patch.
2. The predicate is a pure `(def, state, move, runtime) -> ViabilityVerdict` function. Foundation #11 — no mutation of inputs; caller-visible state is never touched.
3. Kernel-internal refactor; no game-specific branching introduced. Foundation #1 preserved. Foundation #12 — free-operation viability is state-dependent and correctly owned by the kernel.
4. No backwards-compat shim: both call sites migrate atomically in this ticket. Foundation #14.

## What to Change

### 1. Investigation I1 — Identify divergence point

Instrument both paths on the failing tuple (seed 1000, NVA player 2, move 140) and walk the decision pipeline to find the first branch where verdicts diverge. Candidate suspects:

- Free-operation zone-filter evaluation — `isZoneFilterMismatchOnFreeOpTemplate` in `prepare-playable-moves.ts:34` shows enumerate/complete asymmetry is already known; confirm whether the same asymmetry exists between enumerate and probe.
- Turn-flow window filters applied post-hoc to enumeration but not to probe (cf. project memory: *legalMoves has a silent post-filter*).
- Action-cost / resource precondition evaluation when `move.params = {}`.

Deliverable: a minimal pure-engine fixture in `packages/engine/test/unit/kernel/viability-predicate.test.ts` that reproduces the disagreement without FITL data.

### 2. Extract shared viability predicate

Introduce a single pure function — either `deriveMoveViabilityVerdict` in `packages/engine/src/kernel/playable-candidate.ts`, or a new `packages/engine/src/kernel/viability-predicate.ts` module. Ticket author chooses the file location based on which keeps the predicate most naturally co-located with its closest consumer.

The predicate's output MUST be a closed enum of verdict codes (VIABLE, or one of a fixed set of non-viable codes — e.g., `ILLEGAL_MOVE`, `ZONE_FILTER_MISMATCH`, `TURN_FLOW_FILTERED`, `PRECONDITION_FAILED`). An exhaustive-switch test asserts the enum is covered.

### 3. Route both call sites through the predicate

- `enumerateLegalMoves` in `packages/engine/src/kernel/legal-moves.ts`: replace its current viability derivation with a call into the shared predicate.
- `probeMoveViability` in `packages/engine/src/kernel/apply-move.ts`: replace its viability derivation with the same call. The function's public signature remains unchanged; only the internal implementation is swapped.
- `classifyPlayableCandidateViability` and `evaluatePlayableMoveCandidate` in `packages/engine/src/kernel/playable-candidate.ts`: no changes if they already consume `probeMoveViability`; confirm behavior is unchanged.

### 4. TDD test first (S4.1)

Before writing the predicate, land a failing test at `packages/engine/test/unit/kernel/viability-predicate.test.ts` that:

- Constructs the minimal synthetic GameDef + state + move triple from I1 that exhibits the disagreement.
- Asserts that `enumerateLegalMoves(...)`'s viability verdict equals `probeMoveViability(...)`'s verdict for the same move (both VIABLE or both the same non-viable code).
- Asserts the verdict enum is exhaustive via a typed switch test.

The test MUST fail on current HEAD before the predicate is extracted, proving the regression; it MUST pass after the extraction.

## Files to Touch

- `packages/engine/src/kernel/playable-candidate.ts` (modify) — host the shared predicate, or re-export from a new module
- `packages/engine/src/kernel/viability-predicate.ts` (new, optional) — alternative home for the predicate
- `packages/engine/src/kernel/legal-moves.ts` (modify) — route through shared predicate
- `packages/engine/src/kernel/apply-move.ts` (modify) — route through shared predicate
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify) — remove the now-redundant zone-filter fallback after probe/enumerate parity is restored
- `packages/engine/test/unit/kernel/viability-predicate.test.ts` (new) — failing test per S4.1
- `packages/engine/test/unit/prepare-playable-moves.test.ts` (modify) — align the existing regression with the new parity contract

## Out of Scope

- Changes to `prepare-playable-moves.ts` retry logic — 132AGESTUVIA-002's scope.
- Changes to the simulator's `agentStuck` catch block — 132AGESTUVIA-004's scope.
- Changes to FITL spec data under `data/games/fire-in-the-lake/*`.
- Removing `'agentStuck'` from the `SimulationStopReason` union — 132AGESTUVIA-004's atomic scope.

## Acceptance Criteria

### Tests That Must Pass

1. New `viability-predicate.test.ts` asserts enumerate and probe agree for the synthetic divergence scenario; fails on pre-fix HEAD, passes after extraction.
2. Exhaustive-switch test covers every verdict enum member.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. For every `(def, state, move, runtime)` tuple, `enumerateLegalMoves(...)`'s viability verdict agrees with `probeMoveViability(...)` — same VIABLE bit, same non-viable code when applicable.
2. The shared predicate is pure: no mutation of `def`, `state`, `runtime`, `move`, or any caller-visible object (Foundation #11).
3. No new game-specific branching introduced under `packages/engine/src/kernel/` (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/viability-predicate.test.ts` — failing first, capturing the enumerate/probe disagreement and the exhaustive-switch coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/viability-predicate.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- 2026-04-16: added `packages/engine/src/kernel/viability-predicate.ts` as the shared verdict layer for move viability, normalized `probeMoveViability(...)` through it, and removed the duplicate enumerate-time deferral branch in `legal-moves.ts`.
- The pure-engine regression test now uses the existing multi-unresolved zone-alias free-operation template fixture shape from the kernel suite and proves that `legalMoves(...)`/`enumerateLegalMoves(...)` parity and direct `probeMoveViability(...)` parity agree on the same deferred template tuple.
- `prepare-playable-moves.ts` no longer carries a downstream zone-filter fallback for this mismatch because the shared predicate keeps the template viable/incomplete at the probe boundary instead.
- Verification run: `pnpm -F @ludoforge/engine build`, `node --test dist/test/unit/kernel/viability-predicate.test.js`, `node --test dist/test/unit/prepare-playable-moves.test.js`, and `pnpm -F @ludoforge/engine test`.
- Generated/artifact fallout checked: `dist` was rebuilt for verification only; no schema artifacts, goldens, or committed generated files changed.
- 2026-04-17 post-ticket review: removed the now-dead `fellThroughFromZoneFilterMismatch` field from `PolicyMovePreparationTrace` in `packages/engine/src/kernel/types-core.ts` and its Zod schema in `packages/engine/src/kernel/schemas-core.ts` because the shared predicate eliminated the last producer.
- 2026-04-17 targeted verification: reran `pnpm -F @ludoforge/engine build`, `node --test dist/test/unit/kernel/viability-predicate.test.js`, and `node --test dist/test/unit/prepare-playable-moves.test.js` after the trace/schema cleanup.
