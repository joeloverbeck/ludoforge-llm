# 209COMPHARNESS-007: Reference fixture — cross-game agnosticism + replay-identity proof

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: `tickets/209COMPHARNESS-001.md`, `tickets/209COMPHARNESS-002.md`, `tickets/209COMPHARNESS-003.md`, `tickets/209COMPHARNESS-004.md`, `tickets/209COMPHARNESS-005.md`, `tickets/209COMPHARNESS-006.md`

## Problem

Spec §4 AC#2/#3/#4: ship a reference fixture that exercises **every** harness helper (live-frontier run, plan-trace-chain, generic outcome-delta, adversarial alternative, preview-status, replay), proves **cross-game agnosticism** by running the family-agnostic helpers against at least two materially different game families with the *same* helper code, and proves **deterministic replay identity**. This is the integration proof that closes the FOUNDATIONS #16 competence gap and demonstrates no FITL specialization leaked into the harness. It is a coherent, spec-bundled work unit (AC#2 mandates a single reference fixture exercising all helpers), hence Large and not splittable without dangling helper references.

## Assumption Reassessment (2026-06-03)

1. Helpers 001–005 expose a stable, game-agnostic API consumable by a fixture; 006 defines the `@proof-tier` marker this fixture demonstrates.
2. The conformance corpus (`packages/engine/test/architecture/cross-family-conformance.test.ts`) loads three families — `generic-control`, `fire-in-the-lake`, `texas-holdem` — via `loadGameSpecBundleFromEntrypoint` / `runGameSpecStagesFromBundle` from `../../src/cnl/index.js`, with entrypoints at `data/games/<game>.game-spec.md`. The second family for AC#3 is drawn from these (Texas Hold'em or generic-control).
3. **AC#3 scope (per spec reassessment)**: only the family-agnostic execution helpers (§3.1 runner, §3.3 outcome-delta, §3.4 adversarial, §3.5 preview-status, §3.6 replay) run cross-family. The **§3.2 plan-trace-chain helper is exercised on FITL only** — FITL is the sole corpus game with `planControllerFrontierAuthority: 'applies'`; texas-holdem and generic-control are `not_configured` (no plan templates), and authoring plan templates into another corpus game is excluded by AC#6. §3.2's agnosticism is guaranteed structurally (no FITL identifiers in the helper).
4. **Test placement**: the runnable reference test lives under the discovered `packages/engine/test/architecture/` directory (`test:unit` globs `dist/test/architecture/**`, NOT `dist/test/helpers/**`). Game-specific fixture *builders* (FITL + second-family state setup and query/trap/ref declarations) live under `packages/engine/test/helpers/competence/__reference__/` per spec §3. This split satisfies both the spec's module placement and the runner's discovery globs.

## Architecture Check

1. The reference test proves agnosticism operationally: identical helper code runs against ≥2 families, so any leaked FITL specialization would break the non-FITL run (FOUNDATIONS #1, #16).
2. All game specificity lives in the `__reference__/` builders (FITL Support/Patronage/Trail expressed as generic named-feature / token-count / margin queries; trap move keys; decisive ref names) — the harness helpers stay generic (FOUNDATIONS #1, #9).
3. The fixture is annotated with `@proof-tier: executed-outcome` (and `adversarial` where it asserts trap avoidance), demonstrating the 006 convention as the canonical executed-outcome example. Note: files under `test/helpers/` are excluded from the `@test-class` requirement (`testing.md:34`); the runnable test under `test/architecture/` carries `@test-class: architectural-invariant` plus the `@proof-tier` demonstration.
4. Replay identity is asserted via the 005 wrapper, reinforcing FOUNDATIONS #8 at the harness layer.

## What to Change

### 1. Reference fixture builders

`packages/engine/test/helpers/competence/__reference__/`:
- `fitl-reference.ts` — builds a real FITL state, an "advance until" predicate to a meaningful `actionSelection` decision, the expected plan-trace-chain expectation, generic outcome-delta assertions (Support/Patronage/Trail as named-feature/token-count queries), named bad-but-legal trap roots, and decisive preview refs.
- `<second-family>-reference.ts` — same shape for Texas Hold'em or generic-control, covering the family-agnostic helpers only (no plan-trace-chain expectation).

### 2. Runnable reference test

`packages/engine/test/architecture/competence-harness-reference.test.ts` (`// @test-class: architectural-invariant`, plus `// @proof-tier: executed-outcome`):
- For FITL: run the live-frontier runner, then assert plan-trace-chain (§3.2), outcome deltas (§3.3), adversarial avoidance (§3.4), preview statuses (§3.5); wrap in replay-identity (§3.6).
- For the second family: run the same family-agnostic helpers (§3.1/§3.3/§3.4/§3.5/§3.6) with the *same* helper code, proving no FITL specialization leaked.
- Assert deterministic replay identity for both fixtures (AC#4).

## Files to Touch

- `packages/engine/test/helpers/competence/__reference__/fitl-reference.ts` (new)
- `packages/engine/test/helpers/competence/__reference__/<second-family>-reference.ts` (new — Texas Hold'em or generic-control)
- `packages/engine/test/architecture/competence-harness-reference.test.ts` (new)

## Out of Scope

- FITL competence-corpus fixtures beyond the single reference fixture — those are Spec 210.
- New preview cap classes or any engine/kernel/compiler/runtime change (spec Non-Goals; AC#6 confines the diff to `packages/engine/test/` and `.claude/rules/testing.md`).
- Exercising §3.2 plan-trace-chain on a non-FITL family (impossible without authoring plan templates, which AC#6 forbids).

## Acceptance Criteria

### Tests That Must Pass

1. `competence-harness-reference.test.ts` exercises every §3 helper and passes (AC#2).
2. The family-agnostic helpers run against FITL + one other corpus family with the same helper code and pass (AC#3); §3.2 is exercised on FITL.
3. Deterministic replay identity holds for both reference fixtures (AC#4).
4. Full suite green: `pnpm -F @ludoforge/engine test:all` (AC#1); diff confined to `packages/engine/test/` + `.claude/rules/testing.md` (AC#6).

### Invariants

1. Identical helper code paths execute for both families — no per-game branch inside the helpers (FOUNDATIONS #1).
2. The reference fixture asserts an executed board-outcome delta (not just binding/proposal facts) — the competence proof the spec exists to establish (FOUNDATIONS #16).
3. No non-`ready` preview ref is silently coerced (FOUNDATIONS #20); execution is bounded (FOUNDATIONS #10); replay is identical (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/competence-harness-reference.test.ts` — the integration proof (AC#2/#3/#4); also the behavioral exercise for helpers 002–005 per spec AC#2's single-reference-fixture bundling.
2. `packages/engine/test/helpers/competence/__reference__/*.ts` — game-specific fixture builders (imported by the test, not auto-run).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "dist/test/architecture/competence-harness-reference.test.js"`
2. `pnpm -F @ludoforge/engine test:all`
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
