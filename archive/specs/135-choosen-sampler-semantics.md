# Spec 135: chooseN Sampler Semantics and Caller-Retry Bias

**Status**: COMPLETED
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 16 [template-completion-contract] (archived; completed 2026-04-17)
**Source**: FOUNDATIONS-driven cleanup. The chooseN sampler at `packages/engine/src/kernel/move-completion.ts:67` currently encodes a hardcoded "prefer non-empty" bias (`sampledMin = 1 if min === 0 && max > 0 && options.length > 0`) that silently rewrites the spec-declared `min: 0` at runtime. This violates FOUNDATIONS #1 (Engine Agnosticism), #7 (Specs Are Data), and #15 (Architectural Completeness) because a game-agnostic engine decision overrides game-authored declared cardinality without surfacing the override, and the patch exists at the wrong architectural layer — the bias's purpose is dead-end recovery on the retry path, not a per-choice-point semantic.

## Overview

Remove the hardcoded "prefer non-empty" rewrite inside `selectFromChooseN`. Make the sampler a pure, uniform sampler over `[min, max]`. Relocate the bias to the caller-retry layer (`prepare-playable-moves.ts`) where it is *observable* (a warning is emitted) rather than *silent*, and where it applies only when a first-attempt sample has actually dead-ended — not on every chooseN draw.

## Problem Statement

`packages/engine/src/kernel/move-completion.ts:67` currently contains:

```ts
const sampledMin = min === 0 && max > 0 && options.length > 0 ? 1 : min;
const [count, rng1] = nextInt(rng, sampledMin, max);
```

This line:

1. **Silently rewrites a spec-authored `min: 0` to `min: 1` at runtime.** A spec that declares "choose 0..N items" in fact means "choose 1..N items" under the current engine. The engine overrides the spec value without surfacing the override to the spec author.
2. **Applies universally, regardless of whether the `chooseN` is part of an effect where empty is semantically valid or one where empty chains into an invalid action.** The bias cannot distinguish between "empty is fine" and "empty will dead-end downstream."
3. **Patches the symptom, not the root cause.** The bias was rationalized as supporting the Spec 16 §2 archived guidance ("Completion MUST NOT systematically prefer the empty branch when at least one non-empty satisfiable branch exists"). But §2's concern is about *dead-end recovery* — the situation where the non-empty branch is the only one that leads to a completed move. That concern lives at the retry layer, which observes `drawDeadEnd` and retries, not at the sampler, which cannot see downstream satisfiability.

This violates:

- **FOUNDATIONS #1 (Engine Agnosticism)**: a game-agnostic engine decision rewrites game-authored spec semantics.
- **FOUNDATIONS #7 (Specs Are Data)**: the spec's declared `min: 0` is not the value the engine samples against. The mismatch is invisible to anyone reading the spec.
- **FOUNDATIONS #15 (Architectural Completeness)**: the agent-stuck root cause (drawDeadEnd recovery) is masked at the sampler rather than fixed at the caller-retry layer, which is the only layer that knows the draw led to a dead-end.

## Goals

- The chooseN sampler samples counts uniformly in `[spec.min, spec.max]`, always, with no runtime rewrite.
- The "prefer non-empty" bias is relocated to `prepare-playable-moves.ts`'s existing retry loop and applies only when a first-attempt sample of count = 0 results in a `drawDeadEnd`.
- The relocated bias is observable via a new `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning, making the behavior auditable.
- Existing agent-stuck protections (the Spec 16 § 2 guidance operationalized via the retry chain from ticket 132AGESTUVIA-004) continue to hold — no observable regression on FITL production seeds.
- The `move-completion-retry.test.ts` §2 proof is migrated to assert the bias via retry-warning observation rather than first-attempt sampling.

## Non-Goals

- No change to the RNG algorithm (PCG / xoshiro — unchanged).
- No change to `nextInt`'s contract.
- No per-game or game-specific sampler behavior.
- No new DSL-surface flags on chooseN (e.g., `preferNonEmpty`). The bias lives in the retry layer, not the spec.
- No change to Spec 16 §1 (outcome-class taxonomy) or §3/§4/§5.
- No change to how `distributeTokens` lowers to `chooseN`. See Out of Scope below — the compiler-side defaults for `distributeTokens` (whether `max`-only should mean "exactly max up to availability" vs. "random in `[0, max]`") are the subject of a separate follow-up spec.

## Definitions

### Declared chooseN cardinality

The `min` / `max` values authored in GameSpecDoc YAML or lowered by the compiler from macro expansions. These are the canonical contract between spec and engine.

### Sampled count

The integer returned by `nextInt(rng, min, max)` inside `selectFromChooseN`. After this spec, it must equal a uniform sample from `[min, max]` — with no runtime rewrite under any condition.

### Caller retry layer

`prepare-playable-moves.ts`'s `attemptTemplateCompletion` retry loop and its interaction with `completeTemplateMove`'s `drawDeadEnd` outcome. This layer already governs dead-end recovery: when the first attempt fails, the loop grants up to `NOT_VIABLE_RETRY_CAP = 7` additional attempts with freshly forked child RNG streams. The relocated bias piggybacks on this loop by re-parameterizing retry attempts when the failed draw was a count = 0 sample on an optional chooseN.

## Contract

### 1. Sampler purity

`selectFromChooseN(options, min, max, rng)` samples `count ∈ [min, max]` uniformly via `nextInt(rng, min, max)`. No per-call rewrite of `min` or `max`. This is an architectural invariant, not a policy. It is provable by unit test.

### 2. Caller-retry bias

The `prepare-playable-moves.ts` retry loop gains a per-attempt bias hint. The mechanism:

- `completeTemplateMove` accepts a new optional parameter on `TemplateMoveCompletionOptions` (the existing options record): `retryBiasNonEmpty?: boolean` (default `false`). When set, any optional chooseN (`min === 0 && max > 0 && options.length > 0`) encountered during this completion samples with `min` clamped to `1` **at the sampler layer**, via the same mechanism as today — but driven by an explicit caller hint rather than an unconditional sampler rewrite.
- The sampler itself remains pure (Contract §1). The clamping logic lives at the call site in `chooseAtRandom`, which reads the completion options record and clamps `min` before calling `selectFromChooseN`. This preserves Contract §1 as an invariant of `selectFromChooseN` while letting the completion-options record express the retry-layer bias.
- `attemptTemplateCompletion` tracks the most recent `drawDeadEnd` outcome's diagnostic payload. When the loop decides to grant an additional retry (the existing `drawDeadEnd`/`notViable` branch), and the prior attempt's dead-end was reached via a count = 0 sample on an optional chooseN, the next call to `completeTemplateMove` passes `retryBiasNonEmpty: true`.
- On the biased retry, the loop emits a `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning identifying the attempt index, the RNG stream provenance, and the chooseN decision key. The warning surfaces through the existing completion diagnostic channel.
- The bias is not applied to the first attempt. First attempts remain purely declarative. This preserves the "specs are data" contract: the spec's declared `min: 0` is honored on the first attempt; bias is purely a recovery mechanism.

`playable-candidate.ts`, the other caller of `completeTemplateMove`, passes `retryBiasNonEmpty: false` (the default) — it is a diagnostic caller, not a retry driver.

### 3. Spec 16 §2 interpretation (this spec only — archived Spec 16 is unchanged)

Spec 135 interprets the archived Spec 16 §2 language as follows. No edit to the archived spec is proposed:

- "MAY choose empty only if semantically valid" is satisfied because the sampler now honors declared `min: 0`. A spec that declared `min: 0` is stating that empty is semantically valid; the engine respects that declaration.
- "MUST NOT systematically prefer empty" is satisfied by uniform sampling in `[min, max]` — an unbiased sampler prefers nothing, systematically or otherwise.
- The dead-end recovery behavior implied by §2 is relocated to the retry layer (Contract §2) where it is observable and applies only when a dead-end has actually occurred.

### 4. Migration

Test fixtures that relied on the hidden first-attempt bias are migrated in the same change:

- `packages/engine/test/unit/kernel/move-completion-retry.test.ts` §2 ("prefers non-empty optional chooseN branches when they are satisfiable"): migrated to assert the bias via retry-warning observation (i.e., the test asserts the completion emits `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` at least once across the seed range, and eventually completes to the non-empty branch).
- `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` if it asserts properties dependent on first-attempt bias: migrated using the same retry-warning pattern. The full audit of this file is part of the ticket.
- No production YAML is touched — the bias was universal at the engine, so no GameSpecDoc author opted into it.

## Required Invariants

1. Grep for `sampledMin` in `packages/engine/src/` returns zero matches after migration.
2. A `chooseN` with `min: 0, max: N, options.length ≥ 1` sampled by `selectFromChooseN` has a non-zero probability of returning count = 0 under uniform distribution across seeds. This is provable by the new purity test.
3. Under the retry layer, a first attempt sampling count = 0 that leads to `drawDeadEnd` triggers a biased retry (emitting `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY`) on the next iteration of the `attemptTemplateCompletion` loop.
4. No canary regression on FITL production seeds — the observable outcome of `preparePlayableMoves` for any given state is unchanged modulo the bias moving from first-attempt to retry.

## Foundations Alignment

- **#1 Engine Agnosticism**: after this spec, the sampler is purely generic — no hidden preferences, no game-coupled heuristic.
- **#7 Specs Are Data**: a spec's declared `min` is the `min` used at runtime on first attempt. The retry-layer bias is an engine recovery mechanism, not a spec semantic; it is observable via warning.
- **#10 Bounded Computation**: unchanged. The retry loop's `NOT_VIABLE_RETRY_CAP = 7` bound is unchanged.
- **#14 No Backwards Compatibility**: the silent sampler rewrite is deleted in the same change that introduces the retry-layer replacement — no shim, no dual path.
- **#15 Architectural Completeness**: the agent-stuck recovery is relocated to the layer that owns dead-end recovery. The sampler stops making decisions it is not positioned to make; the retry layer takes them on with the context (dead-end occurred) that makes them justifiable.
- **#16 Testing as Proof**: a new sampler-purity unit test proves Contract §1 by construction.

## Required Proof

### Unit / Kernel Proof

1. New test: `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts` asserts uniform sampling in `[min, max]` for declared `min: 0, max: N` across a deterministic seed range. The count distribution must include 0 (proving no hidden clamp). The test must also cover `min: 1, max: N` and `min: 2, max: N` to prove the sampler respects arbitrary declared minimums.
2. Migrated test: `move-completion-retry.test.ts` §2 asserts that across the same seed range, at least one attempt emits `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY`, and every run eventually completes to the non-empty branch — proving the retry-layer bias is operative.

### Integration Proof

- No production FITL canary seed regresses under the migration. Simulation replay tests on the existing FITL canary set pass byte-identical serialized state modulo any RNG trajectory shift caused by the bias relocation. Any trajectory shift must be explicitly reviewed and blessed during implementation; the expectation is that most canaries are unaffected because the sampler only biased optional chooseN with empty options, which is a narrow path.

## Implementation Direction

1. **Sampler purity**: `packages/engine/src/kernel/move-completion.ts:selectFromChooseN` — delete the `sampledMin` computation. Call `nextInt(rng, min, max)` directly.

2. **Retry-bias threading**:
   - `TemplateMoveCompletionOptions` (defined alongside `completeTemplateMove` in `move-completion.ts`) — add `retryBiasNonEmpty?: boolean`.
   - `chooseAtRandom` in `move-completion.ts` — when `retryBiasNonEmpty === true` and the chooseN is optional (`min === 0 && max > 0 && options.length ≥ 1`), clamp the `min` passed to `selectFromChooseN` to `1`. The clamp is at the call site, not inside the sampler; Contract §1 (sampler purity) is preserved.
   - `completeTemplateMove` — thread the flag from options into `chooseAtRandom`.

3. **Retry loop bias tracking**:
   - `packages/engine/src/agents/prepare-playable-moves.ts:attemptTemplateCompletion` — when the prior attempt returned `drawDeadEnd` and the dead-end originated in a count = 0 sample on an optional chooseN, set `retryBiasNonEmpty: true` on the next `completeTemplateMove` call.
   - Detecting "dead-end from count = 0 on optional chooseN" requires a structured diagnostic on the `drawDeadEnd` outcome. Today `drawDeadEnd` carries only `rng`. Extend it with a minimal structured payload describing the first-optional-chooseN decision on the trace (key, sampled count, declared min/max). This is the same payload `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` will surface.
   - Emit the warning via the existing completion diagnostic channel. If no such channel yet threads through `attemptTemplateCompletion`, add it; do not couple the warning to `console.warn`.

4. **Other caller**: `packages/engine/src/kernel/playable-candidate.ts` — pass `retryBiasNonEmpty: false` (default). No behavioral change for diagnostic callers.

5. **Test migrations**: update `move-completion-retry.test.ts` §2 and audit `completion-contract-invariants.test.ts` for first-attempt-bias-dependent assertions.

## Out of Scope

- Other chooseN semantic knobs (e.g., `preferMax`, `orderingStrategy`) — possible future spec.
- Runner / UI-layer effects of the retry warning — the warning surfaces through the existing diagnostic channel; renderer behavior is unchanged.
- **`distributeTokens` compiler lowering defaults (follow-up spec candidate).** The current `distributeTokens { max: N }` lowering emits `chooseN { min: 0, max: N }`, which does not reflect the semantic of FITL cards like Gulf of Tonkin that declare "move 6 US pieces" (per card text) bounded by availability (per FITL rules §8.4.3, "as many as availability and stacking allow"). The correct lowering for such cards is likely `min = max` (greedy up to availability), not `min: 0`. This is a separate concern from sampler semantics and is explicitly deferred to a follow-up spec. Spec 135's motivation stands on FOUNDATIONS alignment alone; no FITL card regression is claimed as a witness here.

## Tickets

- `archive/tickets/135CHOSAMSEM-001.md` — Extend `drawDeadEnd` outcome with optional-chooseN diagnostic payload and absorb the production relocation slices
- `archive/tickets/135CHOSAMSEM-002.md` — Historical split record for `retryBiasNonEmpty` option threading
- `archive/tickets/135CHOSAMSEM-003.md` — Historical split record for retry-caller bias wiring and warning emission
- `archive/tickets/135CHOSAMSEM-004.md` — Historical split record for `sampledMin` removal and fixture migration
- `archive/tickets/135CHOSAMSEM-005.md` — Add `choose-n-sampler-purity.test.ts` proving uniform sampling

## Outcome

- 2026-04-18: Completed.
- Landed:
  - `selectFromChooseN` now samples directly over declared `[min, max]` with no hidden `sampledMin` rewrite.
  - Retry-layer recovery bias moved to `prepare-playable-moves.ts` via `retryBiasNonEmpty`, with `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning emission on qualifying retries.
  - `drawDeadEnd` now carries structured optional-chooseN diagnostics, and downstream playable-candidate rejection preserves that context when a completed move is later reclassified to a dead end.
  - Dedicated sampler-purity proof landed in `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts`.
- Deviations from original ticket split:
  - Archived `135CHOSAMSEM-001` absorbed the implementation scope originally planned for `135CHOSAMSEM-002` through `135CHOSAMSEM-004` to preserve `docs/FOUNDATIONS.md` architectural completeness.
  - Archived `135CHOSAMSEM-002` through `135CHOSAMSEM-004` remain as historical split records only.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion-draw-dead-end-payload.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-contract-invariants.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion-retry.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/playable-candidate.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/prepare-playable-moves-retry.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/prepare-playable-moves.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/choose-n-sampler-purity.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
