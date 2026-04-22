# 140MICRODECPRO-009: D9 — Remove microturn-incompatible shipped profile heuristics; defer re-evolution

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No engine source changes; production profile YAML and direct proof fixtures only
**Deps**: `archive/tickets/140MICRODECPRO-007.md`, `archive/tickets/140MICRODECPRO-002.md`

## Problem

Spec 140's D9 profile migration still leaves a truthful remaining task even without running a new evolution campaign: remove any shipped profile clauses that still depend on legacy completion-era or action-param-era policy inputs that no longer fit the microturn-native decision structure.

The user-directed boundary for this turn is explicit: do not run MAP-Elites or try to preserve these heuristics by force-porting them. If a shipped profile depends on legacy `completion` scoring, `candidate.param.*`, or `preview.phase1`, remove that heuristic from the live corpus now and accept the temporary degradation. Re-evolution can happen later against the actually migrated corpus.

## Assumption Reassessment (2026-04-20)

1. Ticket 007 intentionally preserved private legacy policy support because the shipped witnesses still depended on it, so the current repo still had live incompatibilities in production YAML.
2. The actual shipped incompatibilities are narrower than the blocked draft claimed: FITL still used `scopes: [completion]`, `candidate.param.targetSpace`, and `preview.phase1`; Texas still used `candidate.param.raiseAmount`.
3. No other active ticket owns this cleanup. Ticket 014 is test-wave work; if 009 does not remove the incompatible shipped profile clauses, they remain orphaned in the series.
4. Ticket 002 remains useful evidence that some heuristics were not mechanically portable, but that does not require running the campaign now. Removal is the truthful prerequisite cleanup.

## Architecture Check

1. Evolution-first (F2): profile quality work still belongs in YAML/profile space, but the current turn is removal, not optimization.
2. F5/F10/F18/F19: the shipped profile corpus should match the microturn-native action/choice boundary and should not keep relying on legacy completion-specific or action-param-specific scoring hooks.
3. Ticket fidelity: this ticket now owns only the live shipped-profile cleanup plus direct proof fallout. It does not silently absorb the broader compiler-runtime retirement still preserved as internal support code.
4. Future re-evolution remains valid, but only after the migrated corpus exists as the true baseline.

## What to Change

### 1. Remove incompatible shipped Texas profile heuristics

Delete the raise-amount heuristic from `data/games/texas-holdem/92-agents.md` rather than trying to preserve `candidate.param.raiseAmount` on the live corpus.

### 2. Remove incompatible shipped FITL profile heuristics

Delete the completion-scoped and target-space-param heuristics from `data/games/fire-in-the-lake/92-agents.md`, and drop `preview.phase1` from the ARVN profiles. Keep the surviving microturn-compatible profiles intact.

### 3. Refresh direct proof artifacts

Regenerate the production policy fixtures that snapshot the changed YAML corpus and run the narrowest build/test lanes that prove the shipped profiles still compile and the owned fixtures are current.

### 4. Defer re-evolution explicitly

Do not run a campaign in this ticket. Any later profile-quality recovery should happen as a separate re-evolution ticket against the now-clean microturn-native baseline.

## Files to Touch

- `tickets/140MICRODECPRO-009.md` (modify)
- `data/games/texas-holdem/92-agents.md` (modify)
- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (regenerate)
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (regenerate)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (regenerate if changed)
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` (regenerate if changed)

## Out of Scope

- Running MAP-Elites or any other re-evolution campaign.
- Compiler/runtime retirement of the still-private legacy policy-support substrate.
- Recreating the archived ticket 008 split automatically.
- Engine/runtime source changes.

## Acceptance Criteria

### Tests That Must Pass

1. `grep -rn "candidate\\.param|scopes: \\[completion\\]|phase1:" data/games/fire-in-the-lake/92-agents.md data/games/texas-holdem/92-agents.md` returns no hits.
2. `pnpm -F @ludoforge/engine build` passes.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-production-data-compilation.test.js dist/test/integration/card-surface-cross-game.test.js` passes.
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js` passes after any owned fixture regeneration.
5. `pnpm run check:ticket-deps` passes.

### Invariants

1. This ticket does not claim any profile-quality improvement campaign landed.
2. The live shipped profile corpus no longer depends on `candidate.param.*`, `scopes: [completion]`, or `preview.phase1`.
3. No engine/runtime source changes are made in this ticket turn.

## Outcome

**Completed**: 2026-04-21

Reassessment showed that keeping `009` blocked would orphan the last live profile-migration cleanup: the shipped Texas and FITL agent YAML still depended on legacy `candidate.param.*`, `scopes: [completion]`, and `preview.phase1` surfaces, and no other active ticket owned their removal.

This turn therefore rewrote `009` from a blocked future campaign ticket into the truthful removal slice: incompatible heuristics were deleted from the live corpus instead of being force-ported or re-evolved. The broader internal compiler/runtime support was intentionally left untouched because it is not part of the shipped-profile boundary this ticket owns.

- `ticket corrections applied`: `blocked future campaign -> active shipped-profile cleanup with re-evolution explicitly deferred`
- `profiles simplified`: `texas raise-amount heuristic removed; FITL completion-scoped, target-space-param, and phase1-dependent heuristics removed`
- `direct proof fallout`: `production policy catalog fixtures regenerated; policy summary fixtures regenerated if changed`
- `verification set`: `grep -rn "candidate\\.param|scopes: \\[completion\\]|phase1:" data/games/fire-in-the-lake/92-agents.md data/games/texas-holdem/92-agents.md`, `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-production-data-compilation.test.js dist/test/integration/card-surface-cross-game.test.js`, `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js`, `pnpm run check:ticket-deps`
- `deferred scope`: `any profile-quality recovery or re-evolution campaign after the migrated baseline is accepted`

## Test Plan

### New/Modified Tests

Focused integration coverage over the compiled production specs plus JSON-schema fixture validation for regenerated policy traces/catalogs.

### Commands

1. `grep -rn "candidate\\.param|scopes: \\[completion\\]|phase1:" data/games/fire-in-the-lake/92-agents.md data/games/texas-holdem/92-agents.md`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-production-data-compilation.test.js dist/test/integration/card-surface-cross-game.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js`
5. `pnpm run check:ticket-deps`
