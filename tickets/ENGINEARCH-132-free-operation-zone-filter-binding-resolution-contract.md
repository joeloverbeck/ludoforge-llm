# ENGINEARCH-132: Free-Operation Zone-Filter Binding Resolution Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — query evaluation + turn-flow free-operation zone-filter policy wiring
**Deps**: archive/tickets/ENGINEARCH-122-free-operation-zone-filter-deferral-generic-binding-classifier.md, archive/tickets/ENGINEARCH-123-free-operation-zone-filter-deferral-path-completeness.md, archive/tickets/ENGINEARCH-124-unify-free-operation-denial-analysis-single-pass.md

## Problem

Free-operation zone-filter probing currently uses heuristic rebinding in query evaluation (infer first missing binding and bind it to candidate zone id). This is not a canonical contract and can fail or behave ambiguously when multiple unresolved bindings are present.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/eval-query.ts` currently retries free-operation zone-filter evaluation by rebinding exactly one unresolved binding name to `zoneId`.
2. This retry logic is local to query evaluation and is not represented as a shared contract used across all free-operation zone-filter probing paths.
3. Existing pending tickets (`ENGINEARCH-123`, `ENGINEARCH-124`) do not define or test a canonical binding-resolution contract for multi-unresolved cases; corrected scope is to introduce one explicit contract and route probing through it.

## Architecture Check

1. A single explicit resolver contract is cleaner and more robust than heuristic per-call retries because behavior remains deterministic as expression complexity grows.
2. This keeps GameDef/simulator generic: binding resolution policy remains engine-level runtime behavior and does not encode game-specific semantics.
3. No backwards-compatibility aliasing/shims: one canonical probing path replaces heuristic fallback behavior.

## What to Change

### 1. Introduce canonical free-operation zone-filter binding resolver

Add a shared helper that resolves candidate-zone probe bindings for free-operation zone filters with explicit behavior:
- canonical `$zone` binding
- deterministic handling for unresolved aliases
- explicit failure/defer classification when bindings cannot be resolved safely

### 2. Replace heuristic retry in query evaluation

Refactor `eval-query` free-operation zone-filter probe path to call the new resolver/helper instead of ad-hoc single-error retry logic.

### 3. Align turn-flow probing and query probing

Ensure `turn-flow-eligibility` and `eval-query` use compatible policy decisions for unresolved binding cases so discovery behavior is branch- and surface-consistent.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify, if helper wiring requires)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify, if resolver classification needs typed context)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add if needed for template probing parity)

## Out of Scope

- New denial-cause taxonomy.
- Game-specific schema/asset changes in GameSpecDoc or visual-config YAML files.

## Acceptance Criteria

### Tests That Must Pass

1. Discovery probing handles unresolved non-`$zone` bindings deterministically without heuristic ambiguity.
2. Multi-unresolved-binding zone-filter probes follow one explicit outcome path (defer or typed failure) across legalChoices/template probing surfaces.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation zone-filter probing behavior is defined by one canonical engine contract, not per-call heuristics.
2. Engine runtime remains game-agnostic; no game-specific identifiers/branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add multi-unresolved binding probe cases and explicit expected outcomes.
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — assert decision-sequence probing follows same contract as legalChoices.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — guard template generation parity when unresolved zone-filter bindings appear.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`
