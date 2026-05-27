# 200PLNPRPTRC-002: Phase 2 — Add `rejectedByConstraint` trace field; re-split `probeRoleBoundPostState` into three explicit failure reasons

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-plan-trace.ts` (rejection-record types); `packages/engine/src/agents/plan-role-constraint-eval.ts` (probe return type + rejection emission); `packages/engine/src/agents/plan-proposal.ts` (per-alternative aggregation)
**Deps**: `archive/tickets/200PLNPRPTRC-001.md`

## Problem

When a `locatedIn` / `distinctOriginDestination` / `reachable` / `adjacent` / `postState` role-constraint rejects a candidate, the evaluator at `plan-role-constraint-eval.ts:59–84` silently returns `false` and the candidate is dropped. The trace records no contrastive evidence — debugging "why did this ARVN Transport candidate get rejected?" requires re-running the kernel.

`probeRoleBoundPostState` (declared at `plan-role-constraint-eval.ts:149`, returning `GameState | null`) collapses three distinct failure modes (probe budget exhausted via `maxSteps`, observer scope insufficient, step/role mismatch) into a single `null` return. This ticket re-splits the return into an explicit discriminated union and threads the rejection reason into a new `PolicyPlanTraceAlternative.rejectedByConstraint?` field with the canonical Foundation #20 status shape (Spec 200 §4.3 + §4.4).

## Assumption Reassessment (2026-05-27)

1. `plan-role-constraint-eval.ts` handles 6 constraint kinds at lines 59–84: `notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, `postState`. Verified against HEAD.
2. `evaluateReachable` is at lines 466–476, `evaluateAdjacent` at lines 478–488, `evaluateLocatedIn` at line 444, `evaluateDistinctOriginDestination` at line 455, `evaluatePostState` at lines 96–115 (calling `probeRoleBoundPostState` at line 103). Verified.
3. `probeRoleBoundPostState` is exported and consumed at 3 test call sites across 2 test files: `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts:195` (1 site); `packages/engine/test/unit/agents/plan-role-constraint-runtime.test.ts:376, 396` (2 sites). Verified via grep. Migration scope is bounded.
4. The `probeRoleBoundPostState` body at lines 149–170+ returns `null` in three branches: (a) step lookup fails (line ~158), (b) `materializePostStateProbeMove` returns null (line ~163), (c) `applyMove` exhausts `maxPhaseTransitionsPerMove` or fails (later in the try block). These three branches map to the three explicit reasons named in Spec 200 §4.4: `postStateProbeExhausted` (budget) / `postStatePredicateFailed` (predicate evaluation failed inside the probe) / `postStateObserverInsufficient` (step/role mismatch or hidden state past observer scope).
5. Boundary reset (2026-05-27, user-approved Option 1): the draft's `maxCandidatesPerRole` cap does not exist in live code. `rejectedByConstraint` is bounded by the existing plan-template cap surface (`caps.capClass` as materialized by `capLimitFor(template)` and recorded in trace `capClass`/`capLimit`) rather than introducing a new per-role cap contract.
6. `PolicyPlanTraceAlternative.rejectedByConstraint?` lands on the type already extended by ticket 001 with `decisionSurfaceMatch?`. The same-file collision risk is why this ticket hard-deps on 001 even though the rejection record is logically independent.

## Architecture Check

1. **Foundation #15 (Architectural Completeness)**: The re-split of `probeRoleBoundPostState`'s `null` return root-causes the failure-mode-collapse problem rather than papering over it with a free-form string at the trace surface. The three reasons (`postStateProbeExhausted`, `postStatePredicateFailed`, `postStateObserverInsufficient`) are independently meaningful and tested.
2. **Foundation #10 (Bounded Computation)**: `rejectedByConstraint` inherits the existing plan-template cap surface (`caps.capClass` / `capLimitFor(template)`). The trace records a truncation count when the rejected-candidate list is capped. No new unbounded enumeration surface and no new cap contract.
3. **Foundation #20 (Preview Signal Integrity)**: The rejection records use the canonical Foundation-#20 status vocabulary (`{ kind, reason, ... }`) established by `CompoundAvailability` (Spec 199) and extended by `roleBindingStatuses` (ticket 001).
4. **Foundation #4 (Authoritative State and Observer Views)**: The optional `from`/`to`/`via` fields on `RouteConstraintRejection` render hidden positions as `undefined` (not a leaked zone id) under observer-scope rules.
5. **Foundation #14 (No Backwards Compatibility)**: The `probeRoleBoundPostState` return-type change migrates all 3 test call sites in the same commit. No `null`-returning compatibility wrapper.

## What to Change

### 1. Extend `types-plan-trace.ts` with rejection-record types

Add to `packages/engine/src/kernel/types-plan-trace.ts`:

```ts
export type RouteConstraintRejection =
  | { readonly kind: 'reachable'; readonly reason: 'unreachable'; readonly via?: string; readonly maxHops?: number; readonly from?: string; readonly to?: string }
  | { readonly kind: 'adjacent'; readonly reason: 'nonAdjacent'; readonly from?: string; readonly to?: string };

export type PostStateRejection =
  | { readonly kind: 'postState'; readonly reason: 'postStateProbeExhausted' }
  | { readonly kind: 'postState'; readonly reason: 'postStatePredicateFailed' }
  | { readonly kind: 'postState'; readonly reason: 'postStateObserverInsufficient' };

export type RoleConstraintRejection =
  | RouteConstraintRejection
  | PostStateRejection
  | { readonly kind: 'locatedIn'; readonly reason: 'tokenNotInContainer' }
  | { readonly kind: 'distinctOriginDestination'; readonly reason: 'originEqualsDestination' }
  | { readonly kind: 'notEqual'; readonly reason: 'rolesEqual' };

export interface RoleConstraintRejectionRecord {
  readonly role: string;
  readonly candidateId: string;
  readonly rejection: RoleConstraintRejection;
}
```

Extend `PolicyPlanTraceAlternative` with: `readonly rejectedByConstraint?: readonly RoleConstraintRejectionRecord[]`.

### 2. Re-split `probeRoleBoundPostState` return type

In `packages/engine/src/agents/plan-role-constraint-eval.ts`, change `probeRoleBoundPostState`'s return type from `GameState | null` to:

```ts
export type PostStateProbeResult =
  | { readonly kind: 'ready'; readonly postState: GameState }
  | { readonly kind: 'unavailable'; readonly reason: 'postStateProbeExhausted' | 'postStatePredicateFailed' | 'postStateObserverInsufficient' };

export function probeRoleBoundPostState(
  binding: PlanRoleBinding,
  constraint: PostStateConstraint,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  context: PostStateConstraintContext,
  state: GameState,
): PostStateProbeResult { ... }
```

Map the three `null` branches to the three reasons:
- step lookup failure (`step === undefined || step.role !== constraint.role`) → `postStateObserverInsufficient`
- `materializePostStateProbeMove` returns null → `postStateObserverInsufficient` (the move cannot be materialized for observer-bounded reasons)
- `applyMove` throws or returns failure → `postStateProbeExhausted` (budget exhausted) when the cause is `maxPhaseTransitionsPerMove`; otherwise `postStatePredicateFailed`

Update the caller at `evaluatePostState` (line ~103) to consume the discriminated union: on `{ kind: 'ready' }`, proceed with the existing predicate evaluation; on `{ kind: 'unavailable' }`, return both the boolean `false` AND the reason (so the caller can emit a `PostStateRejection` record).

The internal `evaluatePostState` function (lines 96–115) needs a new output channel to surface the rejection reason — either return a discriminated `EvaluationResult` or accept a mutable rejection-record accumulator. Prefer the discriminated return for purity.

### 3. Emit rejection records at each constraint short-circuit

In `plan-role-constraint-eval.ts:59–84`, where each constraint returns `false` today, also produce a `RoleConstraintRejection` record. The dispatch function (around lines 50–90) should change from:

```ts
function evaluateRoleConstraint(...): boolean { ... }
```

to something like:

```ts
type RoleConstraintResult =
  | { readonly kind: 'pass' }
  | { readonly kind: 'reject'; readonly rejection: RoleConstraintRejection };

function evaluateRoleConstraint(...): RoleConstraintResult { ... }
```

Each `case` emits the appropriate rejection variant. The caller in `plan-proposal.ts` (where `evaluateRoleConstraint` is invoked during `bindPlanRoles`) accumulates rejection records per (role, candidate) pair.

### 4. Aggregate rejection records into per-alternative trace

In `packages/engine/src/agents/plan-proposal.ts`, during the candidate-iteration loop, accumulate rejection records and attach them to the alternative being emitted. Bound the per-alternative list by the current template's `capLimitFor(template)` value and record the truncation count as a separate trace field for cleaner semantics.

### 5. Migrate `probeRoleBoundPostState` test call sites

In the same commit, update 3 test call sites:
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts:195`: change `const postState = probeRoleBoundPostState(...)` (which expected `GameState | null`) to consume the new `PostStateProbeResult` discriminated union. Update assertions: tests checking `postState === null` become `postState.kind === 'unavailable'`; tests checking `postState` truthy become `postState.kind === 'ready'`.
- `packages/engine/test/unit/agents/plan-role-constraint-runtime.test.ts:376, 396`: same migration shape.

### 6. Add FITL convergence witness

New file: `packages/engine/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.ts` (per Spec 200 §8).

The test exercises an ARVN Transport scenario where the origin-control preservation `postState` constraint OR a `reachable` constraint rejects a candidate, then asserts the trace's `rejectedByConstraint` contains the expected `RouteConstraintRejection` / `PostStateRejection` record. Mark with `// @test-class: convergence-witness` and `// @witness: spec-200-rejected-by-constraint-arvn-transport`.

### 7. Add architectural-invariant test for bounded rejection list

New file: `packages/engine/test/architecture/plan-trace-rejected-by-constraint-bounded.test.ts` (per Spec 200 §8).

Asserts: across the FITL conformance fixture set, `rejectedByConstraint.length ≤ trace.capLimit` for every alternative when `trace.capLimit` is present; truncation (when triggered) is recorded. Mark with `// @test-class: architectural-invariant`.

## Files to Touch

- `packages/engine/src/kernel/types-plan-trace.ts` (modify — add rejection types + `rejectedByConstraint?` field)
- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify — return-type re-split + rejection emission at each constraint)
- `packages/engine/src/agents/plan-proposal.ts` (modify — accumulate rejection records into alternatives)
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (modify — `probeRoleBoundPostState` call site)
- `packages/engine/test/unit/agents/plan-role-constraint-runtime.test.ts` (modify — 2 `probeRoleBoundPostState` call sites)
- `packages/engine/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.ts` (new — convergence witness)
- `packages/engine/test/architecture/plan-trace-rejected-by-constraint-bounded.test.ts` (new — architectural invariant)

## Out of Scope

- `fallbackReason` discriminated union promotion on `PolicyPlanMicroturnTrace` (Phase 3, ticket 200PLNPRPTRC-003).
- Cross-game conformance corpus extension (Phase 4, ticket 200PLNPRPTRC-004).
- New constraint kinds beyond the existing 6 (`notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, `postState`).
- Synthetic post-state probing beyond what `probeRoleBoundPostState` currently does — Spec 200 §2 explicitly excludes deeper probing.
- Profile YAML changes — Spec 200 explicitly excludes.

## Acceptance Criteria

### Tests That Must Pass

1. `arvn-transport-rejected-by-reachable.test.ts` (new) — ARVN Transport rejection produces the expected `RouteConstraintRejection` or `PostStateRejection` record in `trace.alternatives[i].rejectedByConstraint`.
2. `plan-trace-rejected-by-constraint-bounded.test.ts` (new) — bounded by the plan-template cap limit recorded in trace; truncation recorded.
3. Migrated `probeRoleBoundPostState` test sites pass with the new discriminated return type.
4. Existing replay-identity tests pass byte-identically (the new fields are additive on `PolicyPlanTraceAlternative`).
5. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine test suite green.

### Invariants

1. `probeRoleBoundPostState` returns the discriminated `PostStateProbeResult` union; the `null` return shape no longer exists in the codebase.
2. Every `RoleConstraintRejectionRecord.rejection` is exactly one of the union variants declared in `types-plan-trace.ts`.
3. `rejectedByConstraint.length ≤ trace.capLimit` for every alternative when `trace.capLimit` is present.
4. `from`/`to`/`via` fields on route rejections render as `undefined` under observer-scoped hidden state (no zone-id leak).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/plan-trace-rejected-by-constraint-bounded.test.ts` (new) — architectural invariant.
2. `packages/engine/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.ts` (new) — convergence witness.
3. `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (modify line 195) — `probeRoleBoundPostState` discriminated-return migration.
4. `packages/engine/test/unit/agents/plan-role-constraint-runtime.test.ts` (modify lines 376, 396) — same migration.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/plan-trace-rejected-by-constraint-bounded.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/plan-role-constraint-runtime.test.js`
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-27)

Completed Phase 2 against the live Foundations-aligned boundary. The original draft reference to `maxCandidatesPerRole` was corrected under user-approved Option 1: `rejectedByConstraint` is capped by the existing plan-template cap surface (`caps.capClass` / `capLimitFor(template)`) and recorded through trace `capClass` / `capLimit`; no new per-role cap contract was introduced.

Implemented:

1. Added `RouteConstraintRejection`, `PostStateRejection`, `RoleConstraintRejection`, and `RoleConstraintRejectionRecord` to `packages/engine/src/kernel/types-plan-trace.ts`, plus schema coverage in `packages/engine/src/kernel/schemas-plan-trace.ts`.
2. Extended `PolicyPlanTraceAlternative` with bounded `rejectedByConstraint?` and `rejectedByConstraintTruncatedCount?`, serialized through `packages/engine/src/agents/plan-trace.ts`.
3. Re-split `probeRoleBoundPostState` into a discriminated `PostStateProbeResult` union with explicit unavailable reasons and migrated all existing test call sites.
4. Added role-constraint evaluation result emission for `notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, and `postState`, while preserving the boolean `constraintsSatisfied` wrapper for existing callers.
5. Aggregated rejection records per plan alternative in `packages/engine/src/agents/plan-proposal.ts`, bounded by `capLimitFor(template)`, with truncation counts when rejected candidates exceed the cap.
6. Extracted fallback role-selection helpers to `packages/engine/src/agents/plan-proposal-role-fallbacks.ts` to keep the actively edited `plan-proposal.ts` below the source-size gate.
7. Added `packages/engine/test/architecture/plan-trace-rejected-by-constraint-bounded.test.ts` as the bounded architectural invariant.
8. Added `packages/engine/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.ts` as the ARVN convergence witness. Marker-discipline correction: the live `policy-profile-quality` lane rejects `// @witness`; the test therefore uses `// @test-class: convergence-witness` plus `// @profile-variant: arvn-baseline`, matching the package's current marker rules.

Generated artifact provenance:

- `packages/engine/schemas/Trace.schema.json` was regenerated by `pnpm -F @ludoforge/engine run schema:artifacts` from the kernel trace schema sources after adding the new trace fields.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` passed after regeneration.

Source-size ledger:

- `packages/engine/src/agents/plan-proposal.ts`: 798 lines after extraction; below the 800-line hard cap.
- `packages/engine/src/agents/plan-proposal-role-fallbacks.ts`: 60 lines, new helper module.
- `packages/engine/src/agents/plan-role-constraint-eval.ts`: 623 lines; below the 800-line hard cap.

Verification:

1. `pnpm -F @ludoforge/engine build` passed.
2. `node --test packages/engine/dist/test/architecture/plan-trace-rejected-by-constraint-bounded.test.js` passed.
3. `node --test packages/engine/dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js` passed.
4. `node --test packages/engine/dist/test/unit/agents/plan-role-constraint-runtime.test.js` passed.
5. `node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js` passed.
6. `pnpm -F @ludoforge/engine run schema:artifacts:check` passed.
7. `pnpm -F @ludoforge/engine test` passed: 180/180 files.
