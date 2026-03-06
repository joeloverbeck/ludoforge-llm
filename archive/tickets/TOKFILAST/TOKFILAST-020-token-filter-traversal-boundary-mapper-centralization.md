# TOKFILAST-020: Centralize Token-Filter Traversal Error Boundary Mapping and Remove Eval-Layer Coupling from Effects

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel boundary contract and effects/runtime mapping cleanup
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md

## Problem

Token-filter traversal errors are now utility-local, but boundary mapping to eval-style runtime errors is duplicated across multiple call sites. `effects-reveal.ts` currently imports `typeMismatchError` directly from eval-error, introducing avoidable cross-layer coupling and duplicated mapping logic.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/src/kernel/token-filter.ts` maps `TOKEN_FILTER_TRAVERSAL_ERROR` to `TYPE_MISMATCH` inline in `matchesTokenFilterExpr`.
2. `packages/engine/src/kernel/effects-reveal.ts` repeats the same mapping in `canonicalTokenFilterKeyForRuntime` and imports `typeMismatchError` directly from `eval-error.ts`.
3. `packages/engine/src/kernel/validate-gamedef-behavior.ts` also consumes token-filter traversal errors, but maps them to validator diagnostics (`DOMAIN_QUERY_INVALID`), not eval runtime errors; it is a separate boundary and should stay separate.
4. Archived `TOKFILAST-015..019` hardened boolean/predicate/traversal contracts, but did not centralize eval-boundary traversal-error mapping for runtime/effects callsites.
5. Mismatch: eval-boundary translation logic is duplicated across runtime/effects surfaces, leaving room for drift in message/context shaping.

## Architecture Check

1. A single eval-boundary mapper for token-filter traversal failures is cleaner and more robust than per-callsite duplication.
2. Centralizing this mapper preserves game-agnostic kernel behavior and removes direct effect-layer coupling to eval error constructors.
3. Validator-boundary mapping must remain independent because it targets diagnostics contracts, not runtime eval errors.
4. No backwards-compatibility aliases/shims are introduced; malformed token-filter input still fails closed with deterministic runtime contracts.

## What to Change

### 1. Introduce a shared token-filter traversal eval-boundary mapper

Create a dedicated helper in kernel that translates utility-local token-filter traversal errors into deterministic runtime eval contracts (`TYPE_MISMATCH`) for runtime/effects consumers.

### 2. Replace duplicated runtime/effects callsite mapping

Adopt the shared mapper in both token-filter runtime and reveal/conceal effect surfaces, removing local catch-and-remap duplication.

### 3. Remove direct eval-error constructor import from effects-reveal

Ensure `effects-reveal.ts` no longer imports `typeMismatchError` directly; it should depend only on the shared boundary helper.

## Files to Touch

- `packages/engine/src/kernel/token-filter-runtime-boundary.ts` (new)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify, if context assertions need adjustment)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify, if assertions need adjustment)
- `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` (new)

## Out of Scope

- Predicate operator allow-list hardening (`archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md`).
- Predicate node-shape and fold path strictness (`archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md`).
- Broad error-system redesign outside token-filter traversal boundaries.

## Acceptance Criteria

### Tests That Must Pass

1. Token-filter traversal boundary mapping behavior is produced by one shared helper and remains deterministic.
2. `effects-reveal` no longer imports eval-layer error constructors directly.
3. Validator mapping in `validate-gamedef-behavior.ts` remains unchanged (diagnostic boundary is intentionally separate).
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Shared traversal utilities remain decoupled from eval-layer constructors.
2. Runtime/effect surfaces preserve deterministic fail-closed behavior for malformed token-filter expressions.
3. Validator surfaces continue to emit deterministic diagnostics and are not coupled to runtime eval-boundary helper behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — keep deterministic boundary mapping assertions after shared-helper adoption.
2. `packages/engine/test/unit/effects-reveal.test.ts` — verify malformed token-filter failures still surface deterministic runtime errors on reveal/conceal surfaces.
3. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — verify traversal errors map to `TYPE_MISMATCH` and non-traversal errors are rethrown unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Added shared runtime boundary helper `packages/engine/src/kernel/token-filter-runtime-boundary.ts` to map traversal utility errors to deterministic `TYPE_MISMATCH`.
  - Updated `packages/engine/src/kernel/token-filter.ts` and `packages/engine/src/kernel/effects-reveal.ts` to use the shared helper, removing duplicated inline mapping logic.
  - Removed direct eval constructor coupling from `effects-reveal.ts` (`typeMismatchError` import removed there).
  - Added `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` for direct mapping/rethrow behavior coverage.
  - Strengthened malformed reveal/conceal filter tests in `packages/engine/test/unit/effects-reveal.test.ts` to assert deterministic context path/reason, not just error code.
- Deviations from original plan:
  - Added a dedicated boundary-helper unit test file to lock centralization behavior explicitly.
  - Existing `token-filter.test.ts` assertions already covered runtime boundary determinism sufficiently, so no additional edits were required there.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (269/269).
  - `pnpm -F @ludoforge/engine lint` passed.
