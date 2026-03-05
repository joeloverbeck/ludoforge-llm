# KERQUERY-029: Derive query cache key-literal lint policy from canonical owner

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint-policy robustness for query-runtime-cache key ownership enforcement
**Deps**: archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts

## Problem

`query-runtime-cache-key-literal-ownership-policy.test.ts` currently hardcodes cache key literals (`tokenZoneByTokenId`). In the current architecture, canonical ownership is expressed as domain accessors on `QueryRuntimeCache` (for example `getTokenZoneByTokenIdIndex` / `setTokenZoneByTokenIdIndex`) rather than exported key-literal constants. Hardcoded test literals can silently drift from canonical accessor ownership and weaken architecture enforcement.

## Assumption Reassessment (2026-03-05)

1. Current policy test defines key literals inline rather than deriving them from canonical owner contracts in `query-runtime-cache.ts`.
2. `query-runtime-cache.ts` currently expresses canonical ownership via domain accessor signatures (`get*Index` / `set*Index`), not via exported raw key-literal constants.
3. The current approach passes tests but can silently drift if query cache domains are added/renamed and the hardcoded test literal list is not updated.

## Architecture Check

1. Deriving lint-policy literals from canonical accessor contracts is cleaner than maintaining duplicated literal lists in tests because enforcement evolves automatically with the canonical owner API.
2. This is engine-internal architecture/lint work only and preserves game-agnostic runtime/kernel boundaries; no GameSpecDoc/GameDef coupling is introduced.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Replace hardcoded key literal list with canonical-contract derivation

1. Update key-literal policy test to derive owned literals from `src/kernel/query-runtime-cache.ts` accessor signatures (`get*Index` / `set*Index`) via source parse/regex extraction or AST helper.
2. Keep explicit allowlist limited to canonical owner file for raw literals.

### 2. Keep policy test self-safe without blind spots

1. Preserve avoidance of self-violation in the policy test file.
2. Ensure the policy still fails when a non-canonical file introduces any canonical cache key literal.
3. Add a guard that fails when canonical accessor-derived literals become empty due to parsing drift.

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (modify)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify only if helper extraction is needed)

## Out of Scope

- QueryRuntimeCache runtime behavior changes
- Public API shape changes beyond current domain methods
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Key-literal ownership policy derives canonical query cache literals from canonical owner accessor contracts (no duplicated literal array in test body).
2. Policy fails when canonical cache key literal appears outside `query-runtime-cache.ts`.
3. Policy fails fast if canonical accessor derivation returns no literals.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache literal ownership remains single-source and automatically tracks canonical owner evolution.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` — derive literal ownership checks from canonical accessor contracts and retain violation detection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Updated `query-runtime-cache-key-literal-ownership-policy.test.ts` to derive forbidden raw key literals from canonical `QueryRuntimeCache` accessor signatures (`get*Index` / `set*Index`) instead of a hardcoded literal list.
  - Added paired-accessor parity enforcement in derivation logic (getter-only/setter-only domains fail).
  - Added a focused derivation test using synthetic accessor signatures to lock expected extraction behavior.
  - Added a fail-fast guard when no literals can be derived from canonical owner source.
- **Deviations From Original Plan**:
  - Corrected stale assumptions before implementation: canonical owner does not expose raw key constants; ownership is accessor-signature-based.
  - Kept implementation confined to the lint policy test file; no helper or runtime file changes were required.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
