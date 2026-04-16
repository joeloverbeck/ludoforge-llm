# 132AGESTUVIA-002: Split completionUnsatisfiable into structural vs draw-dead-end (S2 + I2 + S4.2)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `TemplateCompletionResult` variant split, retry-loop extension, rejection type union updates
**Deps**: `specs/132-agent-stuck-viable-template-completion-mismatch.md`

## Problem

`attemptTemplateCompletion` in `packages/engine/src/agents/prepare-playable-moves.ts:349` treats every `completionUnsatisfiable` outcome as a structural failure and breaks the retry loop on the first occurrence, ignoring the `NOT_VIABLE_RETRY_CAP` budget. But `completionUnsatisfiable` is currently emitted from `packages/engine/src/kernel/move-completion.ts` for two very different reasons: (a) the template is genuinely structurally uncompletable (empty options, `min > max`, decision budget exceeded), and (b) a specific random draw landed on a downstream illegal branch or tripped `CHOICE_RUNTIME_VALIDATION_FAILED` — a draw-specific dead end that other random draws might bypass. Conflating the two means one unlucky draw marks the entire move unplayable, which is half of the defect producing the `agentStuck` crash on FITL seed 1000 (the other half is 132AGESTUVIA-001).

## Assumption Reassessment (2026-04-16)

1. `packages/engine/src/kernel/move-completion.ts:146` catches `CHOICE_RUNTIME_VALIDATION_FAILED` and returns `{ kind: 'unsatisfiable' }` — confirmed.
2. `packages/engine/src/kernel/move-completion.ts:159` returns `{ kind: 'unsatisfiable' }` for `result.illegal !== undefined || result.nextDecision !== undefined` after the choice sequence — confirmed.
3. `packages/engine/src/agents/prepare-playable-moves.ts:22` defines `NOT_VIABLE_RETRY_CAP = 7` — confirmed.
4. `packages/engine/src/agents/prepare-playable-moves.ts:349` breaks the retry loop on `completionUnsatisfiable` — confirmed.
5. `PlayableCandidateClassification.rejection` in `playable-candidate.ts:26` enumerates `'completionUnsatisfiable' | 'notViable' | 'notDecisionComplete'` — confirmed. `PolicyMovePreparationTrace.rejection` in `types-core.ts:1568` mirrors this union — confirmed.
6. `14a33c29` reverted changes to `move-completion.ts`, `move-decision-completion.ts`, `move-decision-sequence.ts` because they caused infinite loops on FITL seed 1002 — confirmed. This ticket modifies `move-completion.ts`; the seed-1002 smoke test in §6 guards the regression class.

## Architecture Check

1. Preserving the existing `maxCompletionDecisions` budget cap as the final hard ceiling upholds Foundation #10 (Bounded Computation); no new unbounded retry introduced.
2. Distinguishing the two rejection kinds at the `move-completion.ts` boundary — not in `prepare-playable-moves.ts` — is cleaner because the *reason* a completion failed is known at the point of failure and should not be reconstructed downstream.
3. Pure extension: new variant added to a discriminated union; existing `'unsatisfiable'` variant semantics narrowed. Foundation #14 — no shim; the union grows to capture a distinction that was previously lost.
4. The retry logic remains deterministic given identical RNG state (Foundation #13) and preserves external immutability (Foundation #11).

## What to Change

### 1. Investigation I2 — Characterize the failing draw space

For the seed-1000 NVA march template (reproduced by `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs`), enumerate the first-choice domain (`chooseN{min:1,max:1,options:29}`) exhaustively and quantify how many of the 29 options lead to:

- `completed`
- `stochasticUnresolved`
- `illegal` downstream
- `CHOICE_RUNTIME_VALIDATION_FAILED` thrown
- decision-budget `exceeded`

Commit the distribution as test fixtures or documented comments. This confirms the template is structurally completable (at least one option succeeds) and quantifies the retry budget needed.

### 2. Add the `drawDeadEnd` variant to `TemplateCompletionResult`

In `packages/engine/src/kernel/move-completion.ts`:

- Narrow the existing `{ kind: 'unsatisfiable' }` variant to cover ONLY structural cases. Consider renaming to `{ kind: 'structurallyUnsatisfiable' }` if churn is acceptable; otherwise document the narrowed semantics in a doc-comment above the variant.
- Add a new variant `{ kind: 'drawDeadEnd' }` for the two existing draw-specific failure paths:
  - Line 146: `CHOICE_RUNTIME_VALIDATION_FAILED` catch.
  - Line 159: `result.illegal !== undefined || result.nextDecision !== undefined` post-sequence.
- Budget-exceeded (`exceeded` flag) remains structural.
- Empty-options / `min > max` paths remain structural.

### 3. Propagate the distinction to `PlayableCandidateClassification.rejection`

In `packages/engine/src/kernel/playable-candidate.ts`:

- Extend the rejection union from `'completionUnsatisfiable' | 'notViable' | 'notDecisionComplete'` to `'structurallyUnsatisfiable' | 'drawDeadEnd' | 'notViable' | 'notDecisionComplete'` (or whichever naming matches the move-completion rename).
- Update `classifyCompletedTemplateMove` at `playable-candidate.ts:77` to emit the correct rejection kind based on the new variant.
- Update the Zod schema entry at `packages/engine/src/kernel/schemas-core.ts:1464` to match.
- Update `PolicyMovePreparationTrace.rejection` at `packages/engine/src/kernel/types-core.ts:1568` to match.

### 4. Extend retry in `attemptTemplateCompletion`

In `packages/engine/src/agents/prepare-playable-moves.ts`:

- Change the retry-loop exit condition so `structurallyUnsatisfiable` still breaks immediately (no point retrying), but `drawDeadEnd` participates in the `NOT_VIABLE_RETRY_CAP` budget alongside `notViable`.
- Keep the existing bookkeeping (`templateCompletionUnsatisfiable` counter, etc.) consistent — if counter names change, update every statistics reference in the same ticket.

### 5. TDD test first (S4.2)

Before the code change, land a failing test at `packages/engine/test/unit/kernel/move-completion-retry.test.ts` that:

- Constructs a template with a `chooseN{min:1, max:1}` decision whose domain contains both successful and dead-end options.
- Asserts that at least one RNG seed produces `kind: 'completed'`.
- Asserts that a dead-end seed produces `kind: 'drawDeadEnd'` — not `structurallyUnsatisfiable`.
- Asserts that a genuinely structural failure (e.g., `chooseN{min:3, max:3}` with only 2 options) produces `structurallyUnsatisfiable`.

Fails on current HEAD (no distinct variant); passes after the change.

### 6. Seed-1002 smoke test — 14a33c29 regression guard

Because this ticket modifies `move-completion.ts` — the file that caused FITL seed 1002 to hang in the reverted `40a43ceb` / `14a33c29` episode — add a focused smoke assertion (in `move-completion-retry.test.ts` or a peer test) that runs FITL seed 1002's first 5 moves under a strict wall-clock bound (e.g., 5 seconds). This bounds the risk of reintroducing the infinite-loop class of bug without requiring a full tournament run.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify) — split variant
- `packages/engine/src/kernel/playable-candidate.ts` (modify) — propagate rejection kinds
- `packages/engine/src/kernel/schemas-core.ts` (modify) — Zod schema update
- `packages/engine/src/kernel/types-core.ts` (modify) — `PolicyMovePreparationTrace.rejection` update
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify) — retry-loop extension
- `packages/engine/test/unit/kernel/move-completion-retry.test.ts` (new) — S4.2 + seed-1002 smoke
- `packages/engine/test/unit/kernel/playable-candidate.test.ts` (modify if needed) — update any tests asserting on the old `'completionUnsatisfiable'` rejection kind

## Out of Scope

- Changes to the enumerate/probe shared predicate — 132AGESTUVIA-001's scope.
- Changes to the simulator's `agentStuck` catch block — 132AGESTUVIA-004's scope.
- Changes to FITL spec data.
- Any rename that widens the blast radius outside the files-to-touch list — if the scope grows during implementation, stop and surface via 1-3-1 rule.

## Acceptance Criteria

### Tests That Must Pass

1. New `move-completion-retry.test.ts` passes: structurally-completable templates produce at least one `completed` result across the draw space; dead-end draws emit `drawDeadEnd`; genuine structural failures emit `structurallyUnsatisfiable`.
2. Seed-1002 smoke completes 5 moves within the wall-clock bound.
3. Existing `prepare-playable-moves` and `playable-candidate` tests continue to pass (may require rejection-kind name updates).
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `NOT_VIABLE_RETRY_CAP = 7` remains the hard ceiling; no path can exceed it (Foundation #10).
2. Retry logic is deterministic given identical RNG state (Foundation #13) — same seed produces same retry sequence.
3. `maxCompletionDecisions` budget check in `completeTemplateMove` remains intact (14a33c29 guard).
4. No new game-specific branching in the kernel (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion-retry.test.ts` — failing first; covers S4.2 + seed-1002 smoke.
2. `packages/engine/test/unit/kernel/playable-candidate.test.ts` — update any stale `'completionUnsatisfiable'` assertions to the new rejection kinds.

### Commands

1. `pnpm -F @ludoforge/engine test test/unit/kernel/move-completion-retry.test.ts`
2. `pnpm -F @ludoforge/engine test test/unit/kernel/playable-candidate.test.ts`
3. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Outcome

- Split `TemplateCompletionResult` into `structurallyUnsatisfiable` vs `drawDeadEnd`, with `move-completion.ts` preserving structural classification for empty-domain / min-overflow / guided-invalid paths and using `drawDeadEnd` only for random-draw dead ends.
- Extended `attemptTemplateCompletion(...)` so `drawDeadEnd` participates in the bounded retry budget alongside `notViable`, while structural failures still break immediately.
- Renamed the trace statistics field from `templateCompletionUnsatisfiable` to `templateCompletionStructuralFailures` to keep the shared telemetry contract truthful under Foundations #9 and #14.
- Added `packages/engine/test/unit/kernel/move-completion-retry.test.ts` for the chooseN retry witness plus the seed-1002 smoke guard, and migrated the owned policy diagnostics / schema fixtures / generated `Trace.schema.json` artifact to the new contract.
- Deviation from original plan: the exact historical seed-1000 NVA march draw-space characterization from `What to Change` item 1 was not reconstructed in this ticket. That investigation remainder is split into follow-up `132AGESTUVIA-006` so this ticket stays closed around the delivered kernel/retry/schema contract work.

## Verification

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/move-completion-retry.test.js`
3. `node --test dist/test/unit/kernel/playable-candidate.test.js`
4. `node --test dist/test/unit/prepare-playable-moves.test.js`
5. `node --test dist/test/unit/json-schema.test.js`
6. `pnpm -F @ludoforge/engine test`
