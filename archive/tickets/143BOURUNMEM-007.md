# 143BOURUNMEM-007: Engine-generic decision-local-helper drop/compact regression

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — new test file only
**Deps**: `archive/tickets/143BOURUNMEM-004.md`

## Problem

Spec 143 Testing Requirements #3: "At least one engine-generic regression proving a decision-local helper/cache is dropped or compacted at scope exit." Acceptance Criterion #6: "The final design remains engine-agnostic and does not introduce FITL-specific branches."

005 and 006 exercise the FITL motivating corpus (advisory CI). They are quality-plus-budget witnesses tied to specific profiles and seeds. An engine-generic regression is additionally required to prove the architectural invariant (drop-at-scope-exit) independently of any game-specific workload — otherwise a future FITL change could make 005/006 pass coincidentally while the underlying invariant has silently drifted on non-FITL games. The engine-generic witness lives at the determinism tier because it tests an engine invariant, not a profile-quality signal.

## Assumption Reassessment (2026-04-23)

1. `packages/engine/test/determinism/` is the correct home per FOUNDATIONS.md Appendix: "every test there asserts only engine-level invariants such as replay identity and bounded execution. Failures in that corpus are engine bugs and block CI." Drop-at-scope-exit is exactly such an invariant — a failure here is an engine bug.
2. Conformance fixtures exist under `packages/engine/test/fixtures/` or similar that provide non-FITL game definitions suitable for exercising chooseN / policy preview flows. If no such fixture exists, a minimal synthetic GameDef is acceptable (engine-generic is the architectural requirement, not "uses a specific existing fixture").
3. 004's scope-boundary enforcement creates the contract this test validates. Without 004, the test would fail; 007 is therefore Wave 4 and hard-depends on 004 specifically (not 003).

## Architecture Check

1. **Determinism-tier placement**: drop-at-scope-exit is an engine invariant over any legitimate state evolution — same tier as "every legal move is classifier-admissible" or "replay produces identical outcome." Blocking CI is appropriate. Foundation 8 (Determinism is Sacred) supported by bounded-state discipline, Foundation 10 (Bounded Computation).
2. **Engine-agnostic by construction**: test uses a non-FITL workload (or a synthetic minimal GameDef). No FITL-specific imports, profiles, or seeds. Foundation 1 enforcement.
3. **Complements 005/006, doesn't duplicate**: 005/006 exercise the full FITL-scale workload and assert budget properties (heap growth, cost drift). 007 asserts the architectural invariant (drop-at-scope-exit) on a minimal workload — smaller, faster, broader game coverage.
4. **Not a witness of specific seed behavior**: `@test-class: architectural-invariant` — the property holds for every legitimate evolution, independent of trajectory.

## What to Change

### 1. Author the engine-generic drop-at-scope-exit regression

Create a new test file at `packages/engine/test/determinism/decision-local-scope-drop.test.ts` that:

- Declares `// @test-class: architectural-invariant` at the top.
- Uses a non-FITL GameDef — either a minimal synthetic fixture or an existing non-FITL conformance fixture (Texas Hold'em fixtures under `packages/engine/test/` may be suitable; implementer verifies during implementation). No FITL profile, no FITL seed.
- Drives the GameDef through a chooseN flow and/or a policy preview cycle (whichever 004 establishes scope-boundary contracts for).
- Captures the relevant helper state (chooseN session caches, policy preview context, granted-operation helpers) immediately before scope-exit and immediately after.
- Asserts: after scope-exit, the helper state is dropped or compacted to a bounded empty form (exact assertion shape depends on 004's scope-exit contracts).

### 2. Covering both scope types

If feasible in one file without sacrificing clarity, include:

- A chooseN-session drop assertion (exercises `probeCache` / `legalityCache` drop at session exit).
- A policy-preview-context drop assertion (exercises context drop at publication/preview scope exit).
- A decision-stack frame post-split assertion (exercises the 004 Section 6 field split — transient carrier is dropped while continuation-required fields persist).

If covering all three in one file becomes unwieldy, split into 2–3 sibling test files with the same `@test-class`.

### 3. No dependency on specific FITL timing

The test must not rely on FITL-specific decision counts, turn thresholds, or terminal conditions. Any timing assertion must be expressed over the test's own game-agnostic scope boundaries (e.g., "after calling `exitChooseN(session)`", not "after turn 50").

## Files to Touch

- `packages/engine/test/determinism/decision-local-scope-drop.test.ts` (new) — or a set of 2–3 sibling files if coverage is split per scope type. Exact naming matches determinism tier conventions.

## Out of Scope

- FITL motivating-corpus proof (covered by 005/006).
- Per-decision cost witness (covered by 006).
- Any engine source changes — this ticket adds a test only.
- Coverage of scope-boundary contracts beyond those 004 establishes — if 004 does not introduce a scope-exit contract for a given helper, 007 does not test it (and the gap surfaces as a 004 finding, not a 007 one).

## Acceptance Criteria

### Tests That Must Pass

1. The new test passes after 004 lands, exercising the scope-boundary contracts 004 introduced.
2. Full determinism corpus: `pnpm -F @ludoforge/engine test:e2e`.
3. Full engine suite: `pnpm -F @ludoforge/engine test:all`.
4. The test uses no FITL-specific identifiers (grep-auditable: no `fitl`, `arvn`, `nva`, `vc`, or FITL seed literals in the test body).

### Invariants

1. The witness lives in `packages/engine/test/determinism/`, at the blocking CI tier — drop-at-scope-exit is an engine invariant, not a quality signal.
2. `@test-class: architectural-invariant` — the property is expected to hold for any legitimate state evolution, regardless of game.
3. No FITL imports, profiles, seeds, or identifiers anywhere in the test file (Foundation 1).
4. Assertions are expressed over the test's own scope boundaries, not over game-specific turn/decision counts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/decision-local-scope-drop.test.ts` (new) — the ticket's own engine-generic regression.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine build`, then `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/decision-local-scope-drop.test.js`
2. Determinism tier: `pnpm -F @ludoforge/engine test:determinism`
3. Full engine suite: `pnpm -F @ludoforge/engine test:all`
4. FITL-free audit: `rg -n "fitl|arvn|nva|vc" packages/engine/test/determinism/decision-local-scope-drop.test.ts`

## Outcome

Completion date: 2026-04-24

- Implemented: added `packages/engine/test/determinism/decision-local-scope-drop.test.ts` as the engine-generic architectural-invariant witness required by Spec 143. The file stays FITL-free and exercises the three live 004-owned scope-exit seams directly: chooseN session cache disposal, preview-runtime disposal, and root-only continuation binding retention after nested chooseN updates.
- Implemented: corrected the ticket's stale verification commands to the repo-valid direct dist test invocation plus the actual determinism lane (`test:determinism`), replacing the draft's invalid `--test-name-pattern` probe and incorrect `test:e2e` lane.
- Verification results: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/decision-local-scope-drop.test.js`; `pnpm -F @ludoforge/engine test:determinism`; `rg -n "fitl|arvn|nva|vc" packages/engine/test/determinism/decision-local-scope-drop.test.ts`.
- Broad-lane note: `pnpm -F @ludoforge/engine test:all` was attempted and remains red for an unrelated pre-existing corpus-audit failure in `packages/engine/test/unit/infrastructure/test-class-markers.test.ts`, which reports mismatched `@profile-variant` markers on `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` and `packages/engine/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.ts`. That failure is outside 007's owned determinism-tier seam and was left untouched.
