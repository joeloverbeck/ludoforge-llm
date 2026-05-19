# 182STRSTRPOL-014: Phase 4 — Turn-shape evaluator runtime + bounded chain consumption

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, new `packages/engine/src/agents/turn-shape-eval.ts` (or inline in policy-eval), `packages/engine/src/agents/policy-evaluation-core.ts`
**Deps**: `archive/tickets/182STRSTRPOL-013.md`

## Problem

Spec 182 §6.5 requires turn-shape evaluators to run after inner-preview drives complete and before consideration scoring reads `turnShape.<id>.*` refs. Per-candidate execution is `O(objectives × evaluators × inner-preview-tail-states)` bounded by `TurnShapeBoundsSpec.maxSyntheticDecisions` and Spec 164's cap-class budget. The runtime MUST assert that no new preview drives are triggered (the integrity guarantee of Phase 4 — see Foundation #20 + Foundation #10). Refs exposed per spec §6.3: `turnShape.<id>.objective.<objId>.delta` / `.value`, `turnShape.<id>.minimumImpactSatisfied`, `turnShape.<id>.previewStatus`.

## Assumption Reassessment (2026-05-18)

1. `packages/engine/src/agents/policy-preview-inner-deepening.ts` produces the bounded chain projections; line 261-262 enforces `depthCap` — confirmed during reassessment.
2. Inner-preview substrate runs per-candidate (per the existing architecture); turn-shape evaluators consume the chain's final projected state.
3. The dispatch insertion point for turn-shape evaluators is AFTER inner-preview drives complete and BEFORE consideration scoring (which may read `turnShape.<id>.*` refs).
4. The "no new preview drive triggered" assertion lives in the runtime — the architectural test in ticket 016 verifies it.

## Architecture Check

1. Turn-shape evaluator is a generic runtime construct — no game-specific logic (Foundation #1).
2. Bounded computation: `maxSyntheticDecisions` + cap-class budget enforce termination per Foundation #10.
3. No new preview drives triggered — this is the integrity guarantee that distinguishes turn-shape evaluators from runtime planners (which are out-of-scope per spec §2 Non-Goals).
4. Refs are pure functions of the already-driven inner-preview chain + objectives (Foundation #8).
5. `previewStatus` field follows Foundation #20 — `ready` / `partial` / `unavailable` exposed explicitly; consumers MUST handle non-`ready` via their declared fallback.

## What to Change

### 1. Turn-shape evaluator runtime

Create `packages/engine/src/agents/turn-shape-eval.ts` (or co-locate in `policy-eval.ts`) exposing `evaluateTurnShapeEvaluators(profile, catalog, candidate, innerPreviewResult)`:

```ts
export interface TurnShapeEvaluatorResult {
  readonly evaluatorId: string;
  readonly objectives: ReadonlyArray<{ id: string; value?: number; delta?: number }>;
  readonly minimumImpactSatisfied: boolean;
  readonly previewStatus: 'ready' | 'partial' | 'unavailable';
}

export function evaluateTurnShapeEvaluators(
  profile: CompiledAgentProfile,
  catalog: CompiledPolicyCatalog,
  candidate: PolicyCandidate,
  innerPreview: InnerPreviewResult,
): ReadonlyArray<TurnShapeEvaluatorResult>;
```

For each `evaluatorDef` in `profile.use.turnShapeEvaluators ?? []`:
- Read inner-preview chain's final projected state via `innerPreview`.
- For each `objective` in `evaluatorDef.objectives`: compute `value` or `delta` against the chain's terminal state.
- Evaluate `minimumImpact` predicate against the computed objective values.
- Determine `previewStatus` from the inner-preview chain's status.
- Apply `fallback.onPreviewUnavailable` if status is non-`ready`.

### 2. Dispatch insertion in policy-eval.ts

Insert turn-shape evaluation AFTER inner-preview drives complete and BEFORE consideration scoring's `turnShape.<id>.*` ref reads. Locate the exact site during implementation (likely in the `pickInnerDecision`-adjacent flow per spec §7).

### 3. Ref resolution

Extend `policy-evaluation-core.ts` to handle `turnShape.<id>.*` refs:

| Ref | Resolution |
| --- | --- |
| `turnShape.<id>.objective.<objId>.delta` | from evaluator result |
| `turnShape.<id>.objective.<objId>.value` | from evaluator result |
| `turnShape.<id>.minimumImpactSatisfied` | boolean |
| `turnShape.<id>.previewStatus` | `ready` \| `partial` \| `unavailable` |

### 4. No-new-preview-drive runtime guard

Instrument the inner-preview chain to track whether any new drive fires during turn-shape evaluation. If so, throw a deterministic error (`POLICY_TURNSHAPE_UNREGISTERED_PREVIEW_DRIVE` or analog) — this is the runtime safety net for the compile-time `_REQUIRES_UNREGISTERED_PREVIEW_DRIVE` check (ticket 013). The probe in ticket 016 verifies the guard.

### 5. Tests

- Basic evaluator test: evaluator over a simple objective produces expected `value`/`delta` and `minimumImpactSatisfied`.
- `previewStatus` test: evaluator against an unavailable preview correctly applies `onPreviewUnavailable` fallback.
- Bounded-execution test: `maxSyntheticDecisions` enforced.

## Files to Touch

- `packages/engine/src/agents/turn-shape-eval.ts` (new) OR insert into `policy-eval.ts`
- `packages/engine/src/agents/policy-eval.ts` (modify — dispatch insertion + no-new-preview-drive guard)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `turnShape.<id>.*` ref resolution)
- `packages/engine/test/unit/agents/turn-shape-evaluator-basic.test.ts` (new)
- `packages/engine/test/unit/agents/turn-shape-preview-fallback.test.ts` (new)
- `packages/engine/test/unit/agents/turn-shape-bounded-execution.test.ts` (new)

## Out of Scope

- Trace integration (ticket 015).
- Architectural-invariant probe (ticket 016 — asserts no-new-preview-drive at test level).
- FITL conformance + minimumImpactSatisfied probe (ticket 017).

## Acceptance Criteria

### Tests That Must Pass

1. Basic evaluator test — objective produces expected value/delta + minimumImpactSatisfied.
2. Preview-fallback test — non-`ready` `previewStatus` triggers `onPreviewUnavailable` correctly.
3. Bounded-execution test — `maxSyntheticDecisions` enforced; evaluator does not run past the cap.
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Evaluator does not trigger any new preview drives (runtime-asserted; architectural probe in 016).
2. Bounded computation per Foundation #10 (cap-class + maxSyntheticDecisions).
3. Refs derived purely from the inner-preview chain + objectives (Foundation #8 determinism).
4. No game-specific identifiers in evaluator code (Foundation #1).
5. `previewStatus` non-`ready` cases honored explicitly via `onPreviewUnavailable` (Foundation #20).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/turn-shape-evaluator-basic.test.ts`
2. `packages/engine/test/unit/agents/turn-shape-preview-fallback.test.ts`
3. `packages/engine/test/unit/agents/turn-shape-bounded-execution.test.ts`

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/turn-shape-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
