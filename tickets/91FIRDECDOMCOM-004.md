# 91FIRDECDOMCOM-004: Equivalence tests (compiled vs interpreter)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — tests only
**Deps**: 91FIRDECDOMCOM-003 (cache + integration)

## Problem

The compiled first-decision domain checks must produce identical
admissibility results to the existing `isMoveDecisionSequenceAdmittedForLegalMove`
interpreter for ALL game states. This ticket adds equivalence tests that
prove zero false negatives (compiled says "not admissible" when interpreter
says "admissible") and zero false positives across a corpus of deterministic
game states.

Additionally, for single-decision actions, the compiled `domain`
(`ChoiceOption[]`) must exactly match the interpreter's `ChoiceRequest.options`.

## Assumption Reassessment (2026-03-28)

1. Spec 90 established the equivalence test pattern in
   `test/integration/compiled-condition-equivalence.test.ts` using
   `compiled-condition-production-helpers.ts`. The same pattern applies:
   build FITL production spec, sample states, compare compiled vs interpreter.
2. `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
   produces the FITL GameDef for testing.
3. `isMoveDecisionSequenceAdmittedForLegalMove` in `move-decision-sequence.ts`
   returns a boolean. The compiled check also returns a boolean
   (`admissible`). Direct comparison.
4. `legalChoicesDiscover` returns a `ChoiceRequest` with `.options` for
   the first decision. For single-decision domain equivalence, compare
   compiled `domain` against `ChoiceRequest.options`.

## Architecture Check

1. Equivalence tests are the primary proof of correctness (F11 — Testing
   as Proof). They run compiled and interpreter paths side-by-side across
   many states and verify agreement.
2. Uses the production FITL spec — not toy fixtures. This catches real-world
   pattern coverage issues that synthetic tests might miss.
3. No production code changes. Test-only ticket.

## What to Change

### 1. Create equivalence test helpers

```typescript
// first-decision-production-helpers.ts
interface FirstDecisionSample {
  readonly actionId: ActionId;
  readonly state: GameState;
  readonly compiledResult: FirstDecisionDomainResult;
  readonly interpreterAdmissible: boolean;
  readonly interpreterChoiceRequest?: ChoiceRequest; // for single-decision domain check
}

function buildFirstDecisionSamples(
  def: GameDef,
  corpus: readonly GameState[],
): readonly FirstDecisionSample[];

function summarizeFirstDecisionCoverage(
  def: GameDef,
): { total: number; compilable: number; patterns: Record<string, number> };
```

### 2. Create equivalence test

For each compilable action across N deterministic game states:
- Call `compiled.check(state, activePlayer)` to get `admissible`.
- Call `isMoveDecisionSequenceAdmittedForLegalMove(def, state, move, ...)`
  to get interpreter boolean.
- Assert: `compiled.admissible === false` implies `interpreter === false`
  (no false negatives).
- Assert: `compiled.admissible === true` implies `interpreter === true`
  (no false positives for single-decision bypass).

For single-decision actions:
- Compare compiled `domain` against `legalChoicesDiscover(...)` result's
  `.options` — values, legality, and illegalReason must match.

### 3. Create coverage summary test

Assert that a meaningful fraction of FITL actions have compilable
first-decision patterns (e.g., >30%). This serves as a regression gate —
if coverage drops, something broke in the pattern matchers.

## Files to Touch

- `packages/engine/test/integration/first-decision-equivalence.test.ts` (new)
- `packages/engine/test/helpers/first-decision-production-helpers.ts` (new)

## Out of Scope

- Modifying any production code.
- Event card equivalence (event cards are excluded from compilation per spec).
- Performance measurement — that is 91FIRDECDOMCOM-005.
- Fixing bugs found by equivalence tests — those would be patches to 001-003.
- Texas Hold'em equivalence (FITL is the primary validation game for this
  optimization; Hold'em can be added later if needed).

## Acceptance Criteria

### Tests That Must Pass

1. **Zero false negatives**: For every compilable action across the state
   corpus, if the compiled check returns `admissible: false`, the interpreter
   also returns `false` (NOT admissible).
2. **Zero false positives (single-decision)**: For every single-decision
   compilable action, if the compiled check returns `admissible: true`, the
   interpreter also returns `true`.
3. **Domain fidelity**: For every single-decision compilable action where
   compiled check returns a non-empty `domain`, the domain values match
   `legalChoicesDiscover` result's `.options` values exactly (same set of
   `ChoiceOption.value` entries, same `legality` flags).
4. **Coverage gate**: At least 30% of FITL pipeline actions have compilable
   first-decision patterns.
5. **No interpreter regression**: All pre-existing integration and e2e tests
   pass without weakening assertions.
6. Existing suite: `pnpm turbo test --force`

### Invariants

1. The equivalence test uses the PRODUCTION FITL spec (not toy fixtures).
2. The state corpus is generated deterministically (fixed seeds) so tests
   are reproducible.
3. The test compares BOTH admissibility boolean AND domain contents (for
   single-decision actions).
4. The test does not modify game state or GameDef — read-only comparison.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/first-decision-equivalence.test.ts` —
   Side-by-side comparison of compiled vs interpreter for all compilable
   actions across deterministic state corpus.
2. `packages/engine/test/helpers/first-decision-production-helpers.ts` —
   Helper functions for building samples and summarizing coverage.

### Commands

1. `pnpm -F @ludoforge/engine test:integration 2>&1 | grep -E 'first-decision|equivalence|FAIL'`
2. `pnpm turbo test --force`
