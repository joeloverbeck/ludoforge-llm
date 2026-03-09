# ENG-214: Harden Free-Op Sequence Probe Candidate Scope

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel free-operation probe candidate derivation in effect/runtime paths
**Deps**: tickets/ENG-213-codify-free-op-probe-semantics-boundary.md, archive/tickets/ENG/ENG-212-fix-sequence-probe-usability-false-negatives.md, packages/engine/src/kernel/effects-turn-flow.ts, packages/engine/src/kernel/free-operation-viability.ts, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts, packages/engine/test/unit/effects-turn-flow.test.ts

## Problem

Current effect-issued sequence probe behavior still depends on top-level `effectPath` heuristics and synthetic fallback candidates. In nested effect structures (or non-event effect contexts), this can miss real earlier sequence grants and allow false-positive later-step emission.

## Assumption Reassessment (2026-03-09)

1. `applyGrantFreeOperation` currently derives sequence probe candidates from top-level prior event effects when `effectPath` matches `^\[(\d+)\]`.
2. When that heuristic cannot recover earlier siblings, candidate synthesis clones prior-step shape from the current grant payload.
3. Mismatch: this fallback can diverge from actual earlier-step definitions (for example stricter zone filters), producing probe behavior that is not equivalent to real execution-time sequence semantics. Correction: derive candidates from execution-scoped prior grant definitions, not inferred clones.

## Architecture Check

1. Explicit execution-scoped candidate sourcing is cleaner and more robust than parsing trace/effect path strings.
2. The change remains game-agnostic runtime logic and does not introduce game-specific branches; `GameSpecDoc` continues to carry game-specific behavior.
3. No compatibility aliases/shims; one canonical probe-candidate contract should be used by both event-issued and effect-issued grant probing.

## What to Change

### 1. Replace heuristic probe-candidate discovery with explicit execution-scope data

Thread/access prior `grantFreeOperation` definitions from the current execution scope (including nested effect containers), so probe candidate derivation reflects actual earlier grants.

### 2. Remove shape-clone fallback that can create semantic drift

Eliminate or strictly constrain synthesized fallback candidates where they can diverge from real prior grant payloads.

### 3. Add nested and non-event regression coverage

Cover sequence viability parity where grants are emitted inside nested effect structures and non-event effect paths.

## Files to Touch

- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify if explicit scope threading is required)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify if explicit scope threading is required)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)

## Out of Scope

- FITL-specific event data rewrites unrelated to sequence probe semantics.
- Visual presentation changes in any `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Later sequence effect grants are suppressed when actual earlier nested-step grants are unusable.
2. Later sequence effect grants are emitted when actual earlier nested-step grants are usable.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Probe-time sequence viability uses real execution-scope prior grant definitions, not inferred approximations.
2. Free-operation probe logic remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts` — add nested-effect sequence grant parity tests for usable/unusable earlier steps.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add integration coverage for nested sequence grant chains and non-event effect contexts.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
