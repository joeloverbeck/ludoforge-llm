# KERQUERY-002: Unify Runtime Predicate-Set Resolution and Membership Failure Semantics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared kernel predicate-value resolution, condition/query parity, unit tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/eval-condition.ts`, `packages/engine/src/kernel/query-predicate.ts`, `packages/engine/src/kernel/value-membership.ts`, `packages/engine/test/unit/eval-query.test.ts`, `packages/engine/test/unit/eval-condition.test.ts`, `packages/engine/test/unit/token-filter.test.ts`

## Problem

Runtime-selected predicate-set resolution currently exists in multiple kernel paths. `evalQuery` resolves `binding` / `grantContext` predicate operands in one implementation, while `evalCondition` retains a separate membership-set resolver for condition-level `in`.

That duplication has already drifted: query predicates fail closed on missing `binding` / `grantContext` refs, while condition membership intentionally treats missing `grantContext` as `[]` for optional free-operation gating and does not share the same present-value type contract. The current code also lacks direct negative regression coverage for several runtime-set failure modes, which makes accidental divergence easy to miss.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/eval-query.ts` already contains dedicated runtime predicate-value resolution for `binding` and `grantContext` operands used by token filters and `assetRows` predicates.
2. `packages/engine/src/kernel/eval-condition.ts` still has a separate `evalMembershipSet` helper for condition-level `in`.
3. Current mismatch: missing `grantContext` in `evalCondition` returns `[]`, while the query predicate path throws a deterministic missing-reference eval error. That semantic difference is exercised by integration coverage and should be preserved deliberately, not accidentally.
4. `packages/engine/src/kernel/token-filter.ts` is not the duplication source. It intentionally remains context-free and accepts caller-provided resolution.
5. There is no active ticket covering consolidation of these runtime paths or the missing negative coverage around ref-backed membership failures. `tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md` is about FITL data cleanup, not this shared kernel boundary.

## Architecture Check

1. One shared runtime predicate-value resolver is cleaner and more robust than keeping parallel implementations in condition and query evaluation.
2. The right ownership is a dedicated helper module, not `token-filter.ts` or `query-predicate.ts`, because predicate matching should stay context-free while runtime ref resolution remains an evaluation concern.
3. Consolidating this logic preserves the engine-agnostic boundary: the kernel evaluates generic predicate operands the same way regardless of whether the caller is a condition, token filter, or row predicate.
4. Full parity on missing-`grantContext` semantics is not the right architecture. Action legality and zone-filter conditions can validly use `grantContext` as an optional overlay gate, so the missing-reference policy must be explicit per evaluation surface rather than hardcoded by duplication.
5. No backwards-compatibility layers are needed. The existing canonical predicate surface stays intact while the runtime implementation becomes more coherent and the semantic divergence becomes explicit and tested.

## What to Change

### 1. Extract one shared runtime predicate-value resolver

Move runtime-selected predicate-value resolution for `binding` / `grantContext` operands into a single kernel helper consumed by both query predicate evaluation and condition membership evaluation.

### 2. Preserve `evalCondition`'s optional-overlay semantics explicitly

Keep condition-level `in` treating missing `grantContext` as `[]`, but only through an explicit option on the shared helper. Missing `binding` refs should still fail deterministically, and present `grantContext` values should share the same type contract as query predicates.

### 3. Keep scalar vs scalar-array behavior fail-closed

Preserve strict runtime errors for missing refs, scalar values used where arrays are required, mixed scalar-type arrays, and non-scalar arrays.

### 4. Add explicit negative regression coverage

Cover missing bindings, missing `grantContext` keys on strict query surfaces, condition-level empty-set fallback for absent `grantContext`, scalar `grantContext` values in membership position, mixed-type runtime arrays, and direct caller-provided token-filter resolution failures so the shared helper’s behavior is pinned end to end.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/query-predicate.ts` (leave pure unless a small type export is needed)
- `packages/engine/src/kernel/value-membership.ts` (modify only if shared membership/type helpers should be reused)
- `packages/engine/src/kernel/predicate-value-resolution.ts` (new)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/eval-condition.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify for direct predicate-path negative coverage)

## Out of Scope

- FITL authored macro simplification already covered by `tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md`
- Compiler literal-domain parity work if handled separately
- Visual presentation changes in any `visual-config.yaml`
- Changing the standalone `grantContext` query leaf semantics (`{ query: 'grantContext' }` still returns `[]` when absent)

## Acceptance Criteria

### Tests That Must Pass

1. Condition membership and query/token-filter membership resolve runtime-selected predicate operands through one shared kernel rule.
2. Query/token-filter surfaces fail with deterministic `MISSING_VAR` / `TYPE_MISMATCH` errors for missing or malformed runtime-selected predicate sets.
3. Condition-level `in` preserves its intentional empty-set behavior for missing `grantContext`, while sharing the same present-value type contract as query predicates.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Membership semantics remain centralized and game-agnostic across kernel evaluation surfaces.
2. Runtime predicate-value resolution stays fail-closed for invalid shapes.
3. Missing-`grantContext` fallback is preserved only where the evaluation surface intentionally models optional overlay gating.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — verify negative cases for ref-backed membership sets in query/token-filter and `assetRows` paths.
2. `packages/engine/test/unit/eval-condition.test.ts` — verify condition-level `in` shares the same runtime-set resolution for present values while preserving empty-set behavior for absent `grantContext`.
3. `packages/engine/test/unit/token-filter.test.ts` — verify direct predicate-level callers still fail closed when caller-provided dynamic set resolution returns invalid shapes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `node --test packages/engine/dist/test/unit/eval-condition.test.js`
4. `node --test packages/engine/dist/test/unit/token-filter.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-09
- **What actually changed**:
  - Added `packages/engine/src/kernel/predicate-value-resolution.ts` and moved shared runtime predicate-value resolution for `binding` / `grantContext` refs there.
  - Updated `evalQuery` and `evalCondition` to consume the shared helper instead of maintaining duplicate runtime-resolution logic.
  - Preserved the intentional surface differences explicitly in the helper:
    - query/token-filter/asset-row surfaces keep strict missing-ref behavior,
    - condition-level `in` preserves empty-set fallback for missing `grantContext`,
    - condition-level missing `binding` preserves `MISSING_BINDING` so discovery-time probe deferral still works.
  - Added negative regression coverage for missing runtime-selected sets, malformed runtime-selected sets, and invalid caller-provided token-filter resolution.
- **Deviations from original plan**:
  - Full condition/query parity on missing-`grantContext` behavior was not implemented because integration coverage showed that legality/zone-filter conditions intentionally use absent `grantContext` as optional-overlay gating.
  - Shared helper policy is parameterized by evaluation surface rather than forcing one global missing-ref behavior.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/eval-query.test.js` ✅
  - `node --test packages/engine/dist/test/unit/eval-condition.test.js` ✅
  - `node --test packages/engine/dist/test/unit/token-filter.test.js` ✅
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `node packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
