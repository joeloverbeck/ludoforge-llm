# 15GAMAGEPOLIR-006: Implement Policy Evaluator Core for Pruning, Scoring, and Tie-Breaks

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy evaluator core
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR-005-add-agentpolicycatalog-runtime-ir-schema-and-fingerprints.md

## Problem

The compiled policy IR is not useful until the engine can deterministically evaluate concrete legal moves. The core evaluator must handle canonical ordering, feature evaluation, pruning, scoring, and tie-break resolution without preview first.

## Assumption Reassessment (2026-03-19)

1. The compiled `GameDef.agents` catalog already exists in `packages/engine/src/kernel/types-core.ts` and is lowered by `packages/engine/src/cnl/compile-agents.ts`, but there is still no runtime policy evaluator, no `PolicyAgent`, and no factory/descriptor integration for authored policies.
2. The current agent runtime boundary is still `random` / `greedy` only in `packages/engine/src/agents/factory.ts`; this ticket must not couple authored-policy execution to `GreedyAgent` or rely on template completion/search behavior.
3. `packages/engine/src/kernel/move-identity.ts` already provides a canonical move-identity helper. The evaluator should reuse that boundary for deterministic ordering rather than inventing a second move-key format unless a stricter stable serialization is genuinely required.
4. The listed unit/property test directories exist, but the evaluator tests need to be new direct runtime tests against the evaluator module itself. They should not assume pre-existing `PolicyAgent` wiring.
5. Additional discrepancy: the compiler currently permits `metric.*` refs, but the present `DerivedMetricDef` runtime contract does not yet provide enough generic evaluation metadata for all metric computations. This ticket should not paper over that gap with game-specific logic.
6. Corrected scope: this ticket should add the first reusable non-preview evaluation runtime over already-concrete legal moves, plus focused tests, for the policy-visible surfaces that are already runtime-computable from current contracts (`seat.*`, `turn.*`, candidate built-ins, `var.global.*`, `var.seat.*`, and `victory.currentMargin/currentRank.*`). Preview execution, `metric.*` runtime support, seat-visibility masking, and policy-backed agent/factory integration remain for later tickets.

## Architecture Check

1. Building the evaluator as a standalone runtime over compiled IR and concrete legal moves is cleaner than coupling it to `GreedyAgent` or to game-specific state probes.
2. Separating preview from the non-preview core is still the right architecture. It keeps correctness, caching, and visibility enforcement reviewable in smaller slices instead of burying them inside one monolithic policy runtime.
3. The evaluator should produce structured decision metadata internally so a later `PolicyAgent` and trace layer can consume it without re-running evaluation logic. That is more robust than returning only a move from the core.
4. The evaluator must not invent a fake generic `metric.*` runtime by hardcoding per-game assumptions. If `metric.*` needs to be executable, the proper fix is a separate prerequisite that strengthens the shared metric contract.
5. No template move completion, legal-move re-enumeration, search behavior, backwards-compatibility aliases, or game-specific runtime branches should be added.

## What to Change

### 1. Implement deterministic candidate canonicalization

Add stable candidate ordering using canonical move serialization and enforce that evaluator logic starts from this canonical order.

### 2. Implement non-preview feature, aggregate, pruning, score, and tie-break execution

Support:

- state features
- candidate features without preview refs
- candidate aggregates over the current candidate set
- ordered pruning rules with `skipRule` and `error`
- score term accumulation
- deterministic tie-breaker resolution including `stableMoveKey`
- explicit rejection/failure metadata when the compiled profile requires preview-only work that this ticket intentionally does not implement yet
- explicit rejection/failure metadata when expressions require currently unsupported runtime surfaces such as `metric.*`

### 3. Add emergency fallback and evaluator result metadata

Keep the core evaluator structured enough to surface failure metadata. The clean boundary is:

- evaluator core returns a structured result with candidate ordering / failure information
- a thin caller-level fallback path may choose the canonical first legal move when asked to degrade gracefully

Do not hide architecture or authoring bugs by silently swallowing them inside generic helpers.

## File List

- `packages/engine/src/agents/policy-eval.ts` (new)
- `packages/engine/src/agents/index.ts` (modify to export the evaluator if appropriate)
- `packages/engine/src/agents/policy-expr.ts` (modify only if evaluator-safe shared helpers are warranted)
- `packages/engine/src/kernel/move-identity.ts` (modify only if the existing canonical key is insufficient for stable policy ordering)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (new)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (new)

## Out of Scope

- preview execution and masking
- generic `metric.*` runtime support beyond what current shared contracts can soundly evaluate
- `PolicyAgent` / agent factory / descriptor integration
- trace-event formatting
- runner/CLI/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-eval.test.ts` proves pruning `onEmpty` semantics, score accumulation, tie-break ordering, canonical fallback behavior, and structured failure reporting for unsupported preview-dependent profiles.
2. `packages/engine/test/unit/property/policy-determinism.test.ts` proves permuting `legalMoves` does not change the selected move except through canonical RNG behavior with the same seed.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. V1 evaluates only the provided concrete legal moves and never completes templates or expands search.
2. Candidate aggregates remain bounded to `O(n)` over the current candidate set.
3. The same visible decision surface and same seed produce the same evaluator result.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — evaluator semantics without preview.
2. `packages/engine/test/unit/property/policy-determinism.test.ts` — order invariance and deterministic replay.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - corrected the ticket scope before implementation to match the real baseline: compiled policy IR already existed, but runtime evaluation, `PolicyAgent`, and factory integration did not
  - added `packages/engine/src/agents/policy-eval.ts` as a standalone non-preview evaluator over concrete legal moves, with canonical move ordering, lazy non-preview feature / aggregate evaluation, pruning, score accumulation, deterministic tie-break resolution, and structured failure metadata
  - kept the runtime boundary explicit by rejecting preview-backed profiles and currently under-specified runtime refs such as `metric.*` instead of hardcoding game-specific behavior
  - exported the evaluator from `packages/engine/src/agents/index.ts`
  - added focused runtime coverage in `packages/engine/test/unit/agents/policy-eval.test.ts` and permutation-based determinism coverage in `packages/engine/test/unit/property/policy-determinism.test.ts`
- Deviations from original plan:
  - did not introduce `PolicyAgent` or factory/descriptor integration because that would have coupled this slice to a runtime boundary that does not exist yet
  - did not implement preview execution or generic `metric.*` runtime support because those require separate shared-runtime prerequisite work for visibility and metric ownership contracts
- Verification results:
  - `pnpm -C packages/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js`
  - `pnpm -C packages/engine lint`
  - `pnpm -C packages/engine test`
  - `pnpm run check:ticket-deps`
