# CNLCOMP-001: Lock compiler ordering invariant for scenario-deck synthetic token props

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests (and compiler only if invariant currently implicit)
**Deps**: archive/tickets/FITLSEC2SCEDEC-001.md

## Problem

Token-filter prop validation now depends on the complete declared token prop set. Scenario-deck card token props (`cardId`, `isCoup`) are synthesized by compiler-core. If synthesis order regresses (for example, happens after action/condition lowering), valid specs fail with false unknown-prop diagnostics. Current behavior is correct in compiler-core, but the ordering invariant is not locked by a focused regression test.

## Assumption Reassessment (2026-03-01)

1. `ensureScenarioDeckCardTokenType(...)` synthesizes/reuses a token type exposing `cardId` and `isCoup` (plus `eventDeckId`) — confirmed in `packages/engine/src/cnl/compiler-core.ts`.
2. Compiler computes token-filter prop vocabulary from the effective `tokenTypes` and threads it into lowering context — confirmed in `packages/engine/src/cnl/compiler-core.ts` + `packages/engine/src/cnl/compile-conditions.ts`.
3. Existing tests provide only indirect coverage for this contract:
   - `packages/engine/test/unit/scenario-deck-composition-materialization.test.ts` confirms synthetic event-card token type materialization.
   - FITL production integrations (for example `packages/engine/test/integration/fitl-pivotal-single-use.test.ts`) compile specs that use `cardId` token filters.
   These do not isolate and explicitly lock the ordering invariant in a small compiler-pipeline regression test.
4. No other active `tickets/CNLCOMP-*` ticket currently tracks this specific explicit regression lock.

## Architecture Check

1. Add a narrow compiler integration test that directly verifies the invariant at compile time.
2. Keep compiler architecture unchanged unless test evidence shows fragility; current ordering is explicit and clean.
3. Preserve engine agnosticism: this is a generic compiler contract test, not FITL-specific behavior.
4. No backward-compatibility aliases: failures should surface directly if ordering breaks.

## Updated Scope

1. Add one focused integration test in compile pipeline coverage that requires scenario-deck synthetic token props to be available for token-filter validation.
2. Assert compile success and absence of `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN` for valid `cardId`/`isCoup` usage.
3. Avoid compiler-core modifications unless the new test exposes an actual ordering bug.

## Files to Touch

- `packages/engine/test/integration/compile-pipeline.test.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify only if regression test reveals ordering bug)

## Out of Scope

- Changes to scenario deck runtime behavior
- FITL-specific data updates
- Visual config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Dedicated integration test passes and would fail if synthetic card-token props become unavailable before token-filter lowering.
2. No `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN` for valid `cardId`/`isCoup` filters in scenario-deck specs.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Token-filter validation sees the full declared token schema, including synthesized scenario-deck token props.
2. Compiler-core ordering remains test-locked and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compile-pipeline.test.ts` — add focused scenario-deck + token-filter ordering regression case.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
3. `pnpm turbo test`
4. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Reassessed and corrected ticket assumptions to reflect current coverage accurately (indirect coverage exists; explicit ordering lock was still missing).
  - Added a focused compile-pipeline integration regression test that compiles a scenario-deck spec using token filters on synthesized props (`cardId`, `isCoup`) and asserts no unknown-prop diagnostics.
  - No compiler-core implementation changes were required; existing architecture/order was already explicit and robust.
- **Deviations From Original Plan**:
  - None in scope intent. The ticket remained test-first and compiler-core remained unchanged because the new regression test passed with current implementation.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
