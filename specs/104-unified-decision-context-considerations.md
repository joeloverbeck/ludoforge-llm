# Spec 104: Unified Decision-Context Considerations

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 102 (shared observer model — observer refs in consideration expressions)
**Blocks**: Spec 105 (explicit preview contracts — considerations replace scoreTerms)
**Estimated effort**: 5-8 days

## Problem Statement

The Agent DSL has two structurally identical scoring languages:

1. **`scoreTerms`** — scores completed legal moves (top-level candidate selection)
2. **`completionScoreTerms`** — scores options within inner decisions during move completion (chooseOne/chooseN)

Both use the same `CompiledAgentScoreTerm` type (weight, value, when, unknownAs, clamp) and the same expression language. The only difference is the **evaluation context**: score terms see `candidate.*` and `preview.*` refs, while completion score terms see `decision.*` and `option.*` refs.

This duplication means:
1. The same scoring logic cannot be shared across move-level and completion-level contexts
2. Profiles must maintain two separate reference lists (`use.scoreTerms` and `use.completionScoreTerms`)
3. The compiler has two parallel compilation paths (`compileScoreTerm` and `compileCompletionScoreTerm`)
4. The runtime has two parallel evaluation paths (`policy-eval.ts` and `completion-guidance-eval.ts`)
5. Future context types (simultaneous moves, reaction windows, draft picks) would require yet another `*ScoreTerms` bucket

The external review diagnosed this correctly: the system lacks a first-class concept of a **decision context**. Completion guidance was the right feature, but it was architecturally bolted on as a separate DSL rather than unified into the existing scoring model.

## Goals

- Replace `scoreTerms` and `completionScoreTerms` with a single `considerations` library section
- Each consideration declares which decision contexts it applies to via `scopes`
- Add a `context.kind` ref that distinguishes evaluation contexts at runtime
- Unify the compiled IR, compilation pipeline, and runtime evaluation
- Preserve all existing scoring semantics (weight, value, when, unknownAs, clamp)
- Enable future context types without new library sections

## Non-Goals

- Adding new decision context types beyond `move` and `completion` (future work)
- Changing the expression language or operator set
- Adding scoring tiers, transforms, or mixed strategies (separate concern, deferred)
- Changing the pruning rules or tie-breaker model

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Considerations are generic — no game-specific logic. Context types are engine-defined. |
| **2. Evolution-First** | Considerations live in GameSpecDoc YAML. Evolution can mutate scopes and weights. |
| **7. Specs Are Data** | Scope declarations are declarative arrays, no code. |
| **8. Determinism** | Same profile + same state + same candidates = same scores. Scope filtering is deterministic. |
| **10. Bounded Computation** | Same bound as existing score terms — O(considerations × candidates). |
| **12. Compiler-Kernel Boundary** | Scope validation at compile time. Runtime filters by scope. |
| **14. No Backwards Compatibility** | `scoreTerms` and `completionScoreTerms` removed. All owned specs migrated. |
| **15. Architectural Completeness** | Addresses the root cause (missing decision-context abstraction) rather than patching symptoms. |
| **16. Testing as Proof** | Scope filtering tests. Equivalence tests proving migration doesn't change behavior. |

## Design

### Part A: GameSpecDoc Schema — Considerations

Replace `scoreTerms` and `completionScoreTerms` with `considerations`:

```yaml
agents:
  library:
    considerations:
      preferProjectedSelfMargin:
        scopes: [move]
        weight: { param: projectedMarginWeight }
        value: { ref: feature.projectedSelfMargin }

      preferPopulousTargets:
        scopes: [completion]
        when:
          and:
            - eq: [{ ref: context.kind }, completion]
            - eq: [{ ref: decision.type }, chooseN]
            - eq: [{ ref: decision.name }, "$targetSpaces"]
            - eq: [{ ref: decision.targetKind }, zone]
        weight: 2
        value:
          coalesce:
            - zoneProp:
                zone: { ref: option.value }
                prop: population
            - 0

      preferEvent:
        scopes: [move]
        weight: { param: eventWeight }
        value:
          boolToNumber: { ref: feature.isEvent }
```

Fields per consideration:
- `scopes` (required): non-empty array of `'move'` | `'completion'`. Declares which decision contexts this consideration participates in.
- `weight`: policy expression for the weight (unchanged from scoreTerms)
- `value`: policy expression for the value (unchanged)
- `when` (optional): guard condition (unchanged)
- `unknownAs` (optional): numeric fallback (unchanged)
- `clamp` (optional): `{ min?, max? }` (unchanged)

### Part B: Context Kind Ref

New ref surface:

| Reference | Type | Description |
|-----------|------|-------------|
| `context.kind` | id | Current evaluation context: `'move'` or `'completion'` |

This enables a single consideration with `scopes: [move, completion]` to branch on context:

```yaml
considerations:
  preferHighValue:
    scopes: [move, completion]
    weight: 1
    value:
      if:
        - eq: [{ ref: context.kind }, move]
        - { ref: feature.projectedSelfMargin }
        - coalesce:
            - zoneProp:
                zone: { ref: option.value }
                prop: population
            - 0
```

### Part C: Profile Schema

```yaml
profiles:
  us-baseline:
    observer: currentPlayer        # from Spec 102
    params: { ... }
    use:
      considerations:              # replaces scoreTerms + completionScoreTerms
        - preferProjectedSelfMargin
        - preferPopulousTargets
        - preferEvent
      pruningRules:
        - dropPassWhenOtherMovesExist
      tieBreakers:
        - stableMoveKey
```

- `use.scoreTerms` → removed
- `use.completionScoreTerms` → removed
- `use.considerations` → new, replaces both

### Part D: Compiled IR

```typescript
// Updated type — adds scopes field
interface CompiledAgentConsideration {
  readonly scopes: readonly ('move' | 'completion')[];
  readonly costClass: AgentPolicyCostClass;
  readonly when?: AgentPolicyExpr;
  readonly weight: AgentPolicyExpr;
  readonly value: AgentPolicyExpr;
  readonly unknownAs?: number;
  readonly clamp?: { readonly min?: number; readonly max?: number };
  readonly dependencies: CompiledAgentDependencyRefs;
}

// In CompiledAgentLibrary
interface CompiledAgentLibrary {
  readonly stateFeatures: Readonly<Record<string, CompiledAgentStateFeature>>;
  readonly candidateFeatures: Readonly<Record<string, CompiledAgentCandidateFeature>>;
  readonly candidateAggregates: Readonly<Record<string, CompiledAgentCandidateAggregate>>;
  readonly pruningRules: Readonly<Record<string, CompiledAgentPruningRule>>;
  readonly considerations: Readonly<Record<string, CompiledAgentConsideration>>;  // replaces scoreTerms + completionScoreTerms
  readonly tieBreakers: Readonly<Record<string, CompiledAgentTieBreaker>>;
  readonly strategicConditions: Readonly<Record<string, CompiledStrategicCondition>>;
}

// In CompiledAgentProfile.use
interface CompiledAgentProfileUse {
  readonly considerations: readonly string[];  // replaces scoreTerms + completionScoreTerms
  readonly pruningRules: readonly string[];
  readonly tieBreakers: readonly string[];
}
```

### Part E: Compilation Changes

1. `compile-agents.ts` — `AgentLibraryCompiler`:
   - Remove `compileScoreTerm()` and `compileCompletionScoreTerm()` methods
   - Add `compileConsideration()` method that validates scopes, then compiles weight/value/when expressions
   - Scope-specific validation:
     - `completion` scope: `decision.*` and `option.*` refs are allowed
     - `move` scope: `candidate.*` and `preview.*` refs are allowed
     - A consideration with `scopes: [move, completion]` may use refs from either context — the compiler validates that refs are guarded by `context.kind` checks (or are context-independent)
   - Remove `scoreTermStatus` and `completionScoreTermStatus` tracking maps → replace with `considerationStatus`
2. `validate-agents.ts`:
   - Validate `scopes` is non-empty and contains only `'move'` | `'completion'`
   - Validate profile `use.considerations` references exist in library
3. Profile lowering:
   - `use.considerations` replaces `use.scoreTerms` + `use.completionScoreTerms`

### Part F: Runtime Changes

1. `policy-eval.ts` (move-level scoring):
   - Filter profile's considerations to those with `'move'` in scopes
   - Evaluate filtered set (same scoring loop as current scoreTerms)
   - Set `context.kind = 'move'` in evaluation context
2. `completion-guidance-eval.ts` (completion-level scoring):
   - Filter profile's considerations to those with `'completion'` in scopes
   - Evaluate filtered set (same scoring loop as current completionScoreTerms)
   - Set `context.kind = 'completion'` in evaluation context
3. `policy-evaluation-core.ts`:
   - Add `context.kind` to the ref resolution whitelist
   - `evaluateScoreTerm()` renamed to `evaluateConsideration()` (same logic, new name)

### Part G: Scope Validation Rules

The compiler enforces these rules at compile time:

| Ref family | Allowed in `move` scope | Allowed in `completion` scope |
|------------|------------------------|------------------------------|
| `candidate.*` | Yes | No |
| `preview.*` | Yes | No |
| `decision.*` | No | Yes |
| `option.*` | No | Yes |
| `feature.*` | Yes | Yes |
| `var.*` | Yes | Yes |
| `metric.*` | Yes | Yes |
| `victory.*` | Yes | Yes |
| `strategic.*` | Yes | Yes |
| `aggregate.*` | Yes | Yes |
| `context.kind` | Yes | Yes |
| `seat.*` | Yes | Yes |
| `turn.*` | Yes | Yes |
| `activeCard.*` | Yes | Yes |

A consideration with `scopes: [move, completion]` that references `candidate.*` without a `context.kind` guard is a compile error — it would fail at runtime in the completion context.

## Testing

1. **Scope filtering test**: consideration with `scopes: [move]` is not evaluated in completion context, and vice versa
2. **Dual-scope test**: consideration with `scopes: [move, completion]` runs in both contexts with correct `context.kind` value
3. **Scope validation test**: consideration referencing `preview.*` with `scopes: [completion]` fails compilation
4. **context.kind ref test**: `{ eq: [{ ref: context.kind }, move] }` returns true in move context, false in completion
5. **Behavioral equivalence test**: FITL and Texas Hold'em produce identical move selections before and after migration (same seed, same state, same candidates)
6. **Profile validation test**: profile referencing non-existent consideration fails
7. **Golden tests**: updated compiled GameDef output
8. **Empty considerations test**: profile with no considerations compiles and produces score 0 for all candidates

## Migration

### FITL

Current:
```yaml
scoreTerms:
  preferProjectedSelfMargin: ...
  preferEvent: ...
  # ... 15+ terms

completionScoreTerms:
  preferPopulousTargets: ...
```

After:
```yaml
considerations:
  preferProjectedSelfMargin:
    scopes: [move]
    # ... same weight/value
  preferEvent:
    scopes: [move]
    # ... same weight/value
  preferPopulousTargets:
    scopes: [completion]
    # ... same when/weight/value
```

### Texas Hold'em

All current scoreTerms become `considerations` with `scopes: [move]`. No completionScoreTerms exist, so no completion-scoped considerations.

## Migration Checklist

- [ ] Add `considerations` to library schema in `game-spec-doc.ts`
- [ ] Remove `scoreTerms` and `completionScoreTerms` from library schema
- [ ] Add `CompiledAgentConsideration` type to `types-core.ts`
- [ ] Remove `CompiledAgentScoreTerm` type (or rename to `CompiledAgentConsideration`)
- [ ] Implement `compileConsideration()` in `AgentLibraryCompiler`
- [ ] Remove `compileScoreTerm()` and `compileCompletionScoreTerm()`
- [ ] Add `context.kind` ref resolution
- [ ] Update `policy-eval.ts` to filter considerations by `move` scope
- [ ] Update `completion-guidance-eval.ts` to filter considerations by `completion` scope
- [ ] Update profile schema: `use.considerations` replaces `use.scoreTerms` + `use.completionScoreTerms`
- [ ] Migrate FITL `92-agents.md`
- [ ] Migrate Texas Hold'em `92-agents.md`
- [ ] Update GameDef JSON schema
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
