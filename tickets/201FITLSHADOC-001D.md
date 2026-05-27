# 201FITLSHADOC-001D: Schedule-distance refs in state features

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic agent policy compiler/runtime scope support
**Deps**: `archive/tickets/201FITLSHADOC-001C.md`

## Problem

Spec 201 ticket 002 needs a `distanceToCoup` state feature backed by `schedule.distance.toBoundary.coupEntry.cards`. Live compiler validation rejects schedule-distance refs inside state features today; the existing tests intentionally classify schedule refs outside move/microturn policy scopes as unknown.

Deferring `distanceToCoup` would leave the shared coup-awareness doctrine without its foundational feature, and moving the expression into downstream modules would make the lifecycle concept less reusable. This prerequisite makes schedule-distance refs available to generic state features while preserving explicit unavailable fallback semantics.

## Assumption Reassessment (2026-05-27)

1. `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts` currently rejects `schedule.distance.toBoundary.coupEntry.cards` in a state-feature ref context.
2. `packages/engine/src/cnl/compile-agents.ts` already parses and validates schedule-distance refs for allowed policy scopes, and records explicit fallback requirements for schedule reads in considerations.
3. `packages/engine/src/agents/policy-evaluation-core.ts` already evaluates compiled schedule-distance refs at runtime; the gap is static scope/feature support rather than a FITL-specific runtime rule.
4. Spec 201's `distanceToCoup` shape uses `coalesce` with `999`, but the compiler still needs to accept the schedule ref in a state-feature expression before ticket 002 can author it.

## Architecture Check

1. Foundation #2: coup-distance semantics remain declarative GameSpecDoc YAML.
2. Foundation #12: the compiler owns the static scope and ref-shape validation instead of downstream YAML relying on an unsupported ref.
3. Foundation #15: this fixes the generic lifecycle-feature gap exposed by Spec 201 rather than relocating the expression ad hoc into every consumer.
4. Foundation #1: the implementation is generic schedule-distance support; no FITL phase, boundary, or card ids are hardcoded in engine code.
5. Foundation #20-style explicitness is preserved for unavailable signals: authored state features must use an explicit expression fallback such as `coalesce` when the schedule distance may be unavailable.

## What to Change

### 1. Permit schedule-distance refs in state features

Update the generic agent policy compiler so state-feature expressions can lower valid `schedule.distance.toBoundary.<id>.<unit>` refs through the existing compiled schedule-distance ref shape.

### 2. Preserve static validation

Malformed schedule-distance refs, unknown boundaries/phases, and unsupported units must still fail with existing diagnostics. The change only expands the allowed owner scope for valid refs.

### 3. Prove runtime evaluation

Add focused coverage showing a state feature can compile and evaluate a schedule-distance ref, and that an unknown schedule ref still fails compilation.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — scope allowance for state-feature schedule refs)
- Focused tests under `packages/engine/test/unit/cnl/` and/or `packages/engine/test/unit/agents/` (modify/new)

## Out of Scope

- Authoring `distanceToCoup` in FITL YAML (owned by ticket 002 after this prerequisite lands).
- New schedule-distance units or schedule-boundary semantics.
- FITL-specific engine branches.
- Changing consideration-level schedule fallback requirements unless required by the state-feature support.

## Acceptance Criteria

### Tests That Must Pass

1. A state feature with `expr: { ref: schedule.distance.toBoundary.coupEntry.cards }` compiles when the boundary exists.
2. A state feature using that ref evaluates to the expected numeric distance in a focused runtime fixture.
3. Unknown or malformed schedule-distance refs in state features still fail compilation.
4. `pnpm -F @ludoforge/engine build` passes.

### Invariants

1. No game-specific schedule boundary ids are hardcoded in engine code.
2. Existing move/microturn schedule-distance behavior is unchanged.
3. Existing invalid schedule-distance diagnostics remain discriminating.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts` — update the state-feature schedule-ref assertion from rejection to accepted lowering for valid refs, while preserving unknown-ref rejection.
2. Add or extend a runtime schedule-distance/state-feature test to assert evaluation returns a numeric value.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled node tests for the changed schedule-distance unit files.
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm run check:ticket-deps`
