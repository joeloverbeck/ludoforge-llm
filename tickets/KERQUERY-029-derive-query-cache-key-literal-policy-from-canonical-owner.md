# KERQUERY-029: Derive query cache key-literal lint policy from canonical owner

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint-policy robustness for query-runtime-cache key ownership enforcement
**Deps**: archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts

## Problem

`query-runtime-cache-key-literal-ownership-policy.test.ts` currently hardcodes cache key literals (`tokenZoneByTokenId`). When new cache keys are introduced, this guard can silently miss them unless manually updated, weakening architecture enforcement.

## Assumption Reassessment (2026-03-05)

1. Current policy test defines key literals inline rather than deriving them from the canonical owner module.
2. `query-runtime-cache.ts` is the single ownership point for query runtime cache domain contracts.
3. The current approach passes tests but does not reliably scale if additional query cache domains are added.

## Architecture Check

1. Deriving lint-policy literals from canonical owner source is cleaner than maintaining duplicated literal lists in tests because enforcement evolves automatically with the owner.
2. This is engine-internal architecture/lint work only and preserves game-agnostic runtime/kernel boundaries; no GameSpecDoc/GameDef coupling is introduced.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Replace hardcoded key literal list with canonical-source derivation

1. Update key-literal policy test to derive owned literals from `src/kernel/query-runtime-cache.ts` (source parse/regex extraction or AST helper).
2. Keep explicit allowlist limited to canonical owner file for raw literals.

### 2. Keep policy test self-safe without blind spots

1. Preserve avoidance of self-violation in the policy test file.
2. Ensure the policy still fails when a non-canonical file introduces any canonical cache key literal.

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (modify)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify only if helper extraction is needed)

## Out of Scope

- QueryRuntimeCache runtime behavior changes
- Public API shape changes beyond current domain methods
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Key-literal ownership policy derives canonical query cache literals from canonical owner source (no duplicated literal array in test body).
2. Policy fails when canonical cache key literal appears outside `query-runtime-cache.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache literal ownership remains single-source and automatically tracks canonical owner evolution.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` — ensure literal ownership checks are driven from canonical owner source and still catch violations.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
