# 62BINCCHOPRO-008: Integration coverage for card 87 prioritized `chooseN`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Tests only unless a newly exposed bug requires a minimal kernel fix
**Deps**: archive/tickets/62BINCCHOPRO-004.md, archive/tickets/62BINCCHOPRO-003.md, archive/tickets/62BINCCHOPRO-002.md

## Problem

The core architecture for prioritized `chooseN` is already in place:

- card 87 (`Nguyen Chanh Thi`) is already authored with a generic `prioritized` query
- initial prioritized legality is already enforced
- `advanceChooseN` already exists and recomputes legality step by step

What is still missing is integration coverage that proves those pieces work together end to end in both:

1. the real FITL card-87 pipeline, and
2. a synthetic non-FITL game spec that demonstrates the behavior is engine-generic.

## Assumption Reassessment (2026-03-14)

1. Card 87 is in `data/games/fire-in-the-lake/41-events/065-096.md`, and its unshaded effect already uses `query: prioritized` with `qualifierKey: type`. The original ticket assumption that card 87 still needed re-authoring was incorrect.
2. FITL production integration tests do use `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed.
3. A dedicated integration file already exists at `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`. It already verifies compile-time authoring shape, initial prioritized legality, and card behavior after full decision resolution.
4. `advanceChooseN` already exists in `packages/engine/src/kernel/advance-choose-n.ts`, exported through the kernel public API, with focused unit coverage in `packages/engine/test/unit/kernel/advance-choose-n.test.ts`. The original ticket phrasing assumed this protocol was still missing.
5. The shared prioritized tier helper already exists and is already wired into initial legality and final-array validation through tickets 002-004. This ticket should not reopen kernel architecture that is already in place unless integration testing exposes a real defect.
6. The missing gap is specifically integration-level proof that:
   - the real FITL card 87 `chooseN` request can be driven incrementally with `advanceChooseN`, and
   - the same semantics compile and execute in a non-FITL synthetic game spec with a different qualifier key.
7. The spec references in the previous ticket draft were wrong. The correct source specs are:
   - `specs/62-conditional-piece-sourcing.md`
   - `specs/62b-incremental-choice-protocol.md`

## Architecture Check

1. The current architecture is directionally correct and better than the older staged/aliased alternatives:
   - prioritized sourcing is authored declaratively in YAML/Game Spec,
   - `evalQuery` stays pure,
   - tier admissibility is kernel-owned and generic,
   - incremental selection lives in `advanceChooseN` rather than UI-local heuristics.
2. That architecture is more robust and extensible than introducing FITL-specific branches, compatibility aliases, or staged pseudo-choices. This ticket should preserve that shape.
3. Because the underlying architecture already exists, the cleanest work here is to strengthen integration coverage first and only change engine code if those tests expose a genuine mismatch between:
   - discovery-time legality,
   - `advanceChooseN` stepwise legality, and
   - final submitted-array validation.
4. The generic non-FITL test should compile a minimal synthetic Game Spec directly through the normal parse/validate/compile pipeline. The goal is to prove engine-agnostic behavior, not to add another game-specific fixture dependency unless the test becomes materially clearer by doing so.

## What to Change

### 1. Correct and strengthen FITL card-87 integration coverage

Extend `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` so it covers incremental `advanceChooseN` behavior on the real compiled card-87 action:

- **Test A**: Available ARVN Troops keep map ARVN Troops illegal until the available same-type Troops are selected
- **Test B**: Exhausting Available Troops unlocks map Troops of the same type
- **Test C**: Qualifier values remain independent, so selecting/exhausting Troops does not change the tier preference for Police
- **Test D**: Removing a previously selected higher-tier piece re-locks the lower-tier same-type option if the higher-tier same-type piece becomes available again
- **Test E**: AI fast-path remains valid for card 87 via `resolveMoveDecisionSequence`/resolved full-array submission

These tests should exercise the real FITL production spec and the public `advanceChooseN` API instead of duplicating lower-level kernel unit scaffolding.

### 2. Add one generic non-FITL integration test

Add a new integration test file for a synthetic Game Spec compiled through the standard parser/compiler pipeline. The synthetic spec should:

- use `query: prioritized`
- use a non-FITL qualifier key such as `color`
- use different tier sources such as `shelf` and `warehouse`
- drive the request incrementally with `advanceChooseN`
- verify add, remove, and confirm behavior end to end

This test exists to prove the architecture is generic and that no FITL-specific assumptions leaked into the kernel.

### 3. Only fix engine code if tests reveal a real integration bug

Do not pre-emptively refactor kernel code in this ticket.

If the new integration tests expose a mismatch, fix the smallest architectural seam that is actually wrong and keep the ticket outcome explicit about what was repaired.

## Files to Touch

- `tickets/62BINCCHOPRO-008.md` (modify — corrected assumptions and narrowed scope)
- `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` (modify — real card-87 incremental integration coverage)
- `packages/engine/test/integration/prioritized-choose-n.test.ts` (new — generic non-FITL integration coverage)
- engine source files only if the new integration tests expose a genuine defect

## Out of Scope

- Re-authoring card 87 data; it is already authored with `prioritized`
- Re-implementing `advanceChooseN`
- Reworking `computeTierAdmissibility`
- Runner/store/UI changes
- FITL-specific kernel branches or aliases
- New backwards-compatibility shims
- Other FITL cards
- Performance work unless directly required to fix a failing invariant exposed by the new tests

## Acceptance Criteria

### Tests That Must Pass

1. Card 87 still compiles successfully from the FITL production spec
2. FITL integration coverage proves stepwise legality transitions through `advanceChooseN` on the real card-87 request
3. FITL integration coverage proves qualifier independence for card 87
4. FITL integration coverage proves removal can re-lock a lower-tier same-type option when appropriate
5. Generic non-FITL integration coverage proves the same stepwise tier rules with a non-FITL qualifier key
6. Generic non-FITL integration coverage proves add/remove/confirm flow through `advanceChooseN`
7. AI fast-path full-array submission still works for card 87
8. `pnpm turbo build` succeeds
9. `pnpm turbo lint` succeeds
10. `pnpm -F @ludoforge/engine test` passes
11. `pnpm -F @ludoforge/engine test:e2e` passes

### Invariants

1. No FITL-specific identifiers are introduced into shared kernel logic
2. No aliases or compatibility shims are introduced
3. Discovery-time legality, incremental `advanceChooseN` legality, and final-array validation agree in all covered scenarios
4. The generic test proves prioritized behavior with a non-FITL qualifier key and non-FITL zone names
5. If engine code changes are required, they remain minimal and architecture-improving rather than additive workaround logic

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` — extend real card-87 coverage to incremental `advanceChooseN` legality transitions
2. `packages/engine/test/integration/prioritized-choose-n.test.ts` — add generic parse/compile/runtime integration coverage for prioritized `chooseN`

### Commands

1. `pnpm turbo build`
2. `pnpm turbo lint`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- Outcome amended: 2026-03-14
- Completion date: 2026-03-14
- What actually changed:
  - Strengthened [`packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts) with real card-87 integration coverage for stepwise `advanceChooseN` legality, qualifier independence, re-locking after removal, and AI fast-path parity.
  - Added [`packages/engine/test/integration/prioritized-choose-n.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/prioritized-choose-n.test.ts) as a synthetic non-FITL integration test that compiles inline Game Spec markdown and verifies generic prioritized `chooseN` add/remove/confirm behavior.
  - Did not change engine source or FITL authored data because the current architecture and card-87 authoring were already correct; the real gap was missing integration coverage.
- Deviations from original plan:
  - The ticket's original assumption that card 87 still needed re-authoring was wrong, so no data-file edit was made.
  - The generic regression was implemented as an inline-spec integration test rather than a separate fixture file, because the synthetic spec has no reuse value and is clearer when kept next to its assertions.
- Verification results:
  - `pnpm turbo build`
  - `pnpm turbo lint`
  - `node --test packages/engine/dist/test/integration/fitl-events-nguyen-chanh-thi.test.js packages/engine/dist/test/integration/prioritized-choose-n.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
