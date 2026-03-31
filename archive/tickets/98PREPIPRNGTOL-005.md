# 98PREPIPRNGTOL-005: End-to-end tests, golden update, and FITL profile opt-in

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test fixtures, golden files, FITL profile YAML
**Deps**: 98PREPIPRNGTOL-001, 98PREPIPRNGTOL-002, 98PREPIPRNGTOL-003, 98PREPIPRNGTOL-004

## Problem

All the plumbing is in place, but there are no end-to-end tests proving the preview pipeline now produces values for complex games. This ticket adds the comprehensive test suite required by Spec 98, updates the golden file, and opts the FITL VC agent profile into RNG tolerance.

## Assumption Reassessment (2026-03-31)

1. `packages/engine/test/unit/agents/policy-preview.test.ts` exists — unit tests go here. ✅ Many unit tests (stochastic trace, backward compat, surface resolution, trusted indexed stochastic) already added by tickets 003/004.
2. `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` exists — but the golden test uses US seat with `us-baseline` profile, so adding `tolerateRngDivergence` to VC profile won't change the summary golden. The **catalog** golden (`fitl-policy-catalog.golden.json`) WILL change.
3. FITL agent profiles live in `data/games/fire-in-the-lake/92-agents.md`. The VC profile is named `vc-evolved` (not "vc-agent"), bound to `vc` seat. It already has `completionGuidance: { enabled: true, fallback: random }`.
4. `packages/engine/test/unit/policy-production-golden.test.ts` runs the golden comparison. ✅
5. Texas Hold'em tests should remain unchanged (different failure mode — hidden information, not RNG). ✅
6. Compilation round-trip tests already exist at `packages/engine/test/unit/compile-agents-authoring.test.ts` (lines 776-886). ✅ No new compilation tests needed.

## Architecture Check

1. **Test-as-proof (F11)**: Each spec testing requirement maps to a specific test case.
2. **Agnostic**: Tests cover both FITL (RNG-heavy) and Texas Hold'em (hidden-info-heavy) to prove game-agnosticism.
3. **No shims**: Golden file updated to reflect new `'stochastic'` outcome type, not dual-formatted for old/new.

## What to Change

### 1. Unit tests in `policy-preview.test.ts`

Add test cases matching Spec 98 requirements:

- **Determinism test**: Same state + same policy with `tolerateRngDivergence: true` produces identical preview values across 3+ repeated runs.
- **Backward compatibility test**: Profile without `preview` (or with `tolerateRngDivergence: false`) still gets `{ kind: 'unknown', reason: 'random' }` for RNG-divergent previews.
- **Stochastic trace test**: When `tolerateRngDivergence: true` and RNG diverges, `getOutcome()` returns `'stochastic'`.
- **Surface resolution on stochastic**: `resolveSurface` returns `{ kind: 'value', value: <number> }` for stochastic outcomes.

### 2. Compilation round-trip test

Add a test (in compile-agents test file or a new focused file) that:
- Compiles a profile YAML with `preview: { tolerateRngDivergence: true }`
- Asserts `compiledProfile.preview.tolerateRngDivergence === true`
- Compiles a profile YAML without `preview`
- Asserts `compiledProfile.preview === undefined`

### 3. FITL integration test

Using `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`:
- Compile the FITL spec with the opted-in profile
- Run a preview for a Rally move (or similar RNG-touching action)
- Assert the preview outcome is `'stochastic'` (not `'unknown'`)
- Assert `preview.victory.currentMargin.self` resolves to a number (not `unknown`)

### 4. Golden file update

Regenerate `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` to include the new `'stochastic'` outcome type where applicable.

### 5. FITL VC agent profile YAML update

Add to the vc-agent profile:

```yaml
preview:
  tolerateRngDivergence: true
```

### 6. Cross-game sanity test

Verify Texas Hold'em preview behavior is unchanged — previews that fail due to hidden information still return `{ kind: 'unknown', reason: 'hidden' }`, not affected by the RNG tolerance flag.

## Files to Touch

- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/policy-production-golden.test.ts` (modify — if golden format changes)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (modify)
- `data/games/fire-in-the-lake/*.md` (modify — FITL vc-agent profile)
- `packages/engine/test/unit/cnl/compile-agents.test.ts` (modify — compilation round-trip test)

## Out of Scope

- Preview runtime logic changes (done in 98PREPIPRNGTOL-003)
- Type/schema/contract/compiler changes (done in 98PREPIPRNGTOL-001 through -004)
- Texas Hold'em profile changes (it doesn't need RNG tolerance — its issues are hidden-info-based)
- Multi-state preview or expected-value computation
- Any kernel effect execution or move enumeration changes
- Performance benchmarks (spec says no regression expected)

## Acceptance Criteria

### Tests That Must Pass

1. **Determinism**: 3 repeated preview evaluations with same seed, same policy (`tolerateRngDivergence: true`) → identical values
2. **Preview value**: FITL Rally (or equivalent RNG-touching) move produces `{ kind: 'value', value: <number> }` for `preview.victory.currentMargin.self`
3. **Backward compat**: Profile without `preview` → RNG-divergent previews still return `{ kind: 'unknown', reason: 'random' }`
4. **Stochastic trace**: `getOutcome()` returns `'stochastic'` when RNG diverges and flag is on
5. **Golden test**: `fitl-policy-summary.golden.json` matches regenerated output
6. **Cross-game**: Texas Hold'em preview behavior unchanged
7. **Compilation**: `preview: { tolerateRngDivergence: true }` compiles; missing field defaults correctly
8. Full suite: `pnpm -F @ludoforge/engine test`
9. Full suite: `pnpm turbo typecheck`
10. Full suite: `pnpm turbo lint`

### Invariants

1. Same seed + same policy + same state = identical agent decision (determinism preserved)
2. `allowWhenHiddenSampling` contract still honored — stochastic outcomes still check hidden sampling visibility
3. Texas Hold'em tests pass without modification
4. No game-specific logic in engine code — only YAML profile changes are game-specific

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — determinism, backward compat, stochastic trace, surface resolution tests
2. `packages/engine/test/unit/cnl/compile-agents.test.ts` — compilation round-trip for preview config
3. `packages/engine/test/unit/policy-production-golden.test.ts` — golden comparison with updated fixture
4. Integration test for FITL preview with tolerance (may go in an existing FITL integration test file)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern 'preview'`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern 'golden'`
3. `pnpm -F @ludoforge/engine test -- --test-name-pattern 'compile.*agent'`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm -F @ludoforge/engine test`

## Outcome

**Completion date**: 2026-03-31

**What changed**:
- `packages/engine/test/unit/agents/policy-preview.test.ts` — added determinism test (3 repeated runs with same seed/state/tolerateRngDivergence assert identical results)
- `data/games/fire-in-the-lake/92-agents.md` — added `preview: { tolerateRngDivergence: true }` to the `vc-evolved` profile
- `packages/engine/test/integration/fitl-policy-agent.test.ts` — added compilation verification test (vc-evolved has preview config, other profiles do not) and stochastic preview outcome integration test (modified overlay with `allowWhenHiddenSampling: true` to observe stochastic outcomes)
- `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — added cross-game sanity tests: Texas baseline has no preview config, preview behavior unchanged
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` — regenerated to reflect new vc-evolved profile fingerprint with preview config
- Compilation round-trip tests already existed from ticket 004 — no new compilation tests needed

**Deviations from plan**:
- Ticket referenced `packages/engine/test/unit/cnl/compile-agents.test.ts` — actual file is `packages/engine/test/unit/compile-agents-authoring.test.ts`. Compilation tests already existed there from prior tickets.
- Ticket said "vc-agent" profile — actual profile name is `vc-evolved`.
- FITL integration test adjusted: `vc-evolved` score terms don't use preview surface refs (they use `feature.isRally`/`feature.isTax`), so the stochastic outcome test overlays `preferProjectedSelfMargin` score term and sets `allowWhenHiddenSampling: true` to make stochastic outcomes observable. Without this, hidden sampling masks all preview outcomes as `'hidden'`.
- Summary golden (`fitl-policy-summary.golden.json`) unchanged — it tests the US seat with `us-baseline` profile, which has no preview tolerance.

**Verification**: 5160 engine tests pass, 0 failures. Typecheck and lint clean.
