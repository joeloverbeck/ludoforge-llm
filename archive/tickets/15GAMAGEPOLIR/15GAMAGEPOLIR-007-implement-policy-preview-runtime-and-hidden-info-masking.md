# 15GAMAGEPOLIR-007: Implement Policy Preview Runtime and Hidden-Info Masking

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — preview runtime and visibility-safe evaluation
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-004-add-policy-visibility-metadata-and-canonical-seat-binding-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-014-make-policy-metric-refs-executable-through-generic-runtime-contracts.md

## Problem

Spec 15 allows one-ply preview-backed heuristics, but only if preview stays deterministic, cached, and masked against hidden information. Without a dedicated preview runtime, policies either cannot express preview terms or will leak state they must not see.

## Assumption Reassessment (2026-03-19)

1. The kernel already has move application machinery, but Spec 15 explicitly forbids handing raw `applyMove` access to policy logic.
2. Ticket `15GAMAGEPOLIR-014` already made current-state `metric.*` executable through the shared runtime contract, so preview work must reuse that resolver rather than reopening metric ownership.
3. Ticket `15GAMAGEPOLIR-004` intentionally kept the current policy surface as an allowlist boundary and did not add fine-grained compiled visibility metadata for vars/metrics/victory refs. That means this ticket cannot honestly promise per-ref acting-seat visibility classification yet.
4. Corrected scope: this ticket should add a dedicated preview runtime and wire preview-backed expressions into evaluator execution, but it must use conservative masking when preview safety cannot be proven generically from current contracts.
5. Preview semantics must return `unknown` for hidden/random/unresolved data, must not recurse, and must not enumerate future legal moves.

## Architecture Check

1. A dedicated preview module is cleaner than embedding preview behavior inside the evaluator because masking and caching are their own correctness boundary.
2. With no per-surface compiled visibility metadata yet, the robust interim design is conservative: if preview consumes RNG, leaves follow-up/stochastic work unresolved, or the resulting state still requires hidden sampling for the acting player, preview refs resolve to `unknown` instead of guessing visibility.
3. This keeps perfect-information preview useful today while preventing preview from becoming a hidden-information side channel in imperfect-information games.
4. No recursive preview, follow-up decision completion, or hidden-zone introspection should be allowed.

## What to Change

### 1. Implement generic preview application and caching

Add a preview service that:

- applies a concrete candidate one ply
- caches preview results per surviving candidate
- never re-enumerates legal moves

### 2. Mask preview refs through policy visibility rules

Ensure preview-exposed refs return `unknown` when preview safety cannot be established generically, including when the previewed move depends on:

- hidden information
- future randomness
- unresolved follow-up choices

Use the existing observation/hidden-sampling boundary conservatively instead of inventing fake fine-grained visibility metadata inside the preview layer.

### 3. Integrate preview-backed feature/aggregate evaluation

Enable preview cost-class work only after cheaper phases and only for surviving candidates.

## File List

- `packages/engine/src/agents/policy-preview.ts` (new)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (new)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (new)

## Out of Scope

- `PolicyAgent` factory wiring
- trace formatting and diagnostics output
- runner/CLI descriptor migration
- authored FITL/Texas baseline profiles

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview results are cached per candidate and that random/hidden/unresolved preview states resolve to `unknown` instead of leaking data.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` proves preview-backed expressions execute lazily for surviving candidates and reuse cached preview results.
3. `packages/engine/test/unit/property/policy-visibility.test.ts` proves two states that differ only in acting-seat-invisible hidden data produce identical preview-backed policy evaluation outputs under the conservative masking contract.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview exposes only deterministic, acting-seat-visible refs or `unknown`.
2. Preview evaluation is lazy and only runs for surviving candidates.
3. Hidden information unavailable to the acting seat cannot change pruning, scores, tie-breaks, or the selected move.
4. Until explicit compiled visibility metadata exists for preview surfaces, uncertain cases must mask to `unknown` rather than attempt ad hoc per-game interpretation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview caching plus conservative masking coverage.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — lazy evaluator integration for preview-backed terms.
3. `packages/engine/test/unit/property/policy-visibility.test.ts` — hidden-information invariance under conservative masking.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed:
  - corrected the ticket scope before implementation to match the current repo: current-state `metric.*` execution already existed, but fine-grained compiled visibility metadata for preview surfaces still does not
  - added `packages/engine/src/agents/policy-preview.ts` as a dedicated one-ply preview runtime that caches per-candidate preview results and resolves `preview.var.*`, `preview.metric.*`, and `preview.victory.*` through the existing generic runtime contracts
  - wired `packages/engine/src/agents/policy-eval.ts` to execute preview-backed features, aggregates, score terms, and tie-breakers lazily instead of rejecting all preview refs outright
  - implemented conservative masking so preview refs resolve to `unknown` whenever preview safety cannot be proven generically from current contracts: unresolved/incomplete preview, RNG consumption, or resulting states that still require hidden sampling for the acting player
  - added focused preview-runtime tests in `packages/engine/test/unit/agents/policy-preview.test.ts`, extended `packages/engine/test/unit/agents/policy-eval.test.ts` to cover preview-backed scoring, and added `packages/engine/test/unit/property/policy-visibility.test.ts` to lock hidden-information invariance under the conservative masking contract
- Deviations from original plan:
  - did not implement fake fine-grained preview visibility classification for individual vars/metrics/victory refs because the compiled/runtime contracts still do not carry that metadata generically
  - instead of exposing potentially unsafe partial preview data in imperfect-information states, the runtime now masks the entire preview surface to `unknown` in uncertain cases; this is intentionally conservative and keeps the architecture honest until a follow-on ticket adds explicit preview-surface visibility ownership
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
