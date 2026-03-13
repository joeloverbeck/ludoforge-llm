# Spec 60: First-Class Decision Instance Architecture

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 13, Spec 14, Spec 29, Spec 59
**Estimated effort**: 5-8 days
**Source sections**: Engine decision-sequence runtime, effect execution runtime, FITL event authoring experience

## Overview

Replace the current historically-simplified flat string-keyed decision parameter model with a first-class, game-agnostic decision instance architecture.

The current engine is functionally capable, but its decision handling still reflects an older simplification:
- decisions are primarily represented as `move.params` string keys
- repeated/nested/stochastic decisions are disambiguated indirectly
- canonical decision identity, authored bind names, fallback aliases, and test ergonomics all compete in the same key space

This spec introduces a clean internal model in which a decision instance is an explicit runtime object with stable identity, occurrence semantics, provenance, and serialization rules. `GameDef`, simulation, and authored game data remain game-agnostic. FITL is only a motivating stress case, not a special case in the design.

## Motivation

Recent work on repeated decision occurrence handling fixed real defects, but also exposed architectural compromise:
- repeated decisions required retrofitted occurrence metadata
- stochastic discovery required branch-local occurrence cloning
- top-level effect execution needed fresh occurrence scope to avoid cross-call leakage
- normalization helpers needed special logic to convert fallback input hints back into canonical decision ids

Those are all symptoms of the same root issue: the engine does not yet treat "decision instance identity" as a first-class concept.

The target architecture should be:
- clean: one authoritative identity model for decision instances
- robust: no alias collisions, no hidden counter leakage, no branch contamination
- extensible: repeated, nested, stochastic, compound, and future multi-actor decisions all compose naturally
- game-agnostic: no FITL branches, no per-game runtime affordances
- optimal enough for current scope: deterministic, serializable, testable, and easy to reason about

## Goals

### In Scope
- Define a first-class runtime `DecisionInstance`
- Separate internal decision answers from public move serialization
- Replace ad hoc occurrence bookkeeping with structured decision identity
- Make branch-local and call-local decision scopes explicit
- Preserve deterministic decision discovery and execution ordering
- Support repeated, nested, templated, and stochastic choices generically
- Provide a canonical serialization format for persisted moves
- Provide a generic normalization layer for tests and helper tooling
- Remove flat-key ambiguity between `decisionId`, bind names, aliases, and indexed variants

### Out of Scope
- Any game-specific rule changes
- Any visual-config changes
- Any FITL-specific schema extensions
- New user-facing UI interaction semantics
- Maintaining backwards compatibility with legacy serialized move formats

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
- occurrence counters
- fallback bind-name matching
- canonical alias handling
- special normalization rules in tests

These are useful mechanisms, but they should support a first-class model, not substitute for one.

## Proposed Architecture

### 1. Introduce First-Class Decision Instances

Add a new internal runtime type:

```typescript
interface DecisionInstanceId {
  readonly actionId: ActionId;
  readonly effectPath: string;
  readonly scopePath: readonly string[];
  readonly occurrence: number;
}

interface DecisionInstance {
  readonly id: DecisionInstanceId;
  readonly canonicalDecisionKey: string;
  readonly bindName: string;
  readonly chooser?: PlayerId;
  readonly primitive: 'chooseOne' | 'chooseN';
  readonly options: readonly ChoiceOption[];
  readonly targetKinds: readonly ChoiceTargetKind[];
  readonly cardinality?: {
    readonly min: number;
    readonly max: number;
  };
}
```

Key rule:
- internal runtime identity is `DecisionInstanceId`
- `canonicalDecisionKey` is a derived serialization artifact, not the primary identity

This changes the mental model from:
- "a move has params, some of which are decisions"

to:
- "a move has decision answers keyed by decision instance identity; params are one boundary serialization"

### 2. Introduce Decision Answer Maps in Runtime

Add an internal answer structure:

```typescript
interface DecisionAnswerMap {
  readonly byInstanceId: ReadonlyMap<string, MoveParamValue>;
}
```

Runtime decision resolution should operate on `DecisionAnswerMap`, not directly on `move.params`.

`move.params` remains the external move representation only at:
- persistence boundaries
- worker/bridge boundaries
- tests that intentionally construct wire-format moves

### 3. Separate Discovery Identity from Serialization Identity

Decision discovery should return pending instances, not just pending request metadata:

```typescript
interface ChoicePendingRequest {
  readonly kind: 'pending';
  readonly complete: false;
  readonly instance: DecisionInstance;
}
```

For convenience, flattened compatibility fields may temporarily remain during refactor, but the authoritative field becomes `instance`.

After this refactor:
- merge logic compares `DecisionInstanceId` + semantic shape
- runtime answer lookup uses `DecisionInstanceId`
- canonical string keys are only emitted when serializing a move

### 4. Replace Mutable Counter Leakage with Explicit Decision Scope

Define a `DecisionScope` object threaded through discovery/execution:

```typescript
interface DecisionScope {
  readonly path: readonly string[];
  readonly counters: {
    readonly byEffectPath: ReadonlyMap<string, number>;
  };
}
```

Rules:
- each top-level resolution call gets a fresh root `DecisionScope`
- nested sequential execution advances within that scope
- stochastic discovery clones scope before exploring each branch
- branch merges compare branch-local instances structurally
- no shared mutable scope is reused across unrelated calls

The scope should be attached explicitly to runtime traversal, not incidentally to reusable effect contexts.

### 5. Make Serialization a Dedicated Boundary Layer

Add a serializer/deserializer pair:

```typescript
interface SerializedDecisionAnswer {
  readonly key: string;
  readonly value: MoveParamValue;
}

function serializeDecisionAnswers(map: DecisionAnswerMap): Record<string, MoveParamValue>;
function deserializeDecisionAnswers(
  moveParams: Record<string, MoveParamValue>,
  discoveredInstances: readonly DecisionInstance[],
): DecisionAnswerMap;
```

Serialization rules:
- canonical serialized output uses one stable key per resolved decision instance
- first occurrence vs repeated occurrence is encoded here, not spread across runtime logic
- bind-name and alias hints are treated as input conveniences only during deserialization/normalization
- runtime never re-exposes alias-derived keys as authoritative outputs

Because backwards compatibility is explicitly out of scope, this spec may define one clean canonical move serialization and migrate all tests to it.

### 6. Add a Decision Identity Codec

Introduce a dedicated codec module responsible for:
- canonical key generation
- parsing indexed or legacy hint forms during transition
- rendering stable diagnostics
- ensuring one source of truth for decision serialization

Example:

```typescript
interface DecisionKeyCodec {
  format(instance: DecisionInstance): string;
  parseHint(key: string): DecisionHint | null;
}
```

No other module should handcraft decision key strings.

### 7. Normalize Helper Tooling Around Instances

Refactor test helpers and move completion helpers so they consume `DecisionInstance`, not incidental metadata.

Helper overrides should target:
- `instance.id`
- `instance.bindName`
- semantic predicates over `instance`

not brittle string reconstruction.

Example:

```typescript
interface DecisionOverrideRule {
  readonly when: (instance: DecisionInstance) => boolean;
  readonly value: MoveParamValue | ((instance: DecisionInstance) => MoveParamValue | undefined);
}
```

### 8. Formalize Stochastic Merge Semantics

Branch merging should work over decision instances, not only `decisionId` strings.

Two pending decisions from different branches are merge-compatible only if:
- they represent the same semantic decision instance slot
- they have equal choice primitive
- they have equal chooser
- they have equal cardinality contract
- they have equal option domain after normalization

This should be implemented as one centralized predicate:

```typescript
function areMergeCompatibleDecisionInstances(
  left: DecisionInstance,
  right: DecisionInstance,
): boolean;
```

### 9. Keep GameDef and Simulation Agnostic

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

### New Internal Types

Add:
- `DecisionInstanceId`
- `DecisionInstance`
- `DecisionScope`
- `DecisionAnswerMap`
- `DecisionHint`
- `DecisionKeyCodec`

### Modified Types

Refactor:
- `ChoicePendingRequest`
- `ChoiceStochasticPendingRequest`
- move decision sequence helpers
- effect execution context
- test helper resolution context

### Public Surface Rule

Public kernel exports may expose decision-instance types if needed by helpers and runner, but they must remain generic and game-independent.

## Runtime Flow

### Discovery

1. Enter top-level resolution with a fresh `DecisionScope`
2. Traverse effects
3. When a choice effect is encountered:
   - allocate a `DecisionInstance` from scope + effect path + occurrence state
   - check `DecisionAnswerMap` for a matching answer
   - if absent, return pending request with full `DecisionInstance`

### Deterministic Resolution

1. Generic resolver selects a value for a pending `DecisionInstance`
2. Value is written into `DecisionAnswerMap`
3. Discovery resumes with the same scope lineage
4. On completion, answers are serialized to canonical move params if needed

### Stochastic Resolution

1. For each branch, clone `DecisionScope`
2. Discover pending decisions independently
3. Merge resulting pending instances by structural instance identity
4. Preserve per-branch bindings separately from decision instance identity

## Invariants

1. Every pending decision has one authoritative identity object.
2. Internal decision identity does not depend on fallback bind-name keys.
3. No two distinct decision instances serialize to the same canonical key.
4. A fresh top-level resolution call cannot inherit occurrence state from a prior call.
5. Stochastic branch exploration cannot mutate sibling branch decision scope.
6. Test helpers cannot manufacture canonical output shapes by alias accident.
7. Repeated decisions remain addressable without game-specific code.
8. Runtime choice merging is based on semantic instance compatibility, not only raw string equality.
9. Canonical serialized moves are deterministic for the same authored spec, state, and chosen answers.
10. `GameDef` and simulation remain fully game-agnostic.

## Migration Plan

### Phase 1: Introduce Parallel Internal Types

- Add `DecisionInstance*` and `DecisionAnswerMap`
- Keep existing flat-key runtime working behind adapters
- Add codec and serializer/deserializer

### Phase 2: Refactor Choice Discovery

- Convert `chooseOne` / `chooseN` to emit `DecisionInstance`
- Convert stochastic merge logic to use instance compatibility
- Convert top-level effect execution to root fresh decision scope per invocation

### Phase 3: Refactor Decision Sequence Runtime

- Update move completion and decision sequencing to read/write `DecisionAnswerMap`
- Push flat `move.params` handling to boundary adapters only

### Phase 4: Refactor Test Helpers

- Replace string-key-centric override logic with instance-centric logic
- Remove legacy alias fallback output expectations

### Phase 5: Remove Transitional Compatibility

Because backwards compatibility is explicitly not required:
- remove obsolete fallback paths once tests and runtime are migrated
- simplify types and delete temporary bridging fields

## Implementation Requirements

### Kernel

- Add a dedicated decision identity module
- Add a dedicated decision serialization module
- Replace ad hoc occurrence metadata threading with structured instance objects
- Reduce direct `move.params[...]` lookups in runtime choice code

### Effect Runtime

- `applyEffect` and `applyEffects` must create fresh root decision scope
- nested sequential execution must preserve scope lineage
- stochastic branching must fork scope explicitly

### Move Runtime

- move completion and decision sequencing must operate on answer maps
- serialization should happen once per resolved move boundary, not incrementally everywhere

### Helpers and Tooling

- test helpers
- smoke harnesses
- AI/agent move completion helpers
- any worker bridge code that inspects pending decisions

must all align to first-class decision instances.

## Required Tests

### Unit Tests

**Decision identity**
- repeated same `chooseOne` yields distinct instance ids
- scoped templated choices yield stable canonical keys
- first occurrence serializes unindexed, later occurrences serialize indexed
- no alias or bind-name hint can overwrite canonical instance identity

**Scope isolation**
- separate top-level `applyEffect` calls do not share counters
- separate top-level `applyEffects` calls do not share counters
- stochastic branches do not contaminate each other

**Serialization**
- serialize/deserialize round-trip is deterministic
- canonical move output contains only canonical keys
- hint keys are accepted as input only where intended

**Merging**
- identical branch-local pending decisions merge
- semantically different occurrences do not merge
- repeated decisions with same bind but different instance ids do not collapse

### Integration Tests

**Decision sequence**
- repeated nested choices resolve in deterministic order
- templated decision ids survive forEach nesting
- branch-local decision discovery merges correctly after `rollRandom`

**FITL stress cases**
- `card-80` repeated destination prompts remain fully addressable
- at least two other repeated/nested FITL events remain stable under canonical serialization

**Authority / ownership**
- chooser-owned decisions still enforce authority correctly
- probe vs strict discovery semantics remain unchanged

### Property Tests

- for any decision sequence, canonical serialization is stable given the same resolution path
- no two distinct decision instances collide to the same serialized key

### Regression Tests

Add dedicated regressions for the issues already observed:
- repeated decision collapse
- branch contamination during stochastic discovery
- cross-call occurrence leakage
- helper canonicalization drift

## Acceptance Criteria

- [ ] Runtime decision identity is first-class and no longer inferred primarily from flat string keys
- [ ] `move.params` is treated as a serialization boundary, not the authoritative internal model
- [ ] Repeated, nested, and stochastic decisions work without ad hoc per-site fixes
- [ ] Decision scope isolation is explicit and verified
- [ ] Test helpers operate on decision instances rather than brittle string matching
- [ ] Canonical serialized move shape is deterministic and minimal
- [ ] No game-specific logic is added to kernel, simulation, or `GameDef`
- [ ] Existing FITL event coverage passes after migration
- [ ] Full engine suite passes
- [ ] Runner/workspace suite passes

## Files to Create/Modify

Expected core files:

```
packages/engine/src/kernel/decision-instance.ts
packages/engine/src/kernel/decision-scope.ts
packages/engine/src/kernel/decision-serialization.ts
packages/engine/src/kernel/decision-occurrence.ts
packages/engine/src/kernel/effects-choice.ts
packages/engine/src/kernel/effect-dispatch.ts
packages/engine/src/kernel/move-decision-sequence.ts
packages/engine/src/kernel/move-decision-completion.ts
packages/engine/src/kernel/types-core.ts
packages/engine/src/kernel/index.ts
packages/engine/test/helpers/decision-param-helpers.ts
packages/engine/test/unit/kernel/decision-instance.test.ts
packages/engine/test/unit/kernel/decision-serialization.test.ts
packages/engine/test/unit/kernel/decision-scope.test.ts
packages/engine/test/unit/effects-choice.test.ts
packages/engine/test/unit/kernel/move-decision-sequence.test.ts
packages/engine/test/integration/decision-sequence.test.ts
packages/engine/test/integration/fitl-events-light-at-the-end-of-the-tunnel.test.ts
```

## Risks

### Risk 1: Mid-refactor dual-model confusion

If flat-key params and instance-based answers coexist too long, the code may get more confusing before it gets cleaner.

Mitigation:
- keep the migration phases tight
- centralize adapters
- remove transitional paths aggressively once tests pass

### Risk 2: Over-modeling

It is possible to invent a more abstract decision model than the engine actually needs.

Mitigation:
- keep the model centered on current real requirements: repeated, nested, stochastic, deterministic, chooser-owned
- avoid building a workflow engine or speculative UI protocol

### Risk 3: Serialization churn

Removing backwards compatibility may require broad test and worker fixture updates.

Mitigation:
- explicitly budget for fixture migration
- land canonical serializer early

## Recommended Sequencing

1. Introduce `DecisionInstance`, `DecisionScope`, and serializer modules.
2. Refactor `effects-choice` to emit and consume instances.
3. Refactor stochastic merge semantics.
4. Refactor `move-decision-sequence` and completion helpers.
5. Refactor test helpers to instance-centric APIs.
6. Remove transitional legacy flat-key logic.

## Notes

This spec intentionally treats the current occurrence-based patch as a useful bridge, not the end-state architecture.

The current system is serviceable, but it still carries historical simplifications. This spec defines the cleaner endpoint: decision instances become an explicit kernel concept, serialization becomes a boundary concern, and repeated/nested/stochastic authored choices become routine rather than exceptional.
