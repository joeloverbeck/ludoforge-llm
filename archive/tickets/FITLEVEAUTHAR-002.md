# FITLEVEAUTHAR-002: Add narrowly-scoped replacement/routing macros to FITL macros file

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — FITL game data only
**Deps**: FITLEVEAUTHAR-001

## Problem

Complex event cards like CIDG (#81) still open-code some replacement and routing sequences that are mechanically shared even though the engine already has the generic primitives needed. The value in this ticket is not "make selectors more abstract" in the general case; it is to extract only the parts that are genuinely repeated FITL-local mechanics:

- route a removed piece to its rule-correct force pool
- place a selected Available piece into a captured source zone
- apply post-placement underground posture only when the replacement type requires it

That reduces duplication without creating a second generic query/filter DSL inside FITL YAML.

## Assumption Reassessment (2026-03-13)

1. `data/games/fire-in-the-lake/20-macros.md` currently has 73 macros and 3,828 lines — corrected.
2. The cookbook now exists at `docs/fitl-event-authoring-cookbook.md` and explicitly documents that some replacement/routing patterns are still open-coded in production cards until the dedicated macro tickets land — confirmed.
3. No existing FITL effect macro currently owns the shared "route removed piece to its force pool" or "place selected replacement, then conditionally set underground posture" patterns — confirmed by scanning current macro IDs and definitions.
4. `packages/engine/test/integration/fitl-events-cidg.test.ts` already covers the key behavioral invariants these macros are meant to support in follow-up card rewrites: exact text, mixed-pool replacement choice, routing destination, posture assignment, depletion fallback, and legal no-op — confirmed.
5. Macros must stay FITL-local per Agnostic Engine Rule — confirmed.

## Architecture Check

1. FITL-local effect macros in `data/games/fire-in-the-lake/20-macros.md` remain the correct boundary; no engine/compiler/kernel changes are warranted.
2. Broad selector abstractions are not beneficial here. A macro like "select spaces by terrain and occupant" would mostly duplicate the existing query/filter language and make event YAML less transparent.
3. Narrow, composable macros for routing and post-placement behavior are beneficial because they remove repeated imperative sequences while preserving explicit card-specific legality and selection logic in the card.
4. No backwards-compatibility aliases — add only the canonical macro contracts that follow-on card rewrites should use.

## What to Change

### 1. Add only the narrow replacement/routing macros that improve authoring

Add FITL-local effect macros to `data/games/fire-in-the-lake/20-macros.md` for the recurring mechanics that are already proven in CIDG and similar cards:

- **Routing macro**: route a removed piece token to its rule-correct force pool based on faction and, where needed, piece type.
- **Placement macro**: move a selected Available piece into a supplied destination zone.
- **Placement + posture macro**: place a selected Available piece into a supplied destination zone, then set `activity: underground` only when the placed piece type is in a supplied allow-list.

These macros must:

- accept parameterized token/zone/type-list inputs
- keep card-specific target selection, counts, and legality checks outside the macro
- be documented with concise YAML comment blocks
- compile cleanly in the production FITL spec

### 2. Add direct macro-contract coverage

Add a focused FITL integration test that verifies the new macro definitions and their intended contracts in the parsed production spec:

- macro IDs exist
- parameter surfaces are explicit and minimal
- routing macro encodes the expected destination boxes
- placement/posture macro delegates to the placement macro and applies underground posture conditionally

This ticket should not rely only on "the whole production spec still compiles." The new macro surface is a production contract and should be asserted directly.

### 3. Verify compilation

After adding macros, the full FITL spec must still compile cleanly via `compileProductionSpec()`.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `packages/engine/test/integration/fitl-event-replacement-routing-macros.test.ts` (new)

## Out of Scope

- Modifying any engine source code (compiler, kernel, agents, sim).
- Changing existing event card files to use the new macros — that remains FITLEVEAUTHAR-004 (CIDG exemplar rewrite) and FITLEVEAUTHAR-007 (remaining audit + migration backlog).
- Adding macros to engine-level or cross-game locations.
- Adding generic selector/query macros that merely wrap existing terrain/country/occupant filter syntax.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-event-replacement-routing-macros.test.ts` verifies the new macro contracts directly.
2. `compileProductionSpec()` succeeds with no errors (existing helper in `packages/engine/test/helpers/production-spec-helpers.ts`).
3. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green (no regressions).
4. Existing suite: `pnpm -F @ludoforge/engine test:e2e` — must remain green.
5. `pnpm turbo lint` — must remain green.

### Invariants

1. No engine source files are modified.
2. All new macros are syntactically valid YAML and compile without diagnostics.
3. Existing event cards continue to compile and execute identically because this ticket does not rewrite any cards yet.
4. New macros follow existing naming conventions in `20-macros.md` (kebab-case, `fitl-` prefix for FITL-specific helpers).
5. No new selector macro duplicates the existing map-space query/filter surface.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-replacement-routing-macros.test.ts` (new) — asserts the new macro definitions, params, routing destinations, and conditional underground posture contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test` (confirms compilation + all event card tests still pass)
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - corrected the ticket assumptions and narrowed the architecture to three composable FITL-local macros instead of a broader set of speculative abstractions
  - added `fitl-route-removed-piece-to-force-pool`
  - added `fitl-place-selected-piece-in-zone`
  - added `fitl-place-selected-piece-in-zone-underground-by-type`
  - added direct integration coverage in `packages/engine/test/integration/fitl-event-replacement-routing-macros.test.ts`
- Deviations from original plan:
  - did not add a generic terrain/country/occupant selector macro because that would duplicate the existing query/filter DSL and make authoring less explicit
  - did not add an all-in-one replacement macro; the final design keeps card-specific legality, counts, and selection in the card and extracts only the shared routing/post-placement mechanics
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/integration/fitl-event-replacement-routing-macros.test.js` passed
  - `node --test packages/engine/dist/test/integration/fitl-events-cidg.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine test:e2e` passed
  - `pnpm turbo lint` completed successfully with existing repository warnings in `@ludoforge/engine` and `@ludoforge/runner`, but no lint errors
