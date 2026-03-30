# 95POLGUIMOVCOM-009: Integration, E2E, golden, and property tests for guided completion

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test files only
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-001.md, archive/tickets/95POLGUIMOVCOM-002.md, archive/tickets/95POLGUIMOVCOM-003.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-004.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-005.md, tickets/95POLGUIMOVCOM-007.md, tickets/95POLGUIMOVCOM-008.md

## Problem

The individual tickets cover unit and focused integration tests. This ticket adds the cross-cutting tests that validate the full pipeline: FITL spec compilation with guidance-enabled profiles, determinism across seeds, golden file updates, and property-based correctness checks. These tests prove that the guided completion feature works end-to-end as a coherent system.

## Assumption Reassessment (2026-03-30)

1. FITL production spec is compiled via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed.
2. E2E determinism tests exist in `packages/engine/test/e2e/` — same seed + same actions = identical state hash pattern. Confirmed.
3. Golden tests for agent policy catalog exist (verifying compiled output shape). Confirmed.
4. The FITL VC agent profile lives in `data/games/fire-in-the-lake/` YAML files. Adding `completionGuidance` and `completionScoreTerms` to this profile is required for integration testing. Confirmed.
5. Property tests use random play for N turns to verify no crashes/invalid states. Confirmed.

## Architecture Check

1. Cleanest approach: add a FITL VC test profile with `completionGuidance` enabled, then run existing E2E patterns against it. No new test infrastructure — reuse existing helpers.
2. Engine agnosticism: E2E tests compile and run a specific game (FITL) but the kernel under test is generic. The tests prove that the generic `choose` callback mechanism works for a real game.
3. No backwards-compatibility shims: new test files only.

## What to Change

### 1. FITL agent profile YAML — add `completionGuidance` to VC profile

Add to the VC agent profile in the FITL spec:
```yaml
completionGuidance:
  enabled: true
  fallback: random
```

Add `completionScoreTerms` to the FITL agent library (at least 2 terms for testing):
- `preferHighPopZone`: scores zone choices by token count
- `preferBaseOverGuerrilla`: scores enum choices for base placement

Add `use.completionScoreTerms` referencing these library entries.

### 2. Integration test — compile FITL with guidance-enabled profile

Compile the full FITL spec and verify:
- `completionGuidance` appears on the VC profile in the compiled catalog
- `completionScoreTerms` entries appear in the compiled library
- `use.completionScoreTerms` on the VC profile references the correct library keys
- No compilation diagnostics (errors)

### 3. Integration test — guided completion produces different results than random

Run a known FITL Rally template move with:
- (A) No guidance (PRNG-based completion)
- (B) Guidance enabled (scoring-based completion)

Verify that (B) selects a different (policy-preferred) inner decision than (A) for at least one case. This is a behavioral test — not a golden test — because the specific values depend on the FITL spec state.

### 4. Integration test — snapshot state immutability

Verify that the `choose` callback's snapshot state is not mutated during kernel effect execution. Compare snapshot before and after a guided completion call.

### 5. E2E test — determinism with guided completion

Run full FITL simulation with guided VC agent across multiple seeds. Verify:
- Same seed = same final state hash (determinism)
- Simulation completes without errors

### 6. Golden test — policy catalog with guidance config

Update or create a golden file for the FITL compiled `AgentPolicyCatalog` that includes `completionGuidance` and `completionScoreTerms`. Verify compiled output matches golden.

### 7. Property tests — guided completion safety

Random play for N turns with guidance-enabled VC agent:
- No crashes
- No invalid states (var bounds, token invariants)
- Guided completion never selects options outside the legal set
- Guided completion never increases total completion count beyond `completionsPerTemplate`

## Files to Touch

- `data/games/fire-in-the-lake/*.md` (modify — add `completionGuidance` and `completionScoreTerms` to VC profile)
- `packages/engine/test/integration/agents/fitl-guided-completion.test.ts` (new)
- `packages/engine/test/e2e/fitl-guided-determinism.test.ts` (new)
- `packages/engine/test/fixtures/golden-policy-catalog-guided.json` (new — golden file)

## Out of Scope

- Texas Hold'em guided completion (no agent profiles defined yet for TH)
- Performance benchmarks comparing guided vs unguided
- Evolution pipeline integration (spec 14, not yet started)
- Runner/UI changes (guided completion is engine-only)
- FITL event card guided completion (events don't use the agent pipeline)
- Policy contract centralization across validator/compiler/schema ownership (ticket `010`)

## Acceptance Criteria

### Tests That Must Pass

1. Integration: FITL spec with guidance-enabled VC profile compiles without errors
2. Integration: guided completion selects policy-preferred zone over random for a known Rally scenario
3. Integration: snapshot state is not mutated during guided completion
4. E2E: guided FITL simulation is deterministic (same seed = same hash) across 5+ seeds
5. E2E: guided FITL simulation completes without crashes for 15 seeds
6. Golden: compiled policy catalog matches golden file
7. Property: 100 random turns with guided VC agent — no crashes, no invalid states, no illegal option selections
8. Existing suite: `pnpm -F @ludoforge/engine test` — all pass (including all new tests)
9. Full suite: `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

### Invariants

1. Non-VC factions (US, ARVN, NVA) are unaffected — no `completionGuidance` on their profiles.
2. FITL compilation without guidance (if VC profile's guidance is disabled) produces identical output to pre-spec compilation.
3. Foundation #5 (Determinism): proven by E2E seed-determinism tests.
4. Foundation #11 (Testing as Proof): determinism, correctness, and safety properties all proven by automated tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/fitl-guided-completion.test.ts` — compilation + behavioral tests
2. `packages/engine/test/e2e/fitl-guided-determinism.test.ts` — seed-determinism + crash-safety tests
3. `packages/engine/test/fixtures/golden-policy-catalog-guided.json` — golden reference

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "guided"` (targeted)
2. `pnpm -F @ludoforge/engine test:e2e` (E2E suite)
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
