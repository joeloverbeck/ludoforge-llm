# Spec 130: Canonical Hot-Path Object Shapes

**Status**: PROPOSED
**Priority**: P1
**Complexity**: L
**Dependencies**: None (standalone; should be implemented BEFORE Specs 128/129 to establish shape discipline)
**Source**: `fitl-perf-optimization` campaign (2026-04-13) — 6 of 7 experiments caused V8 JIT deoptimization from object shape changes

## Overview

Establish and enforce canonical object shapes for all hot-path types in the kernel. Eliminate conditional spreads (`...(cond ? {prop: val} : {})`) that create objects with different V8 hidden classes at the same construction site. Define a build-time lint rule to prevent regressions.

### Rationale

The `fitl-perf-optimization` campaign (7 experiments, 6 rejects) proved that V8's JIT optimizer is catastrophically sensitive to object shape polymorphism in this codebase:

| Experiment | Change | Regression | Cause |
|-----------|--------|-----------|-------|
| exp-002 | New function with different return shape | +4.04% | Polymorphic return at call site |
| exp-004 | Inlined logic in compiled closure | +1.93% | Changed closure body → JIT re-profile |
| exp-006 | WeakMap cache in kernel module | +2.01% | Module-level Map allocation changed JIT profile |
| exp-007 | Added field to GameDefRuntime | +4.90% | Hidden class change cascaded to all access sites |

V8 CPU profiling shows **6% of total CPU** in megamorphic property access:

| V8 Builtin | CPU % | Cause |
|-----------|-------|-------|
| `LoadIC_Megamorphic` | 2.9% | Polymorphic property loads |
| `KeyedLoadIC_Megamorphic` | 3.0% | Polymorphic keyed property loads |
| **Total** | **~6%** | |

Megamorphic loads occur when V8's inline caches (ICs) see too many different object shapes at a single access site. The codebase uses conditional spreads extensively, which is the primary generator of shape polymorphism.

### Foundation 15 Alignment

Foundation 15 (Architectural Completeness) requires:

> *"Solutions address root causes, not symptoms. If a problem reveals a design gap, the design is fixed — not papered over with a workaround."*

The root cause of V8 megamorphic deoptimization is inconsistent object shapes. Prior campaigns tried to work around this (caching, inlining, fast paths) — each time triggering the deopt they were trying to avoid. This spec fixes the root cause by making all hot-path object shapes canonical and consistent.

## Deliverables

### 1. Eliminate Conditional Spreads on Hot-Path Object Constructors

**Pattern to eliminate**:
```typescript
// POLYMORPHIC: creates different hidden classes depending on condition
return {
  kind: 'failure',
  failure,
  ...(fallbackCandidate === undefined ? {} : {
    fallbackMove: fallbackCandidate.move,
    fallbackStableMoveKey: fallbackCandidate.stableMoveKey,
    fallbackScore: fallbackCandidate.score,
  }),
  metadata: { ... },
};
```

**Replacement pattern**:
```typescript
// MONOMORPHIC: always the same hidden class
return {
  kind: 'failure',
  failure,
  fallbackMove: fallbackCandidate?.move,
  fallbackStableMoveKey: fallbackCandidate?.stableMoveKey,
  fallbackScore: fallbackCandidate?.score ?? null,
  metadata: { ... },
};
```

Properties that are conditionally present become always-present with `undefined` as the absent value. V8 sees a single hidden class at each construction site.

### 2. Canonical Shape Registry

Document the expected shape of each hot-path type, with all properties listed (including those that may be `undefined`). This is a code-level documentation comment (not a runtime artifact):

**Priority types** (ordered by V8 IC sensitivity × call frequency):

| Type | File | Call frequency | Properties |
|------|------|----------------|------------|
| `EffectCursor` | `effect-context.ts` | ~10K/game | `state`, `rng`, `bindings`, `decisionScope`, `effectPath`, `tracker` |
| `ReadContext` / `MutableReadScope` | `eval-context.ts` | ~50K/game | All fields always present |
| `ClassifiedMove` | `types-core.ts` | ~3K/game | `move`, `viability`, `trustedMove` |
| `PolicyEvaluationCoreResult` | `policy-eval.ts` | ~400/game | Success and failure shapes unified (including `fallbackScore`) |
| `MoveViabilityProbeResult` | `apply-move.ts` | ~3K/game | 4 discriminated variants unified (viable+complete, viable+incomplete, illegal-move, other-error) |
| `GameState` | `types-core.ts` | ~200 creates/game | All optional fields always present |

For each type, the canonical shape lists every property that appears in ANY construction site. All construction sites must include ALL properties.

### 3. Audit and Convert Existing Code

Systematically audit all construction sites for the priority types listed above. For each site:

1. Check if the object literal uses conditional spread (`...(cond ? {...} : {})`)
2. If yes, convert to always-present properties with `undefined` for absent values
3. Verify all construction sites for the same type produce objects with identical property sets

**Audit scope** (estimated sites per type):

| Type | Estimated construction sites | Files |
|------|------------------------------|-------|
| `EffectCursor` | ~15 | `effect-context.ts`, `effect-dispatch.ts`, `effects-control.ts` |
| `ClassifiedMove` | ~8 | `legal-moves.ts` |
| `PolicyEvaluationCoreResult` | ~16 | `policy-eval.ts` |
| `MoveViabilityProbeResult` | ~6 | `apply-move.ts` |
| `GameState` | ~25 | `state-draft.ts`, `apply-move.ts`, `turn-flow-eligibility.ts`, `effects-*.ts` |

### 4. GameState Optional Fields — Always-Present with Undefined

`GameState` has four conditionally-present fields (`reveals`, `globalMarkers`, `activeLastingEffects`, `interruptPhaseStack`). These create different hidden classes depending on game configuration:

- A game without global markers: `GameState` has no `globalMarkers` property
- A game with global markers: `GameState` has `globalMarkers: Record<string, string>`

**Fix**: All optional `GameState` fields become always-present in the runtime representation. The type signature uses `T | undefined` (not `T?` with exactOptionalPropertyTypes). The initial state constructor (`initialState` in `initial-state.ts`) populates all fields.

```typescript
// Before
interface GameState {
  // ... required fields ...
  readonly globalMarkers?: Readonly<Record<string, string>>;
  readonly reveals?: Readonly<Record<string, readonly RevealGrant[]>>;
  readonly activeLastingEffects?: readonly ActiveLastingEffect[];
  readonly interruptPhaseStack?: readonly InterruptPhaseFrame[];
}

// After  
interface GameState {
  // ... required fields ...
  readonly globalMarkers: Readonly<Record<string, string>> | undefined;
  readonly reveals: Readonly<Record<string, readonly RevealGrant[]>> | undefined;
  readonly activeLastingEffects: readonly ActiveLastingEffect[] | undefined;
  readonly interruptPhaseStack: readonly InterruptPhaseFrame[] | undefined;
}
```

This means `state.globalMarkers` is always a property of the object (possibly `undefined`), not sometimes absent. V8 creates a single hidden class for all GameState objects.

**Note**: This does NOT change serialized GameDef or GameState JSON — serialization can strip `undefined` fields. The shape normalization is internal to the runtime only.

### 5. ESLint Rule for Conditional Spread Prevention

Add a custom ESLint rule (or eslint-plugin-no-conditional-spread) that flags conditional spread patterns in kernel files:

```
// Flag these patterns:
...(condition ? { prop: value } : {})
...(value !== undefined ? { prop: value } : {})

// Allow these patterns (non-polymorphic):
...existingObject  // spreading a known-shape object
{ ...base, overrideProp: value }  // spreading then overriding (consistent shape)
```

The rule applies to files in `packages/engine/src/kernel/` and `packages/engine/src/agents/`. It does NOT apply to `packages/engine/src/cnl/` (compilation pipeline — not hot path) or `packages/runner/` (UI — different performance profile).

## Constraints

1. **Foundation 8 (Determinism)**: Object shape changes do not affect runtime behavior — `undefined` property reads already return `undefined`. The change is purely about V8 optimization, not about semantics.

2. **Foundation 14 (No Backwards Compatibility)**: All construction sites are migrated in one change per type. No `?` → `| undefined` gradual migration.

3. **Foundation 16 (Testing as Proof)**: Add a property-based test that verifies: for every GameState construction site, the produced object has the same set of own property names. This can be done by collecting `Object.keys()` from GameState objects across different game configurations and asserting they are always identical.

## Risk Assessment

**Low risk, moderate reward.** Each type conversion is localized to its construction sites. The change is purely about V8 hidden class consistency — no behavioral change. The lint rule prevents regressions.

**This spec should be implemented BEFORE Specs 128 and 129** because:
- Spec 128 (draft state) will modify GameState construction sites. Shape discipline should be established first.
- Spec 129 (integer IDs) will change type signatures. Consistent shapes should be baseline before the ID migration.
- The lint rule prevents future experiments from accidentally re-introducing polymorphism.

## Expected Impact

- **Target**: 2-4% reduction in `combined_duration_ms` (reducing megamorphic loads from 6% to ~2-3%)
- **Compound effect**: Establishing shape discipline makes Specs 128/129 safer — V8 can optimize the new patterns from the start instead of fighting polymorphism introduced during migration
- **Measurement**: `fitl-perf-optimization` campaign harness
- **Validation**: all existing tests pass + stateHash determinism preserved
