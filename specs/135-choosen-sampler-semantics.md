# Spec 135: chooseN Sampler Semantics and Declarative Bias

**Status**: DRAFT
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 16 (archived; completed 2026-04-17)
**Source**: Post-ticket analysis from the Gulf of Tonkin mixed-piece-types test investigation (2026-04-17/18). That test broke when the Spec 16 §2 sampler bias (`sampledMin = 1 if min === 0 && max > 0 && options.length > 0`) silently rewrote the declared `min: 0` of an FITL card's `distributeTokens { max: 6 }` effect, shifting the sampled count in a way the card's author did not anticipate.

## Overview

Remove the engine-wide hardcoded "prefer non-empty" bias in `selectFromChooseN` and replace it with a declarative per-chooseN preference that specs can author (`preferNonEmpty: bool`, default `false`). Alternatively — if the universal bias is judged architecturally essential — move it out of the sampler and into a caller-side retry policy where the bias is *explicit* rather than *silent*.

## Problem Statement

`packages/engine/src/kernel/move-completion.ts:67` currently contains:

```ts
const sampledMin = min === 0 && max > 0 && options.length > 0 ? 1 : min;
const [count, rng1] = nextInt(rng, sampledMin, max);
```

This line:

1. Silently rewrites a spec-authored `min: 0` to `min: 1` at runtime. A spec that declares "choose 0..N items" in fact means "choose 1..N items." The engine overrides the spec value without surfacing the override to the spec author.
2. Applies universally, regardless of whether the `chooseN` is part of an effect where empty is semantically valid (e.g., `distributeTokens { max: 6 }` legitimately permits moving zero pieces) or an effect where empty leads to a dead-end (e.g., an optional choose where the empty branch chains into an invalid action).
3. Was introduced as a patch (`132AGESTUVIA-004`) for agent-stuck scenarios where the completion kept sampling the empty branch and falling into drawDeadEnd retries, and rationalized after the fact by Spec 16 §2.

Concretely, this broke the Gulf of Tonkin "mixed piece types" test: the card's `distributeTokens { max: 6 }` compiled to `chooseN { min: 0, max: 6 }`, which under the pre-132AGESTUVIA-004 sampler yielded 6 on seed 1101n. After the silent rewrite to `min: 1`, the same seed yields 1. The test failure initially looked like a real regression and consumed engineer time to diagnose.

This violates:

- **FOUNDATIONS #1 (Engine Agnosticism)**: a game-agnostic engine decision rewrites game-authored spec semantics.
- **FOUNDATIONS #7 (Specs Are Data)**: the spec's declared `min: 0` is not the value the engine samples against. The mismatch is invisible to anyone reading the spec.
- **FOUNDATIONS #15 (Architectural Completeness)**: the agent-stuck root cause is masked at the sampler rather than fixed at the caller-retry layer.

## Goals

- The chooseN sampler samples counts in `[spec.min, spec.max]`, always, with no runtime rewrite.
- Where the "prefer non-empty" bias is genuinely desired, it is declared in the spec as `preferNonEmpty: true` or expressed as an explicit caller-side retry policy.
- Existing agent-stuck protections (the spec-132 drawDeadEnd retry chain) continue to work — the bias is re-introduced at the correct layer, not removed entirely.
- The `move-completion-retry.test.ts` §2 proof ("prefers non-empty optional chooseN branches when they are satisfiable") continues to pass under whatever layer the preference moves to.

## Non-Goals

- No change to the RNG algorithm (PCG / xoshiro — unchanged).
- No change to `nextInt`'s contract.
- No per-game or game-specific sampler behavior.
- No change to Spec 16 §1 (outcome-class taxonomy) or §3/§4/§5.

## Definitions

### Declared chooseN cardinality

The `min` / `max` values authored in GameSpecDoc YAML or lowered by the compiler from macro expansions. These are the canonical contract between spec and engine.

### Sampled count

The integer returned by `nextInt(rng, sampledMin, sampledMax)` inside `selectFromChooseN`. Today this may diverge from `[min, max]` via the silent rewrite. After this spec, it must equal the range sampled by `nextInt(rng, min, max)` unless an explicit, spec-declared preference says otherwise.

### Caller retry layer

`prepare-playable-moves.ts` and `completeTemplateMove`'s drawDeadEnd-retry chain. Callers that already know how to retry on `drawDeadEnd` are the correct place to enforce "prefer non-empty" — if they sample empty and the resulting move dead-ends, they retry with a fresh RNG child-stream that is more likely to sample non-empty. This is **observable** (the retry count is visible in warnings) rather than **hidden** (the sampler silently biasing).

## Contract

### 1. Sampler purity

`selectFromChooseN(options, min, max, rng)` samples count ∈ `[min, max]` uniformly. No per-call rewrite of `min` or `max`. This is an architectural invariant, not a policy.

### 2. Declarative bias (option A — preferred)

`chooseN` gains an optional declarative field `preferNonEmpty: boolean` (default `false`). When `true`, a bias-aware sampling policy may be applied *and that is the only trigger that activates the bias*. Specs that want the old behavior (optional chooseN with non-empty preference, e.g., the `optional-retry-template` test fixture) set `preferNonEmpty: true`; specs that want pure random sampling (e.g., `distributeTokens`) leave it unset. The compiler passes the flag through to the runtime sampler.

### 3. Caller-retry bias (option B — alternative)

If option A is judged to leak policy into the DSL surface, the bias instead moves to `prepare-playable-moves.ts` or `completeTemplateMove`'s outer retry loop: when a `drawDeadEnd` outcome results from sampling count = 0 AND max > 0, the retry is re-parameterized to sample count ∈ `[1, max]`. The retry is visible as a `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning. Pure random sampling at the first attempt preserves spec fidelity; the bias kicks in only when the random attempt dead-ends.

### 4. Spec 16 §2 clarification

Spec 16 §2's language ("MAY choose empty only if semantically valid") is restated:

- "Semantically valid" is determined by the spec author, not the engine. The engine MUST NOT make this decision on behalf of the spec.
- "MUST NOT systematically prefer empty" is satisfied by uniform random sampling in `[min, max]` — an unbiased sampler prefers nothing.

### 5. Migration

Existing test fixtures that relied on the hidden `sampledMin` bias are migrated in the same change. The `optional-retry-template` fixture in `move-completion-retry.test.ts` explicitly sets `preferNonEmpty: true` (option A) or acquires the bias via caller retry observation (option B).

## Required Invariants

1. Grep for `sampledMin` in `packages/engine/src/` returns zero matches after migration.
2. A `chooseN` with `min: 0, max: N, preferNonEmpty: false` (or unset) has a non-zero probability of sampling count = 0 under any RNG seed, for at least one seed.
3. A `chooseN` with `min: 0, max: N, preferNonEmpty: true` samples count ≥ 1 whenever a satisfiable non-empty branch exists (the existing Spec 16 §2 proof).
4. The Gulf of Tonkin `distributeTokens { max: 6 }` card, with seed 1101n, produces a trajectory whose sampled count is independent of Spec 16 §2's bias — the spec's declared `min: 0` is honored.

## Foundations Alignment

- **#1 Engine Agnosticism**: after this spec, the sampler is purely generic — no hidden preferences.
- **#7 Specs Are Data**: a spec's declared `min` is the `min` used at runtime. No silent engine rewrite.
- **#10 Bounded Computation**: unchanged. The chooseN is still bounded.
- **#14 No Backwards Compatibility**: the silent rewrite is deleted in the same change that introduces the declarative replacement — no shim.
- **#15 Architectural Completeness**: the agent-stuck fix is relocated to the correct layer (caller retry or declarative spec field), not discarded.

## Required Proof

### Unit / Kernel Proof

1. New test: `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts` asserts uniform sampling in `[min, max]` for declared `min: 0, max: N`. Over a deterministic seed range, the count distribution includes 0.
2. Existing test `move-completion-retry.test.ts` §2 ("prefers non-empty optional chooseN branches when they are satisfiable") is migrated:
   - Option A: the fixture sets `preferNonEmpty: true`. The proof continues to hold.
   - Option B: the proof asserts bias via the retry warning, not via first-attempt sampling.

### Integration Proof

1. The Gulf of Tonkin "mixed piece types" test, *with its pre-Spec-135 assertion restored to `assert.equal(outOfPlayAfter, 2)` (exactly 6 moved)*, passes on seed 1101n. This is the direct regression witness that motivated this spec.
2. No production FITL canary seed regresses under the migration.

### Decision

Option A vs. B is decided in this spec's brainstorming phase before ticket decomposition. This document presents both; the final spec picks one.

## Implementation Direction

### Option A — declarative preference

- Compiler: `packages/engine/src/cnl/compile-effects-choice.ts` — accept and lower `preferNonEmpty`.
- Types: `packages/engine/src/kernel/types-ast.ts` and `types.ts` — add the field to `ChoiceNPendingRequest`.
- Sampler: `packages/engine/src/kernel/move-completion.ts:selectFromChooseN` — consume the flag; remove `sampledMin`.
- Fixtures: migrate `optional-retry-template` and any production YAML (likely none — the bias was universal).

### Option B — caller-retry relocation

- Sampler: remove `sampledMin`.
- Retry layer: `packages/engine/src/agents/prepare-playable-moves.ts` or `completeTemplateMove`'s outer loop — on `drawDeadEnd` where the failed sample was count = 0 for an optional chooseN with max > 0, retry with an explicit `min: 1` override for the next attempt. Emit `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning.
- Fixtures: migrate tests that relied on first-attempt bias.

## Out of Scope

- Other chooseN semantic knobs (e.g., `preferMax`, `orderingStrategy`) — possible future spec.
- Runner / UI-layer effects of declarative flags — separate concern.

## Outcome

TBD.
