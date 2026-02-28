# CNLCOMP-001: Lock compiler ordering invariant for scenario-deck synthetic token props

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests (and compiler only if invariant currently implicit)
**Deps**: archive/tickets/FITLSEC2SCEDEC-001.md

## Problem

Token-filter prop validation now depends on the complete declared token prop set. Scenario-deck card token props (`cardId`, `isCoup`) are synthesized by compiler-core. If synthesis order regresses (happens after action/condition lowering), valid specs fail with false unknown-prop diagnostics. The current fix works, but the ordering invariant is only indirectly covered by broad integration suites.

## Assumption Reassessment (2026-02-28)

1. `ensureScenarioDeckCardTokenType(...)` synthesizes/reuses token types exposing `cardId` and `isCoup` — confirmed in `compiler-core.ts`.
2. Compiler now computes token-filter prop set from `tokenTypes` and uses it during lowering — confirmed in `compiler-core.ts` + `compile-conditions.ts`.
3. Full-suite tests catch regressions, but there is no narrow test explicitly asserting this ordering contract.
4. No active ticket in `tickets/*` tracks this explicit regression lock.

## Architecture Check

1. A focused regression test is cleaner than relying on broad FITL failures to infer ordering bugs.
2. Invariant remains game-agnostic: scenario-deck synthesis and token-filter validation are generic compiler contracts.
3. No backward-compatibility behavior is introduced; only contract clarity and safety.

## What to Change

### 1. Add explicit integration test for ordering-dependent token props

Add a compiler integration test that:

1. Defines a minimal spec with scenario deck composition requiring synthetic card token type.
2. Uses token filters against `cardId` and/or `isCoup` in action/query lowering surfaces.
3. Asserts compile succeeds with no unknown token-filter prop diagnostic.

### 2. Document invariant in test naming and assertions

Name the test to explicitly state the invariant: synthetic scenario-deck token props must be available before lowering token filters.

## Files to Touch

- `packages/engine/test/integration/compile-pipeline.test.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify only if current ordering is still implicit/fragile)

## Out of Scope

- Changes to scenario deck runtime behavior
- FITL-specific data updates
- Visual config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Dedicated integration test passes and fails when synthetic card-token prop availability order is broken.
2. No `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN` for valid `cardId`/`isCoup` filters in scenario-deck specs.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Token-filter validation sees the full declared token schema, including synthesized scenario-deck token props.
2. Compiler-core ordering is test-locked and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compile-pipeline.test.ts` — add narrow scenario-deck + token-filter ordering regression case.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
3. `pnpm turbo test && pnpm turbo lint`
