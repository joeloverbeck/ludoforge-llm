# LEGACTTOO-017: Choice Token Binding Fidelity for `tokenProp` / `tokenZone` References

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — choice runtime (`effects-choice.ts`), reference resolution (`resolve-ref.ts`), and related kernel tests
**Deps**: None

## Problem

`chooseOne` / `chooseN` currently normalize option values into move-param comparable scalars (token options become token IDs). The normalized scalar array is then written into runtime bindings.

This causes a type mismatch when downstream effects rely on token-typed refs:
- `tokenProp` currently requires binding values to be Token objects.
- `tokenZone` supports Token or token-id string, but `tokenProp` does not.

Observed symptom while implementing FITL card 29 (`Tribesmen`): `chooseN` token selections could not be used in `moveToken.to.zoneExpr` via `tokenProp`, forcing a `removeByPriority` workaround in card data instead of canonical `chooseN` + `forEach` selection flow.

## Assumption Reassessment (2026-03-07)

1. `applyChooseN` stores normalized scalar selections into bindings (`[bind]: normalizedSelected`). **Confirmed in `packages/engine/src/kernel/effects-choice.ts`.**
2. Normalization converts token-like values to `id` scalar (`toMoveParamComparableScalar`). **Confirmed in `packages/engine/src/kernel/move-param-normalization.ts`.**
3. `resolveRef` for `tokenProp` rejects scalar token IDs and requires object-like token bindings. **Confirmed in `packages/engine/src/kernel/resolve-ref.ts`.**
4. `resolveRef` for `tokenZone` already supports token-id strings. **Confirmed in `packages/engine/src/kernel/resolve-ref.ts`.**
5. Current Tribesmen implementation uses workaround logic in content due this limitation. **Confirmed in `data/games/fire-in-the-lake/41-content-event-decks.md` card-29 unshaded.**
6. There is already baseline unit coverage for scalar choice-membership parity (`packages/engine/test/unit/kernel/choice-membership-parity.test.ts`), but it does **not** cover:
   - choice bindings preserving rich token runtime values, or
   - `tokenProp` resolving token-id string bindings.
   **Scope adjusted to add these targeted regressions instead of broad new integration fixtures.**

## Architecture Check

1. Choice runtime should preserve rich runtime item bindings while still validating move params with scalar-comparable semantics. This keeps decision transport compact while execution remains type-correct.
2. This is engine-generic behavior, not FITL-specific logic. No game-specific branches are introduced.
3. No backwards-compatibility alias/shim: fix core semantics so token-typed refs work uniformly after choice effects.

## What to Change (Re-scoped)

### 1. Preserve rich runtime values in choice bindings

In `applyChooseOne` and `applyChooseN`:
- Keep current domain validation against comparable scalar values.
- Add deterministic mapping from comparable scalar -> original option runtime item.
- Write selected original runtime items into effect bindings, not just scalars.
- Reject ambiguous domains where different runtime items collapse to same comparable scalar.

### 2. Make `tokenProp` accept token-id string bindings

In `resolve-ref.ts`:
- Align `tokenProp` behavior with `tokenZone` by allowing token-id string bindings.
- Resolve token ID to token object via state lookup before reading props.
- Raise explicit missing-token error if ID is not found in any zone.

### 3. Add regression coverage for token-ref chains through choice effects

Add focused kernel unit tests that prove:
- `chooseN(tokensInMapSpaces)` selection can be consumed by later `tokenProp`.
- `chooseOne`/`chooseN` with token options maintain deterministic behavior and reject ambiguous comparable collisions.
- `tokenProp` resolves both Token-object and token-id string bindings through state lookup.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/src/kernel/move-param-normalization.ts` (modify only if needed for explicit collision handling contracts)
- `packages/engine/test/unit/effects-choice.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (add)

## Out of Scope

- FITL card content migration itself (tracked in `tickets/LEGACTTOO-018-tribesmen-remove-choice-workaround-after-token-binding-fix.md`)
- Broad redesign of query domains unrelated to token selections

## Acceptance Criteria

### Tests That Must Pass

1. New test: `chooseN token selections can be used with tokenProp in follow-up effects`.
2. New test: ambiguous comparable collisions in choice domains are rejected with a deterministic runtime validation error.
3. New test: `tokenProp` accepts token-id string bindings and errors clearly on missing token IDs.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Choice decision validation still uses move-param comparable values for ownership/transport checks.
2. Runtime effect bindings preserve enough type information for token refs (`tokenProp`, `tokenZone`) to behave consistently.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts` — assert binding fidelity after token `chooseOne`/`chooseN` and ambiguous comparable collision rejection.
2. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` — assert `tokenProp` supports token IDs and token objects equivalently.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`

## Outcome

Implemented as planned with a tighter unit-test-focused scope:
- `chooseOne` / `chooseN` now keep move-param scalar validation for legality, but persist selected original runtime option values into bindings.
- Choice domain ambiguity is now rejected when multiple distinct runtime values collapse to the same comparable scalar.
- `tokenProp` now accepts token-id string bindings by resolving token IDs through zone state, with explicit missing-token errors.
- Added a shared per-state token index (`token-state-index.ts`) and routed token ref resolution through it to avoid repeated full-zone scans while preserving first-match duplicate-id semantics.
- Added focused regression tests for choice binding fidelity, ambiguity rejection, and `tokenProp` token-id behavior.
- Verified with `pnpm -F @ludoforge/engine build`, targeted new dist tests, `pnpm -F @ludoforge/engine test:unit`, and `pnpm -F @ludoforge/engine lint`.
