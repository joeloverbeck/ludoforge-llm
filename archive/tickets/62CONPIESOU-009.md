# 62CONPIESOU-009: Reassess and finalize prioritized integration coverage for card 87 + synthetic fixture

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — existing integration test files only
**Deps**: archive/tickets/62CONPIESOU-004.md, archive/tickets/62CONPIESOU-005.md, tickets/62CONPIESOU-008.md, archive/specs/62b-incremental-choice-protocol.md

## Status Note

This ticket was originally written before the prioritized query, incremental `chooseN`, card 87 YAML rewrite, and most of the integration coverage had landed.

That is no longer true. The engine already owns incremental selection state, card 87 already uses `prioritized`, and both FITL + synthetic integration tests already exist. The remaining work is to correct this ticket to match reality, strengthen any still-missing explicit coverage, and then archive the ticket/specs cleanly.

## Problem

The original ticket assumes the prioritized integration work is still mostly unimplemented. In the current codebase, that assumption is stale.

What still matters is whether the current tests explicitly cover every invariant the spec intended, especially the initial-state legality case where no Available ARVN Troops exist and map Troops must start legal immediately.

## Assumption Reassessment (2026-03-14)

1. FITL production compilation is still the canonical source of truth, but card-event integration tests now usually go through `getFitlEventDef()` / `getFitlProductionFixture()` in `packages/engine/test/helpers/fitl-event-fidelity-helpers.ts`, which is backed by cached `compileProductionSpec()`.
2. The FITL card 87 integration suite already exists in `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`.
3. The synthetic non-FITL prioritized integration suite already exists in `packages/engine/test/integration/prioritized-choose-n.test.ts`.
4. The synthetic fixture is currently authored inline in the test via `buildSyntheticSpec()`, not as a separate fixture file. That is acceptable because the fixture is tiny and purpose-built for one suite.
5. `archive/specs/62b-incremental-choice-protocol.md` is already archived; this ticket should not speak as if 62b is still pending.
6. The current suites already cover incremental add/remove/confirm behavior and AI fast-path validation. The likely remaining gap is an explicit FITL initial-state case for “no Available ARVN Troops -> map Troops legal immediately”.

## Architecture Check

1. The current architecture is already the right long-term shape:
   - `prioritized` is a generic query.
   - tier legality is enforced in kernel choice logic.
   - card 87 remains fully data-authored in FITL YAML.
   - synthetic coverage proves the feature is not FITL-specific.
2. This is preferable to any alternative that would special-case Rule 1.4.1 in engine code or lower the interaction into bespoke staged card logic.
3. No backwards-compatibility shims or alias paths should be introduced. If any test reveals drift, the data/tests should be corrected toward the generic architecture rather than adding compatibility layers.
4. Because the architecture is already sound, this ticket should stay narrowly focused on coverage gaps and archival cleanup, not reopen engine design.

## What to Change

### 1. Strengthen existing FITL card 87 integration coverage

In `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`, keep the existing architecture and add only any missing explicit cases.

**Coverage that already exists**:
- Available same-type ARVN pieces block lower-tier map pieces.
- Incremental add/remove recomputes legality stepwise.
- AI fast-path resolution is kept in sync with interactive legality.

**Coverage to ensure explicitly exists before closing**:
- Card 87 unshaded: with no Available ARVN Troops, map ARVN Troops are legal immediately.
- Card 87 unshaded: Available Police does not block map Troops when Troops are exhausted or absent.

### 2. Keep the synthetic test inline unless a real reuse need appears

`packages/engine/test/integration/prioritized-choose-n.test.ts` already provides the generic, non-FITL proof point with an inline fixture.

Do not extract that fixture into a standalone file unless the fixture starts being shared across multiple suites. A one-off inline spec is currently the cleaner architecture than introducing a single-use file.

### 3. Preserve FITL event-selector conventions where they matter

For tests that assert destination legality or support/opposition effects over broad map predicates, keep using the neutralization pattern from CLAUDE.md. Do not add unrelated state normalization to pure sourcing-legality tests that do not depend on those markers.

## Files to Touch

- `tickets/62CONPIESOU-009.md`
- `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`
- `packages/engine/test/integration/prioritized-choose-n.test.ts` only if reassessment finds a real missing invariant there
- `specs/62-conditional-piece-sourcing.md`

## Out of Scope

- Any engine source file changes unless the tests prove a real defect
- Card 87 YAML changes; the current YAML already uses `prioritized`
- New standalone fixture files that do not improve reuse
- Other FITL cards
- Performance benchmarks
- UI/UX validation

## Acceptance Criteria

### Tests That Must Pass

1. Existing card 87 integration coverage remains green.
2. Card 87 explicitly proves: Available Troops present -> map Troops illegal.
3. Card 87 explicitly proves: no Available Troops -> map Troops legal immediately.
4. Card 87 explicitly proves qualifier independence for Police vs Troops.
5. Existing synthetic prioritized integration coverage remains green and continues proving game-agnostic `qualifierKey` behavior.
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo test`
8. Relevant lint/typecheck commands pass before archival.

### Invariants

1. FITL integration tests continue using production-spec-backed helpers rather than bespoke FITL test fixtures.
2. Synthetic prioritized coverage keeps non-FITL terminology.
3. All tests remain deterministic.
4. Legal choice generation and move application agree on admissibility.
5. No compatibility aliases or alternate rule paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` — existing FITL card 87 suite, potentially strengthened with one explicit initial-state legality test
2. `packages/engine/test/integration/prioritized-choose-n.test.ts` — existing synthetic non-FITL prioritized suite, modified only if reassessment finds a missing invariant

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm -F @ludoforge/engine typecheck`
4. `pnpm turbo test`
5. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-14
- **What actually changed**:
  - Re-cut this ticket to match the implemented architecture and current test layout.
  - Added one explicit FITL integration test in `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` covering the initial-state invariant: when no Available ARVN Troops exist, map ARVN Troops are legal immediately while Available Police still block map Police.
  - Kept the existing inline synthetic prioritized fixture/test architecture because it is already generic, minimal, and sufficient.
- **Deviations from original plan**:
  - Did not create a new FITL test file, a new synthetic test file, or a standalone synthetic fixture file because equivalent suites already existed and the one remaining gap was narrower than the original ticket claimed.
  - Did not touch engine source or card 87 YAML because the current architecture is already the cleaner long-term shape: generic `prioritized` query, kernel-owned tier legality, and data-authored FITL behavior.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/prioritized-choose-n.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
