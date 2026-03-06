# TOKFILAST-042: Separate Structural Normalization from Boundary Message Policy in Token-Filter Mapping

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime/validator token-filter boundary mapping policy
**Deps**: archive/tickets/TOKFILAST-038-token-filter-dual-traversal-modes-and-boundary-mapper-unification.md, tickets/TOKFILAST-041-token-filter-traversal-reason-exhaustiveness-guard.md

## Problem

Current boundary mapping unification also centralizes message text production inside low-level normalization helpers. This couples structural normalization to boundary-facing phrasing and weakens policy clarity about which layer owns runtime throw text vs validator diagnostic text.

## Assumption Reassessment (2026-03-07)

1. Shared normalization currently returns both structural mapping (`entryPathSuffix`, `errorFieldSuffix`) and boundary-facing strings (`message`, `suggestion`).
2. Runtime boundary currently throws with normalized message text instead of preserving traversal error message source at boundary handoff.
3. Existing tests cover current behavior but do not enforce explicit layering policy between structural mapping and boundary text ownership.

## Architecture Check

1. Splitting structural normalization from boundary text formatting is cleaner and more extensible than a single mixed helper.
2. Boundary-specific output contracts remain explicit: runtime (`TYPE_MISMATCH`) and validator (`DOMAIN_QUERY_INVALID`) can share structure while owning their own presentation policy.
3. This remains game-agnostic kernel architecture work; no game-specific logic leaks into simulation/runtime.
4. No backwards-compatibility aliases/shims.

## What to Change

### 1. Split normalization responsibilities

Refactor token-filter normalization so shared core returns only structural metadata (`reason`, `op`, path suffix, field suffix). Keep boundary-facing message/suggestion composition in boundary mappers.

### 2. Enforce runtime message-source policy

Runtime mapper should preserve traversal error message source at handoff while using shared structural normalization for context shaping.

### 3. Add boundary-layer policy tests

Add/adjust tests that lock:
- structural normalization output parity
- runtime message-source behavior
- validator suggestion/message behavior

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter-runtime-boundary.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Introducing new traversal operators or error reasons.
- CNL predicate shape/alias tickets (`TOKFILAST-039`, `TOKFILAST-040`).
- Any `GameSpecDoc`/`visual-config.yaml` game-content change.

## Acceptance Criteria

### Tests That Must Pass

1. Shared normalization provides deterministic structural mapping only.
2. Runtime boundary preserves traversal message source while still mapping context deterministically.
3. Validator boundary keeps deterministic diagnostic message/suggestion/path outputs.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. `GameDef` and simulation/runtime remain game-agnostic.
2. Boundary contracts remain deterministic and free of alias/back-compat behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — assert runtime message-source preservation and structural mapping parity.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert validator path/suggestion/message determinism after layering split.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
