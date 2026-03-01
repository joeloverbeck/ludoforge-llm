# SEATRES-005: Enforce a strict single seat namespace and migrate specs off index seat IDs

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — compiler contract + schema constraints + fixtures/spec migration
**Deps**: archive/tickets/SEATRES-004-unified-seat-identity-contract-module.md

## Problem

Seat identity currently supports two implicit modes:

1. named seat ids (for example `US`, `NVA`) and
2. index-style ids (`"0"`, `"1"`, ...), with heuristic remapping when piece-catalog seats match by count/order.

This dual mode is brittle and non-extensible. The compiler can silently reinterpret the same selector depending on seat array shape, which is a hidden alias path.

## Assumption Reassessment (2026-03-01)

1. `compiler-core.ts` currently delegates seat identity derivation to `seat-identity-contract.ts`, which still canonicalizes index turn-flow seats to piece-catalog seats when counts match.
2. Unit tests now codify this behavior as valid (`compiler-structured-results.test.ts` includes a numeric-seat acceptance case).
3. Repository game data/fixtures contain substantial numeric seat usage in compile-path sources (not only isolated unit fixtures), especially:
   - `data/games/fire-in-the-lake/30-rules-actions.md`
   - `data/games/fire-in-the-lake/41-content-event-decks.md`
   - `data/games/fire-in-the-lake/90-terminal.md`
   - `packages/engine/test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`
4. Multiple compile-path integration/unit tests still use numeric turn-flow seats and numeric seat references as accepted behavior; migration scope must include those compile-path tests.
5. No active ticket currently removes index-mode seat identity itself; `SEATRES-004` unifies derivation/consumption but does not remove dual-mode semantics.
6. `deriveCanonicalSeatIds` no longer exists by name; the active dual-mode behavior is implemented in `seat-identity-contract.ts` (`turn-flow-index-raw` / `turn-flow-index-canonicalized` modes).

## Architecture Check

1. A single seat namespace is cleaner than heuristic remapping: every selector, validator, and runtime reference resolves against one identity set.
2. This keeps boundaries clean: game-specific ids stay in `GameSpecDoc`; `GameDef`/simulation remain game-agnostic identifiers.
3. No backward compatibility: numeric index identity mode is removed rather than kept as an alias.

## What to Change

### 1. Remove index-mode seat identity from compiler contract

1. Eliminate heuristic remapping/fallback that treats `"0".."N"` as equivalent to named seats.
2. Reject index-style seat identity mode with explicit compiler diagnostics that direct migration to canonical named ids.

### 2. Require canonical named seat IDs across all seat surfaces

1. Enforce one canonical seat-id set for selector lowering, cross-validation, terminal/victory references, and event/turn-flow references.
2. Fail fast when any seat reference uses ids outside that set.

### 3. Migrate existing specs and fixtures

1. Migrate GameSpecDoc sources (including Fire in the Lake docs/assets used to produce specs) from numeric ids to canonical named seat ids.
2. Update affected compiler fixtures and golden traces that currently encode numeric seat ids.
3. Ensure migration includes deterministic mapping docs/scripts so future spec updates cannot regress into index mode.
4. Update compile-path tests that currently encode numeric seat identity assumptions in source docs so they use named seat ids.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts`
- `packages/engine/src/cnl/seat-identity-contract.ts`
- `packages/engine/src/cnl/compile-selectors.ts`
- `packages/engine/src/cnl/cross-validate.ts`
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts`
- `data/games/fire-in-the-lake/30-rules-actions.md`
- `data/games/fire-in-the-lake/41-content-event-decks.md`
- `data/games/fire-in-the-lake/90-terminal.md`
- `packages/engine/test/fixtures/cnl/compiler/**`
- `packages/engine/test/unit/compiler-structured-results.test.ts`
- `packages/engine/test/unit/compile-actions.test.ts`
- `packages/engine/test/unit/cross-validate.test.ts`
- `packages/engine/test/integration/compile-pipeline.test.ts` (if fixture-derived expectations change)
- `packages/engine/test/integration/*fitl*.test.ts` compile-path tests whose expected seat ids are derived from migrated sources

## Out of Scope

- Runner visual presentation configuration (`visual-config.yaml`)
- Game-specific rule redesign unrelated to seat identity

## Acceptance Criteria

### Tests That Must Pass

1. Compiler rejects numeric/index seat identity mode with deterministic diagnostics.
2. All seat references resolve only through the canonical named seat-id namespace.
3. Migrated compile-path specs/fixtures compile and simulate without numeric-seat aliases.
4. Existing quality gates pass: `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`.

### Invariants

1. Exactly one seat-id namespace is valid per game spec.
2. No alias path exists between numeric index ids and named ids.
3. `GameDef` and simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — replace numeric-seat acceptance with numeric-seat rejection assertions.
Rationale: prevents reintroduction of dual-mode identity semantics.
2. `packages/engine/test/unit/compile-actions.test.ts` — assert seat-name selectors only resolve via canonical namespace and fail on mixed index/name references.
Rationale: protects primary selector surfaces from silent remap behavior.
3. `packages/engine/test/unit/cross-validate.test.ts` — assert terminal/event/victory seat refs fail when outside canonical namespace.
Rationale: ensures compile-time and cross-validation seat policies stay identical.
4. `packages/engine/test/integration/compile-fixture.test.ts` (or equivalent fixture compile harness) — migrate fixtures and assert successful compile under strict namespace.
Rationale: validates migration completeness on real fixture assets.
5. `packages/engine/test/integration/compile-pipeline.test.ts` and affected FITL compile-path integrations — update expected outputs/seat assertions to canonical named ids.
Rationale: verifies end-to-end compile path no longer emits index-seat identity in migrated sources.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
4. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Actually Changed**:
  - Removed index-seat permissive behavior from compiler seat identity contract and selector lowering.
  - Added explicit diagnostic for forbidden turn-flow index seat identity (`CNL_COMPILER_SEAT_IDENTITY_INDEX_FORBIDDEN`).
  - Migrated FITL source docs/fixtures and compile-path tests from numeric seat ids to canonical named seat ids.
  - Updated kernel turn-flow runtime seat resolution paths so card/coup/free-operation behavior resolves active seat identity via canonical seat mapping (no numeric alias assumptions).
  - Updated golden fixtures for deterministic trace contracts to canonical seat ids.
- **Deviations From Original Plan**:
  - `compiler-core.ts` and `cross-validate.ts` did not require direct code edits; enforcement landed in `seat-identity-contract.ts` + `compile-selectors.ts` and related diagnostics/tests.
  - Scope expanded beyond compile-time checks into kernel runtime turn-flow modules (`turn-flow-eligibility.ts`, `phase-advance.ts`, `legal-moves-turn-order.ts`, `effects-turn-flow.ts`) to remove residual numeric-seat assumptions surfaced by integration tests.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine test` passed (337/337).
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
