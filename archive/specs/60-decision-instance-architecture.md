# Spec 60: First-Class Decision Instance Architecture

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: None
**Estimated effort**: 5-8 days
**Source sections**: Engine decision-sequence runtime, effect execution runtime, FITL event authoring experience

## Overview

Replace the current historically-simplified flat string-keyed decision parameter model with a first-class, game-agnostic decision instance architecture.

The current engine is functionally capable, but its decision handling still reflects an older simplification:
- decisions are primarily represented as `move.params` string keys
- repeated/nested/stochastic decisions are disambiguated indirectly
- canonical decision identity, authored bind names, fallback aliases, and test ergonomics all compete in the same key space

This spec introduces a clean internal model in which every decision occurrence gets a stable, codec-produced `DecisionKey` (branded string), threaded through an immutable `DecisionScope`. `GameDef`, simulation, and authored game data remain game-agnostic. FITL is only a motivating stress case, not a special case in the design.

## Motivation

Recent work on repeated decision occurrence handling fixed real defects, but also exposed architectural compromise:
- repeated decisions required retrofitted occurrence metadata
- stochastic discovery required branch-local occurrence cloning
- top-level effect execution needed fresh occurrence scope to avoid cross-call leakage
- normalization helpers needed special logic to convert fallback input hints back into canonical decision ids

Those are all symptoms of the same root issue: the engine does not yet treat "decision instance identity" as a first-class concept.

### Root Causes in Current Code

1. **Mutable occurrence counters** — `DecisionOccurrenceContext` uses mutable `Map<string, number>` counters, requiring explicit cloning for stochastic branch isolation and fresh-scope creation at every top-level call.
2. **Scattered serialization** — Decision key strings are constructed ad hoc in `effects-choice.ts`, `move-decision-sequence.ts`, `legal-choices.ts`, and test helpers, with no single source of truth.
3. **Fragile alias heuristics** — `normalizeDecisionParams()` uses a 6-step fallback chain (canonical alias -> name -> bind name -> occurrence key variants) to match input hints to canonical decision ids.
4. **9 occurrence fields on ChoicePendingRequest** — `decisionId`, `occurrenceIndex`, `occurrenceKey`, `nameOccurrenceIndex`, `nameOccurrenceKey`, `canonicalAlias`, `canonicalAliasOccurrenceIndex`, `canonicalAliasOccurrenceKey` — all competing to describe what is conceptually one identity.
5. **Optional context fields without invariants** — `iterationPath` and `decisionOccurrences` on `EffectContextBase` are optional, leading to defensive checks and unclear ownership.
6. **Test helper complexity** — `decision-param-helpers.ts` reconstructs canonical keys from multiple occurrence fields, mirroring (and risking drift from) the runtime serialization logic.
7. **Stochastic branch clone discipline** — Branch isolation depends on callers remembering to clone mutable maps at the right time.
8. **Two-phase key construction** — `iterationPath` is maintained separately from occurrence counters, then concatenated at key-construction time, creating a gap where they can get out of sync.

The target architecture should be:
- clean: one authoritative identity model for decision instances
- robust: no alias collisions, no hidden counter leakage, no branch contamination
- extensible: repeated, nested, stochastic, compound, and future multi-actor decisions all compose naturally
- game-agnostic: no FITL branches, no per-game runtime affordances
- optimal enough for current scope: deterministic, serializable, testable, and easy to reason about

## Goals

### In Scope
- Define `DecisionKey` (branded string) as the lean, codec-produced decision identity
- Define `DecisionScope` as an immutable value object with occurrence counters and absorbed `iterationPath`
- Provide pure codec functions (`formatDecisionKey`, `parseDecisionKey`, `advanceScope`, `withIterationSegment`) as the single source of truth for key generation
- Replace mutable `DecisionOccurrenceContext` with immutable scope threading
- Collapse 9 occurrence fields on `ChoicePendingRequest` into a single `decisionKey` field
- Make `decisionScope` a required field on `EffectContextBase` (not optional)
- Add `decisionScope` to `EffectResult` for scope threading through effect sequences
- Provide a canonical serialization format for persisted moves (no backwards compatibility)
- Simplify test helpers to use codec directly
- Update runner types and stores for `decisionKey`

### Out of Scope
- Any game-specific rule changes
- Any visual-config changes
- Any FITL-specific schema extensions
- New user-facing UI interaction semantics
- Maintaining backwards compatibility with legacy serialized move formats
- `DecisionInstance` / `DecisionAnswerMap` / `DecisionHint` wrapper types (over-modeling)

## Problem Statement

The current engine effectively models decisions as:

```typescript
type Move = {
  actionId: ActionId;
  params: Record<string, MoveParamValue>;
};
```

This works for simple decisions but breaks down when:
- the same authored choice appears multiple times in one move
- the same bind name appears under different iteration scopes
- identical pending choices appear across stochastic branches
- helper tooling wants to target a specific repeated occurrence
- canonical output shape must remain stable even when input hints use aliases

The system currently compensates with:
- scoped decision id composition
- mutable occurrence counters
- fallback bind-name matching
- canonical alias handling
- special normalization rules in tests

These are useful mechanisms, but they should support a first-class model, not substitute for one.

## Proposed Architecture

### 1. DecisionKey — Branded String Identity

A `DecisionKey` is a branded string produced exclusively by `formatDecisionKey()`. It serves as the single identity for a decision occurrence, used both as internal answer map keys (`move.params`) and external serialization.

```typescript
/** Branded string produced exclusively by formatDecisionKey(). */
type DecisionKey = string & { readonly __brand: 'DecisionKey' };
```

No `DecisionInstanceId` structured type. No `DecisionAnswerMap` wrapper. `move.params` keyed by `DecisionKey` strings IS the answer map.

### 2. DecisionScope — Immutable Value Object

`DecisionScope` replaces both the mutable `DecisionOccurrenceContext` and the separate `iterationPath` field. It is a frozen value object; `advanceScope()` returns a new scope + key.

```typescript
/** Immutable value object tracking iteration path and occurrence counters. */
interface DecisionScope {
  readonly iterationPath: string;                     // absorbed from EffectContextBase
  readonly counters: Readonly<Record<string, number>>;
}

/** Result of advancing scope for a new decision occurrence. */
interface ScopeAdvanceResult {
  readonly scope: DecisionScope;
  readonly key: DecisionKey;
  readonly occurrence: number;  // 1-based
}
```

Immutability guarantees:
- Stochastic branches get free isolation (same reference, no mutation possible)
- No clone discipline required
- No cross-call leakage possible

### 3. Codec Functions — Single Source of Truth

Pure functions (not a class) in `decision-scope.ts`:

```typescript
function emptyScope(): DecisionScope;

function advanceScope(
  scope: DecisionScope,
  internalDecisionId: string,
  resolvedBind: string,
): ScopeAdvanceResult;

function withIterationSegment(
  scope: DecisionScope,
  index: number,
): DecisionScope;

function formatDecisionKey(
  internalDecisionId: string,
  resolvedBind: string,
  iterationPath: string,
  occurrence: number,
): DecisionKey;

function parseDecisionKey(key: DecisionKey): {
  readonly baseId: string;
  readonly resolvedBind: string;
  readonly iterationPath: string;
  readonly occurrence: number;
} | null;
```

No other module should handcraft decision key strings.

### 4. Canonical Key Format

| Scenario | Key |
|---|---|
| Simple bind `$target` | `$target` |
| Simple bind, 2nd occurrence | `$target#2` |
| Template `decision:attack` resolved to `Quang_Tri` | `decision:attack::Quang_Tri` |
| Same, 2nd occurrence | `decision:attack::Quang_Tri#2` |
| forEach iteration 0 | `decision:train::Saigon[0]` |
| forEach iteration 0, 2nd occurrence | `decision:train::Saigon[0]#2` |
| Nested forEach | `decision:op::Saigon[0][1]` |

Rules:
- `#1` suffix is never written (first occurrence is unindexed)
- When `internalDecisionId === resolvedBind` and no iteration path, key is just `{resolvedBind}`
- `::` separates template id from resolved bind
- `[N]` segments encode forEach iteration path

### 5. ChoicePendingRequest — Collapsed Fields

```typescript
interface ChoicePendingRequest {
  readonly kind: 'pending';
  readonly complete: false;
  readonly decisionKey: DecisionKey;              // NEW — replaces 9 old fields
  readonly name: string;                          // KEPT — display/binding name
  readonly type: 'chooseOne' | 'chooseN';         // KEPT
  readonly chooser?: PlayerId;                    // KEPT
  readonly options: readonly ChoiceOption[];       // KEPT
  readonly targetKinds: readonly ChoiceTargetKind[]; // KEPT
  readonly min?: number;                          // KEPT
  readonly max?: number;                          // KEPT
}
```

**Removed fields**: `decisionId`, `occurrenceIndex`, `occurrenceKey`, `nameOccurrenceIndex`, `nameOccurrenceKey`, `canonicalAlias`, `canonicalAliasOccurrenceIndex`, `canonicalAliasOccurrenceKey`.

### 6. EffectContextBase — Required Scope, Absorbed Fields

```typescript
interface EffectContextBase extends WriteContext {
  readonly traceContext?: EffectTraceContext;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly freeOperation?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly decisionScope: DecisionScope;            // NEW — required, replaces 2 optional fields
  readonly freeOperationProbeScope?: FreeOperationProbeScope;
  // REMOVED: iterationPath?: string
  // REMOVED: decisionOccurrences?: DecisionOccurrenceContext
}
```

### 7. EffectResult — Scope Threading

```typescript
interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest | ChoiceStochasticPendingRequest;
  readonly decisionScope?: DecisionScope;           // NEW — for scope threading
}
```

### 8. Scope Threading in Effect Dispatch

In `applyEffectsWithBudget` (effect-dispatch.ts), thread scope like `bindings`:

```typescript
let currentScope = ctx.decisionScope;
for (const effect of effects) {
  const result = applyEffectWithBudget(
    effect,
    { ...ctx, decisionScope: currentScope, ... },
    budget,
  );
  currentScope = result.decisionScope ?? currentScope;
  // ... existing state/rng/bindings threading ...
}
```

Top-level `applyEffect`/`applyEffects` create `emptyScope()` — same intent as current `createDecisionOccurrenceContext()` but immutable.

### 9. Stochastic Branch Handling

In `applyRollRandom` discovery mode, each branch receives the current scope by reference. Immutability guarantees isolation:

```typescript
for (const branch of branches) {
  const nestedCtx = {
    ...ctx,
    decisionScope: ctx.decisionScope,  // same ref, immutable = free isolation
    bindings: { ...ctx.bindings, [effect.rollRandom.bind]: rolledValue },
  };
  const result = applyEffects(nestedCtx, branchEffects);
  branchResults.push(result);
}
```

Branch merging: two pending decisions from different branches are merge-compatible if they have the same `decisionKey`. Since identical starting scope + identical effect path = identical key, this works naturally.

### 10. Keep GameDef and Simulation Agnostic

No changes to `GameSpecDoc` authoring should be game-specific.

Authored games continue to declare:
- `chooseOne`
- `chooseN`
- `forEach`
- `rollRandom`
- bind templates
- templated decision ids where needed

The engine improvement is purely in how generic authored choices are tracked and resolved.

Simulation/agents should consume the same canonical pending decision structure without any knowledge of FITL or other game-specific identifiers.

## Data Model Changes

### New Types

| Type | Location | Description |
|---|---|---|
| `DecisionKey` | `decision-scope.ts` | Branded string, codec-produced decision identity |
| `DecisionScope` | `decision-scope.ts` | Immutable value object with `iterationPath` + `counters` |
| `ScopeAdvanceResult` | `decision-scope.ts` | Return type of `advanceScope()` |

### Modified Types

| Type | Change |
|---|---|
| `ChoicePendingRequest` | Add `decisionKey`, remove 9 occurrence fields |
| `EffectContextBase` | Add required `decisionScope`, remove `iterationPath` + `decisionOccurrences` |
| `EffectResult` | Add optional `decisionScope` |

### Eliminated Types

| Type | Reason |
|---|---|
| `DecisionOccurrenceContext` | Replaced by immutable `DecisionScope` |
| Functions in `decision-id.ts` | Absorbed into codec functions in `decision-scope.ts` |

### Public Surface Rule

Public kernel exports may expose `DecisionKey`, `DecisionScope`, and codec functions if needed by helpers and runner, but they must remain generic and game-independent.

## Runner Changes

### PartialChoice (`store-types.ts`)

```typescript
interface PartialChoice {
  readonly decisionKey: DecisionKey;  // was: decisionId: string
  readonly name: string;
  readonly value: MoveParamValue;
}
```

### game-store.ts

`buildMove` uses `choice.decisionKey` instead of `choice.decisionId`. `submitChoice` reads `state.choicePending.decisionKey`.

### iteration-context.ts

Rewrite to use `parseDecisionKey()` from engine codec. Eliminates regex-based iteration parsing.

### derive-render-model.ts

All `pending.decisionId` references become `pending.decisionKey`. `extractIterationGroupId` uses codec parse.

### ChoicePanel.tsx

Minimal changes — receives render model which abstracts key format.

### Worker bridge

No changes — passes Move/ChoiceRequest transparently.

## File Changes

### Files to Create

| File | Purpose |
|---|---|
| `packages/engine/src/kernel/decision-scope.ts` | `DecisionKey`, `DecisionScope`, codec functions, scope operations |

### Files to Delete

| File | Reason |
|---|---|
| `packages/engine/src/kernel/decision-occurrence.ts` | Entirely replaced by `decision-scope.ts` |
| `packages/engine/src/kernel/decision-id.ts` | Absorbed into codec functions in `decision-scope.ts` |

### Files to Modify (Critical)

| File | Change |
|---|---|
| `packages/engine/src/kernel/types-core.ts` | `ChoicePendingRequest`: add `decisionKey`, remove 9 occurrence fields |
| `packages/engine/src/kernel/effect-context.ts` | `EffectContextBase`: add required `decisionScope`, remove `iterationPath` + `decisionOccurrences`. `EffectResult`: add `decisionScope` |
| `packages/engine/src/kernel/effects-choice.ts` | Rewrite `chooseOne`/`chooseN`/`rollRandom` to use `advanceScope` + single-key lookup |
| `packages/engine/src/kernel/effects-control.ts` | `forEach`: use `withIterationSegment` instead of `iterationPath` concatenation |
| `packages/engine/src/kernel/effect-dispatch.ts` | Thread `decisionScope` through effect sequences; create `emptyScope()` at top-level |
| `packages/engine/src/kernel/move-decision-sequence.ts` | Write `request.decisionKey` to `move.params` directly (no `writeMoveParamForDecisionOccurrence`) |
| `packages/engine/src/kernel/legal-choices.ts` | Use `decisionKey` for param writes in probe functions |
| `packages/engine/src/kernel/index.ts` | Update exports |
| `packages/engine/test/helpers/decision-param-helpers.ts` | Massive simplification — use codec directly |
| `packages/runner/src/store/store-types.ts` | `PartialChoice.decisionId` -> `decisionKey` |
| `packages/runner/src/store/game-store.ts` | `buildMove` + `submitChoice` use `decisionKey` |
| `packages/runner/src/model/iteration-context.ts` | Rewrite using `parseDecisionKey` |
| `packages/runner/src/model/derive-render-model.ts` | Field renames `decisionId` -> `decisionKey` |

## Migration Phases

### Phase 1: Core Types + Codec

Create `decision-scope.ts` with `DecisionKey`, `DecisionScope`, `ScopeAdvanceResult`, and all codec functions. Update `types-core.ts` (`ChoicePendingRequest`) and `effect-context.ts` (`EffectContextBase`, `EffectResult`). No behavioral change yet — compilation will break.

### Phase 2: Effect Execution

Rewrite `effects-choice.ts` (`chooseOne`/`chooseN`/`rollRandom`), `effects-control.ts` (`forEach`), `effect-dispatch.ts` (scope threading). Delete `decision-occurrence.ts` and `decision-id.ts`.

### Phase 3: Move Construction

Rewrite `move-decision-sequence.ts`, `legal-choices.ts` probe functions, move-completion helpers.

### Phase 4: Test Helpers

Rewrite `decision-param-helpers.ts`. Update all tests constructing `ChoicePendingRequest` or `move.params`.

### Phase 5: Runner

Update `PartialChoice`, `game-store`, `iteration-context`, `derive-render-model`.

## Runtime Flow

### Discovery

1. Enter top-level resolution with a fresh `DecisionScope` (via `emptyScope()`)
2. Traverse effects
3. When a choice effect is encountered:
   - call `advanceScope(currentScope, internalDecisionId, resolvedBind)` to get new scope + `DecisionKey`
   - check `move.params[decisionKey]` for a matching answer
   - if absent, return pending request with `decisionKey`
   - if present, bind the answer and continue traversal

### Deterministic Resolution

1. Generic resolver selects a value for a pending `ChoicePendingRequest`
2. Value is written to `move.params[request.decisionKey]`
3. Discovery resumes with the same scope lineage
4. On completion, `move.params` is the canonical serialized form

### Stochastic Resolution

1. For each branch, pass current scope by reference (immutable = free isolation)
2. Discover pending decisions independently per branch
3. Merge resulting pending requests by `decisionKey` equality
4. Preserve per-branch bindings separately from decision identity

## Invariants

1. Every pending decision has one authoritative identity: its `DecisionKey`.
2. Internal decision identity does not depend on fallback bind-name keys.
3. No two distinct decision instances serialize to the same canonical key.
4. A fresh top-level resolution call cannot inherit occurrence state from a prior call.
5. Stochastic branch exploration cannot mutate sibling branch decision scope (guaranteed by immutability).
6. Test helpers cannot manufacture canonical output shapes by alias accident.
7. Repeated decisions remain addressable without game-specific code.
8. Runtime choice merging is based on `DecisionKey` equality (identical scope + path = identical key).
9. Canonical serialized moves are deterministic for the same authored spec, state, and chosen answers.
10. `GameDef` and simulation remain fully game-agnostic.

## Required Tests

### Unit Tests

**Decision identity and codec**
- `formatDecisionKey` produces correct keys for all canonical format scenarios
- `parseDecisionKey` round-trips all key formats
- `advanceScope` increments counters immutably and produces correct keys
- `withIterationSegment` appends `[N]` segments to iteration path
- `emptyScope` returns zero counters and empty iteration path
- First occurrence serializes unindexed, later occurrences serialize with `#N`
- No alias or bind-name hint can overwrite canonical instance identity

**Scope isolation**
- Separate top-level `applyEffect` calls do not share counters
- Separate top-level `applyEffects` calls do not share counters
- Stochastic branches do not contaminate each other (immutability proof)
- `advanceScope` does not mutate the input scope

**Merging**
- Identical branch-local pending decisions merge (same `decisionKey`)
- Semantically different occurrences do not merge
- Repeated decisions with same bind but different `decisionKey` do not collapse

### Integration Tests

**Decision sequence**
- Repeated nested choices resolve in deterministic order
- Templated decision ids survive `forEach` nesting
- Branch-local decision discovery merges correctly after `rollRandom`

**FITL stress cases**
- `card-80` repeated destination prompts remain fully addressable
- At least two other repeated/nested FITL events remain stable under canonical serialization

**Authority / ownership**
- Chooser-owned decisions still enforce authority correctly
- Probe vs strict discovery semantics remain unchanged

### Property Tests

- For any decision sequence, canonical serialization is stable given the same resolution path
- No two distinct decision instances collide to the same serialized key

### Regression Tests

Add dedicated regressions for the issues already observed:
- Repeated decision collapse
- Branch contamination during stochastic discovery
- Cross-call occurrence leakage
- Helper canonicalization drift

## Acceptance Criteria

- [ ] `DecisionKey` branded string is the sole decision identity type
- [ ] `DecisionScope` is immutable — no mutable occurrence maps anywhere
- [ ] Codec functions are the single source of truth for key generation
- [ ] `ChoicePendingRequest` has `decisionKey` field, 9 old occurrence fields removed
- [ ] `EffectContextBase.decisionScope` is required (not optional)
- [ ] `EffectResult.decisionScope` enables scope threading
- [ ] `move.params` keyed by `DecisionKey` strings — no separate `DecisionAnswerMap`
- [ ] Repeated, nested, and stochastic decisions work without ad hoc per-site fixes
- [ ] Decision scope isolation is explicit and verified (immutability guarantees it)
- [ ] Test helpers operate on codec-produced keys, not brittle string reconstruction
- [ ] Canonical serialized move shape is deterministic and minimal
- [ ] No game-specific logic is added to kernel, simulation, or `GameDef`
- [ ] Existing FITL event coverage passes after migration
- [ ] Full engine suite passes (`pnpm turbo test`)
- [ ] Runner/workspace suite passes (`pnpm -F @ludoforge/runner test`)
- [ ] Build passes (`pnpm turbo build`)
- [ ] Type check passes (`pnpm turbo typecheck`)
- [ ] Lint passes (`pnpm turbo lint`)

## Corrections from Original Draft

This spec corrects the following issues from the original Codex-authored draft:

| Original | Correction | Reason |
|---|---|---|
| 6 new types (`DecisionInstanceId`, `DecisionInstance`, `DecisionScope`, `DecisionAnswerMap`, `DecisionHint`, `DecisionKeyCodec`) | 2 new types (`DecisionKey` branded string, `DecisionScope`) + codec functions | Over-modeling; `DecisionInstance`/`DecisionAnswerMap`/`DecisionHint` are unnecessary |
| `DecisionInstance` bundles identity + options/cardinality/targetKinds | Eliminated; `ChoicePendingRequest` keeps flat fields with `decisionKey` added | Conflates identity with request data |
| `DecisionAnswerMap` as `ReadonlyMap<string, MoveParamValue>` wrapper | `move.params` IS the answer map, keyed by `DecisionKey` strings. No wrapper type | Unnecessary indirection |
| `DecisionScope` with `ReadonlyMap` counters (implies clone for branches) | Immutable scope with `Readonly<Record<string, number>>` counters; `advanceScope()` returns new scope | Immutable = free stochastic isolation, no clone needed |
| Mutable `DecisionOccurrenceContext` replaced by `DecisionScope` | Same intent, but scope also absorbs `iterationPath` | Original spec didn't address `iterationPath` absorption |
| Dependencies: Spec 13, 14, 29, 59 | Corrected to: none (all are independent) | Spec 13 (mechanic IR) and 14 (evolution) are unrelated |
| Runner changes unspecified | Detailed: `PartialChoice.decisionId`->`decisionKey`, store `buildMove`, `iteration-context.ts` rewrite, render model field renames | Runner tightly couples to `ChoicePendingRequest` shape |
| Canonical serialization format undefined | Defined: `{resolvedBind}` or `{internalDecisionId}::{resolvedBind}{iterationPath}` with `#N` suffix for occurrence > 1 | Can't implement without a concrete format |
| `EffectResult` unchanged | Add `decisionScope?: DecisionScope` to `EffectResult` | Required for immutable scope threading through effect sequences |
| `iterationPath` field kept separate | Absorbed into `DecisionScope` | Eliminates separate field and two-phase key construction |

## Risks

### Risk 1: Mid-refactor dual-model confusion

If flat-key params and scope-based keys coexist too long, the code may get more confusing before it gets cleaner.

Mitigation:
- keep the migration phases tight
- centralize all key generation in codec functions early
- remove transitional paths aggressively once tests pass

### Risk 2: Over-modeling

It is possible to invent a more abstract decision model than the engine actually needs.

Mitigation:
- lean types only (`DecisionKey` + `DecisionScope`), no wrapper types
- keep the model centered on current real requirements: repeated, nested, stochastic, deterministic, chooser-owned
- avoid building a workflow engine or speculative UI protocol

### Risk 3: Serialization churn

Removing backwards compatibility may require broad test and worker fixture updates.

Mitigation:
- explicitly budget for fixture migration in Phase 4
- land canonical codec early in Phase 1

## Notes

This spec intentionally treats the current occurrence-based patch as a useful bridge, not the end-state architecture.

The current system is serviceable, but it still carries historical simplifications. This spec defines the cleaner endpoint: `DecisionKey` becomes an explicit kernel concept, `DecisionScope` provides immutable isolation, serialization is a codec concern, and repeated/nested/stochastic authored choices become routine rather than exceptional.

## Outcome

- **Completion date**: 2026-03-13
- **What changed**: Spec served as the architectural guide for the UNICOMGAMPLAAIAGE ticket series implementing unified MCTS-based gameplay AI. All phases of the ticket series were implemented against this spec's architecture.
- **Deviations**: None — implementation followed the spec's phased approach.
- **Verification**: 4438 engine tests pass, 0 lint errors, 0 typecheck errors.
