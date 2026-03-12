# ENGINEARCH-161: Unify Target-Bound Free-Operation Viability and Issuance Contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — free-operation viability probing, grant authorization, legal-move discovery, and GameDef behavior validation
**Deps**: `tickets/README.md`, `archive/tickets/ENG-215-align-sequence-context-linkage-with-runtime-issuance-scopes.md`, `archive/tickets/ENGINEARCH-151-unify-free-operation-overlap-discovery-and-apply-contracts.md`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-grant-bindings.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/validate-gamedef-behavior.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/integration/fitl-events-lam-son-719.test.ts`

## Problem

Target-bound free-operation grants still lack a single canonical viability contract across issuance, discovery, and execution. In practice, `viabilityPolicy: requireUsableAtIssue` is not reliable enough for constrained limited-operation grants with event-selected execution context, so authors are forced to add manual `if` gates in `GameSpecDoc` just to avoid emitting a grant that the engine should be able to assess generically.

## Assumption Reassessment (2026-03-12)

1. `packages/engine/src/kernel/free-operation-viability.ts` already probes grants before issuance, but the current probing path is not robust enough for all target-bound limited-operation cases that depend on selected-space execution context and zone bindings.
2. `packages/engine/src/kernel/legal-moves.ts` reconstructs readiness and grant applicability during discovery, which means any weakness in viability modeling can leak into both issuance-time suppression and legal-move surfacing.
3. Lam Son 719 currently includes explicit author-side gating based on ARVN piece presence in the selected Laos space because the generic runtime cannot yet be trusted to decide whether the constrained ARVN LimOp is actually usable. Corrected scope: move that responsibility into shared game-agnostic grant viability and authorization logic.
4. This is not a FITL schema problem. The missing capability is a kernel-level contract that can evaluate target-bound grants consistently from `GameSpecDoc` data without title-specific condition fragments.

## Architecture Check

1. Viability, authorization, and discovery should consume one shared target-bound grant contract. That is cleaner than allowing issuance-time probes, legal-move discovery, and apply-time authorization to each approximate the rules differently.
2. The engine should understand generic concepts such as selected execution context, bound zones, and constrained action classes; `GameSpecDoc` should only declare those inputs. No game-specific identifiers should leak into kernel logic.
3. No backwards-compatibility fallback should preserve today's need for manual author gating when the grant's usability is already expressible from generic runtime state and grant bindings.

## What to Change

### 1. Define one canonical target-bound viability model

Refactor free-operation probing so the engine can evaluate a grant using the same generic inputs that execution will later use:
- action class
- execution seat / decision seat
- execution context
- bound/probed zones
- sequence readiness
- action domain restrictions

This model should answer both "may this grant be issued?" and "what legal follow-up moves does it authorize?" without divergent bespoke checks.

### 2. Unify issuance-time and discovery/apply-time consumers

Make issuance-time viability checks, legal-move discovery, and apply-time authorization reuse the same target-bound compatibility core so a grant that is considered usable at issue has parity with later surfaced legal moves and execution.

### 3. Tighten validation and denial surfaces

If a target-bound grant shape is underspecified for generic viability, fail it through explicit generic validation/denial contracts rather than silently requiring authors to encode fallback `if` guards around the grant.

### 4. Add parity regressions for selected-space limited operations

Cover cases where viability depends on event-selected context and constrained move zones, especially limited operations that should only be issuable when at least one legal move exists under those bindings.

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-bindings.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify if target-bound viability needs stronger validation)
- `packages/engine/src/kernel/types.ts` (modify if the shared contract needs normalization)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` (modify/add)

## Out of Scope

- FITL-only authoring shortcuts or card-local kernel exceptions
- Visual-config changes or runner presentation behavior
- Reworking card text or historical rules interpretation beyond the generic free-operation contract

## Acceptance Criteria

### Tests That Must Pass

1. A target-bound limited-operation grant with selected execution context is only issued when the generic viability engine can prove at least one legal move under that exact context.
2. `legalMoves`, issuance-time viability, and apply-time authorization remain parity-consistent for the same target-bound grant state.
3. Lam Son 719 no longer needs manual author-side ARVN-presence gating to avoid issuing an unusable Laos-scoped ARVN LimOp.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
6. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
7. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Target-bound free-operation viability is determined by one generic kernel contract shared by issuance, discovery, and execution.
2. Game data expresses constraints declaratively; runtime decides usability generically without card-specific condition branches.
3. No title-specific fallback logic or backwards-compatibility alias paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert target-bound grants only surface legal moves inside the declared execution context and bound zones.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — assert apply-time authorization matches issuance/discovery outcomes for target-bound limited operations.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — add validation coverage for malformed target-bound viability contracts if the shared contract requires stronger static guarantees.
4. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add parity regressions for target-bound effect-issued and metadata-issued grants.
5. `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` — remove reliance on author-side gating and assert generic viability decides whether the Laos-scoped ARVN LimOp is issuable.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
6. `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm run check:ticket-deps`
