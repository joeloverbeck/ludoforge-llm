# 210FITLCOMP-001: Establish FITL executed-outcome promotion pattern + promote block-current-leader (×4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — test-only (uses the existing Spec 209 competence harness)
**Deps**: `specs/210-fitl-behavioral-competence-fixture-corpus.md`

## Problem

Specs 201–205 authored ~50 FITL doctrine witnesses under `packages/engine/test/policy-profile-quality/` that only *compile, bind, and score* their doctrine modules via `assertSharedModuleWitness` (synthetic `stopReason`, no executed turn). Per `.claude/rules/testing.md` and FOUNDATIONS #16, structural ≠ competence proof: no test executes a turn and asserts the strategic property improved. Spec 209 landed a game-agnostic competence harness (`packages/engine/test/helpers/competence/`) but no production FITL fixture uses it.

This ticket establishes the canonical **in-place promotion pattern** (the "implement" half of implement+port) and applies it to the highest-value shared intent — **block current leader** — across all four factions. Every later ticket (002–009) follows the pattern this ticket sets.

## Assumption Reassessment (2026-06-03)

1. Harness helpers exist and are exported from `packages/engine/test/helpers/competence/index.ts`: `assertOutcomeDeltas`, `assertAdversarialAlternativeAvoided`, `assertPreviewStatuses`, `assertReplayIdentity`, `assertPlanTraceChain`, `canonicalStateChanged`, plus the live-frontier runner. Confirmed.
2. The canonical usage exemplar is `packages/engine/test/architecture/competence-harness-reference.test.ts` (tagged `@proof-tier: executed-outcome` + `adversarial`), driven by `packages/engine/test/helpers/competence/__reference__/fitl-reference.ts`. Confirmed.
3. The four block-leader fixtures `shared-block-current-leader-{us,arvn,nva,vc}.test.ts` exist, tagged `architectural-invariant`, calling `assertSharedModuleWitness(file, faction, 'blockCurrentLeader')`. Confirmed.
4. The structural shared helper `shared-doctrine-witness-helpers.ts` is the thing being superseded; a NEW harness-backed `shared-competence-helpers.ts` avoids co-edit collisions with later shared tickets (002–005).
5. Victory-formula refs for the outcome delta live in `data/games/fire-in-the-lake/91-victory-standings.md` and are surfaced as `victory.currentMargin.<faction>` / `victory.currentRank.<faction>` / `metric.auto:victory:*` (already used in `92-agents.md` `stateFeatures`). Confirmed.

## Architecture Check

1. In-place promotion (rewriting the existing `describe` body) over authoring parallel fixtures keeps a single source of truth per intent (FOUNDATIONS #14, DRY) and matches the trigger report §11.3 ("replace synthetic-root-only tests with live-frontier tests").
2. All FITL specifics stay in test fixtures and game data; the harness in `helpers/competence/` remains game-agnostic (proven by its generic-control reference). No engine code changes (FOUNDATIONS #1).
3. The promoted fixture is a superset of the structural one: `assertPlanTraceChain` re-proves the module binding the structural witness checked, while `assertOutcomeDeltas` adds the behavioral proof — so no coverage is lost when the structural assertion is removed.
4. Preview decisive refs are asserted via `assertPreviewStatuses` (FOUNDATIONS #20 — no silent coercion). Replay identity via `assertReplayIdentity` (FOUNDATIONS #8/#9).

## What to Change

### 1. Create the shared FITL competence helper

Add `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` exposing generic primitives reused by all shared-intent promotions (002–005): a curated-state builder entry point, a thin wrapper that runs a faction's curated state through the live-frontier runner, and a helper that resolves the bad-but-legal adversarial root's stable move key. Keep curated *state* definitions in the individual fixture files (or a per-intent block), so 002–005 do not co-edit this file (see Out of Scope).

### 2. Promote block-current-leader (×4)

For each of `shared-block-current-leader-{us,arvn,nva,vc}.test.ts`:
- Replace the `assertSharedModuleWitness(...)` body with: build a near-win-leader curated state with ≥2 legal denials and one irrelevant strong move; run the live frontier; `assertPlanTraceChain` (binds `<faction>.blockCurrentLeader`); `assertAdversarialAlternativeAvoided` (the irrelevant strong move is the trap); `assertOutcomeDeltas` proving the selected candidate reduces the leader's margin more than the alternative via the leader's own victory-formula query; `assertPreviewStatuses` for decisive refs; `assertReplayIdentity`.
- Replace the file-top marker with `// @test-class: architectural-invariant` + `// @proof-tier: executed-outcome` + `// @proof-tier: adversarial`.

### 3. Document the pattern for downstream tickets

Add a short header comment in `shared-competence-helpers.ts` describing the promotion recipe so 002–009 can follow it without re-deriving the harness wiring.

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (new)
- `packages/engine/test/policy-profile-quality/shared-block-current-leader-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-block-current-leader-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-block-current-leader-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-block-current-leader-vc.test.ts` (modify)
- `packages/engine/test/helpers/competence/` (read — pattern reference)
- `packages/engine/test/architecture/competence-harness-reference.test.ts` (read — canonical usage)

## Out of Scope

- The other shared intents (immediate-win, near-Coup, Monsoon, ally-rival) — tickets 002–005.
- Faction signature fixtures — tickets 006–009.
- Any `92-agents.md` feature additions — ticket 010 (gated).
- Deleting `assertSharedModuleWitness` from `shared-doctrine-witness-helpers.ts`: defer until the ticket that promotes the last shared consumer (005) — block-leader alone does not remove all consumers.
- Curated *state* definitions must NOT be added to `shared-competence-helpers.ts` (keep them in fixture files) so 002–005 stay parallelizable without co-editing this file.

## Acceptance Criteria

### Tests That Must Pass

1. Each `shared-block-current-leader-{us,arvn,nva,vc}.test.ts` executes a real turn (`canonicalStateChanged` true) and proves the selected denial reduces the leader's margin more than the irrelevant strong move, via the leader's victory-formula query.
2. Each fixture proves the adversarial bad-but-legal alternative is present and rejected.
3. Existing suite (policy-profile-quality lane): `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-us.test.js`

### Invariants

1. Each promoted fixture carries `@proof-tier: executed-outcome` and `@proof-tier: adversarial`, keeps its original file path and `describe` name (FOUNDATIONS #14, no parallel file).
2. Decisive preview refs are `ready` or explicitly traced non-`ready`; no silent coercion (FOUNDATIONS #20).
3. Replay produces identical stable keys, microturn decisions, and outcome deltas (FOUNDATIONS #8).
4. No engine source changes; FITL specifics remain in fixtures/data (FOUNDATIONS #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-block-current-leader-{us,arvn,nva,vc}.test.ts` — promoted to executed-outcome/adversarial tier.
2. `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` — new shared primitives (exercised by the four fixtures).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-us.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-vc.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
