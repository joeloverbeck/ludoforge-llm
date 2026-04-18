# 137CONWITINV-001: Parameterize `buildDeterministicFitlStateCorpus` with `{ seeds, maxPly }`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test helper only
**Deps**: `specs/137-convergence-witness-invariant-promotion.md`

## Problem

The existing helper `buildDeterministicFitlStateCorpus` at `packages/engine/test/helpers/compiled-condition-production-helpers.ts:120` hardcodes its seed list (`STATE_CORPUS_SEEDS = [11, 23, 37, 53]`) and per-seed step count (`STATE_CORPUS_STEPS_PER_SEED = 4`). Spec 137's enumeration-bounds test needs the same state-corpus generation logic over a different seed set (FITL canary seeds 1040, 1012, …) with a larger `maxPly`. A duplicate helper would violate DRY and diverge over time. Parameterizing the existing helper with an optional `{ seeds, maxPly }` argument — defaults preserving current behavior — is the minimal architectural change.

## Assumption Reassessment (2026-04-18)

1. `buildDeterministicFitlStateCorpus(def: GameDef): readonly GameState[]` exists at `packages/engine/test/helpers/compiled-condition-production-helpers.ts:120-156` with the structure described in the spec — verified during Spec 137 reassessment.
2. Four consumers call the helper today (all with single-arg `def`): `packages/engine/test/performance/compiled-condition-benchmark.test.ts`, `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts`, `packages/engine/test/integration/compiled-condition-equivalence.test.ts`, `packages/engine/test/helpers/first-decision-production-helpers.ts` — verified via grep.
3. TypeScript default-argument semantics are sufficient to preserve existing call-site behavior; no shim or adapter is needed.

## Architecture Check

1. Reuse over duplication: a parallel helper (e.g., `buildFitlCanaryStateCorpus`) would diverge in semantics and maintenance burden. The parameterized form keeps a single source of truth for deterministic FITL state-corpus construction.
2. FITL-specific helpers in `packages/engine/test/helpers/` are test infrastructure, not engine runtime. Foundation #1 (Engine Agnosticism) is preserved — no game-specific logic enters `packages/engine/src/`.
3. Foundation #14 (No Backwards Compatibility): default-argument values are a native TypeScript feature, not a compatibility shim. Existing call sites are unchanged because the new parameter is optional; this is idiomatic extension, not legacy-path preservation.

## What to Change

### 1. Extend function signature

Add an optional second parameter:

```ts
export interface FitlStateCorpusOptions {
  readonly seeds?: readonly number[];
  readonly maxPly?: number;
}

export const buildDeterministicFitlStateCorpus = (
  def: GameDef,
  options?: FitlStateCorpusOptions,
): readonly GameState[] => {
  const seeds = options?.seeds ?? STATE_CORPUS_SEEDS;
  const maxPly = options?.maxPly ?? STATE_CORPUS_STEPS_PER_SEED;
  // ... existing loop body, replacing the two constants with `seeds` / `maxPly`
};
```

Keep `STATE_CORPUS_SEEDS` and `STATE_CORPUS_STEPS_PER_SEED` as module-scope constants to document defaults.

### 2. Document `maxPly` semantics

Add a short JSDoc comment above the exported function:

```ts
/**
 * Generates a deterministic state corpus from the FITL production GameDef.
 *
 * For each seed, steps through legal moves using deterministic index selection
 * (`moves[(seed + step) % moves.length]`). The corpus may include fewer than
 * `maxPly + 1` states per seed if the game terminates or stalls earlier.
 */
```

### 3. Verify consumer compatibility

After the change, confirm that all four existing consumers call the helper with single-arg form and produce identical output to the pre-change behavior. No consumer edits are required.

## Files to Touch

- `packages/engine/test/helpers/compiled-condition-production-helpers.ts` (modify)

## Out of Scope

- Renaming the helper (e.g., to `buildFitlCanaryStateCorpus`). Keep the existing name to avoid consumer churn.
- Moving the helper to a different file (e.g., `production-spec-helpers.ts`). Relocation is not necessary to unlock the new consumer in ticket 003.
- Updating any of the four existing consumer call sites. Defaults preserve their behavior.
- Adding the spec-137 enumeration-bounds test — that is ticket 003.

## Acceptance Criteria

### Tests That Must Pass

1. `buildDeterministicFitlStateCorpus(def)` (no options) returns the same corpus it did before this change. Proven indirectly by the four existing consumer tests passing unchanged: `compiled-condition-benchmark.test.ts`, `enumeration-snapshot-benchmark.test.ts`, `compiled-condition-equivalence.test.ts`, and any tests touching `first-decision-production-helpers.ts`.
2. `buildDeterministicFitlStateCorpus(def, { seeds: [1040, 1012], maxPly: 60 })` returns a corpus derived from the two provided seeds, stepping up to 60 plies per seed. Consumed in ticket 003.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Determinism**: same `def` + same `options` → same `GameState[]` ordering and content. No wall-clock or nondeterministic inputs enter the helper.
2. **Default preservation**: `buildDeterministicFitlStateCorpus(def)` produces byte-identical output to the pre-change function for the default seed set and step count.

## Test Plan

### New/Modified Tests

No dedicated unit test for the parameterization itself — the change is too thin to warrant a standalone test, and correctness is covered by the four existing consumers plus the downstream enumeration-bounds test in ticket 003.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint typecheck`

## Outcome

Completion date: 2026-04-18

Implemented `FitlStateCorpusOptions` and extended
`buildDeterministicFitlStateCorpus(def, options?)` to accept optional
`{ seeds, maxPly }` overrides while preserving the existing default seed list
and ply count. Added the requested JSDoc documenting deterministic move
selection and the reduced-corpus behavior when a trajectory terminates or
stalls early.

Existing consumers remained unchanged and passed with the default single-arg
call form.

Deviations from original plan: none.

Verification results:

- `pnpm turbo lint typecheck` — passed
- `pnpm -F @ludoforge/engine test` — passed
