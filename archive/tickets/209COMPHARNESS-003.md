# 209COMPHARNESS-003: Generic outcome-delta assertion helper

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: `archive/tickets/209COMPHARNESS-001.md`

## Problem

Spec §3.3: the harness must prove competence at the *executed-outcome* level by asserting before/after board-state deltas — but over **generic** state queries only, so the helper carries no game-specific knowledge. Any FITL quantity (Support, Patronage, Trail, Opposition) is expressed by the fixture as a named-feature or token-count query, never by a FITL-aware helper (FOUNDATIONS #1, #9).

## Assumption Reassessment (2026-06-03)

1. The runner (001) surfaces `preState` and `postState` (real `GameState` objects) for the executed turn — confirmed by 001's design.
2. Generic query surfaces available without game-specific code: victory margins/ranks via the compiled victory formula, named `stateFeature`/aggregate values, token counts filtered by type and status, and zone-property / control aggregates. These are the same generic query primitives the kernel already exposes for analytics (FOUNDATIONS #9).
3. No FITL identifier appears in the helper; the reassessment confirmed the trigger report's helper sketch implied FITL-aware deltas, which this ticket explicitly avoids.

## Architecture Check

1. The helper accepts a list of `(query, expected-direction-or-bound)` assertions evaluated against `preState`/`postState` deltas — a closed, generic contract with no per-game branching (FOUNDATIONS #1).
2. Pushes all game specificity to the fixture (the *query strings* are authored by the fixture), keeping the GameSpecDoc-vs-engine boundary intact (FOUNDATIONS #2, #9).
3. Asserts directional/bounded strategic properties rather than a single arbitrary final value — mitigates brittle overfitting (spec §5).

## What to Change

### 1. Generic outcome-delta helper

`packages/engine/test/helpers/competence/outcome-delta.ts`:
- Signature roughly `assertOutcomeDeltas(preState, postState, def, assertions)` where each assertion is `{ query, expect }` and `expect` is a direction (`increase` | `decrease` | `unchanged`) or a numeric bound (`{ min?, max? }`).
- Supported generic query kinds: victory margin/rank (per compiled victory formula), named `stateFeature`/aggregate value, token count by `(type, status)` filter, zone-property value, and control aggregate.
- Computes `after - before` per query and asserts the expected direction/bound; reports the actual delta on failure.

### 2. Barrel export

Append the helper export to `packages/engine/test/helpers/competence/index.ts`.

## Files to Touch

- `packages/engine/test/helpers/competence/outcome-delta.ts` (new)
- `packages/engine/test/helpers/competence/index.ts` (modify — append one export; serialize with sibling tickets)

## Out of Scope

- Any FITL-aware delta logic (Support/Patronage/Trail must be expressed as generic queries by the fixture).
- The reference fixture exercising this helper — ticket 007 (per spec AC#2). Behavioral exercise attaches to 007; no standalone `.test.ts` here.

## Acceptance Criteria

### Tests That Must Pass

1. Exercised by ticket 007's reference fixture: given a real run's `preState`/`postState`, the helper passes when the named-feature / token-count / margin deltas match the expected directions/bounds and fails when they do not.
2. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`

### Invariants

1. The helper body contains zero game-specific identifiers — only generic query evaluation (FOUNDATIONS #1, #9).
2. Deltas are computed from canonical state, not hashes (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. None standalone — behavioral exercise lands in `packages/engine/test/architecture/competence-harness-reference.test.ts` (ticket 007) per spec AC#2's single-reference-fixture bundling.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine typecheck`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completion date: 2026-06-03

Implemented `packages/engine/test/helpers/competence/outcome-delta.ts` and exported it through the competence helper barrel. The helper computes before/after deltas over canonical `GameState` values using a closed generic query contract covering terminal victory margin/rank, `victoryStandings`, derived metrics, compiled policy state features, token counts filtered by type/status/props, zone vars/attributes, marker values/counts, and generic control counts. Fixture-authored ids stay outside the helper body.

Verification completed:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `pnpm -F @ludoforge/engine test:unit` — 6110 tests, 0 failures
4. `pnpm turbo build`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm run check:ticket-deps`
8. `git diff --check`
9. No game-specific identifier matches in the helper/barrel sweep
