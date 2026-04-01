# Spec 104: Unified Decision-Context Considerations

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 102 (shared observer model — observer profiles referenced by agent profiles)
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
- Add a `context.kind` ref kind that distinguishes evaluation contexts at runtime
- Unify the compiled IR, compilation pipeline, and runtime evaluation
- Preserve all existing scoring semantics (weight, value, when, unknownAs, clamp)
- Enable future context types without new library sections
- Derive completion guidance enablement from the presence of completion-scoped considerations (remove explicit `completionGuidance` config)

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
| **14. No Backwards Compatibility** | `scoreTerms`, `completionScoreTerms`, and `completionGuidance` removed. All owned specs migrated. |
| **15. Architectural Completeness** | Addresses the root cause (missing decision-context abstraction) rather than patching symptoms. Completion guidance enablement derived from scopes rather than a separate flag. |
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
          boolToNumber: { ref: candidate.tag.event-play }
```

Fields per consideration:
- `scopes` (required): non-empty array of `'move'` | `'completion'`. Declares which decision contexts this consideration participates in.
- `weight`: policy expression for the weight (unchanged from scoreTerms)
- `value`: policy expression for the value (unchanged)
- `when` (optional): guard condition (unchanged)
- `unknownAs` (optional): numeric fallback (unchanged)
- `clamp` (optional): `{ min?, max? }` (unchanged)

### Part B: Context Kind Ref

New ref kind in the `CompiledAgentPolicyRef` union:

```typescript
// In types-core.ts, added to CompiledAgentPolicyRef union
| {
    readonly kind: 'contextKind';
  }
```

| Reference | Type | Ref Kind | Description |
|-----------|------|----------|-------------|
| `context.kind` | id | `contextKind` | Current evaluation context: `'move'` or `'completion'` |

This is a ref kind (like `candidateTag` from Spec 103), not a surface. The corresponding Zod schema variant must be added to `CompiledAgentPolicyRefSchema` in `schemas-core.ts`.

Resolution in `compile-agents.ts` (extending `resolveRuntimeRef`):
```typescript
if (refPath === 'context.kind') {
  return { type: 'id', costClass: 'state', ref: { kind: 'contextKind' } };
}
```

Runtime evaluation in `policy-evaluation-core.ts`:
```typescript
case 'contextKind':
  return this.input.completion !== undefined ? 'completion' : 'move';
```

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
- `completionGuidance` config → removed (derived from presence of completion-scoped considerations in `use.considerations`)

### Part D: Compiled IR

```typescript
// Renamed from CompiledAgentScoreTerm — adds scopes field
export interface CompiledAgentConsideration {
  readonly scopes: readonly ('move' | 'completion')[];
  readonly costClass: AgentPolicyCostClass;
  readonly when?: AgentPolicyExpr;
  readonly weight: AgentPolicyExpr;
  readonly value: AgentPolicyExpr;
  readonly unknownAs?: number;
  readonly clamp?: { readonly min?: number; readonly max?: number };
  readonly dependencies: CompiledAgentDependencyRefs;
}

// In CompiledAgentLibraryIndex (types-core.ts:682)
export interface CompiledAgentLibraryIndex {
  readonly stateFeatures: Readonly<Record<string, CompiledAgentStateFeature>>;
  readonly candidateFeatures: Readonly<Record<string, CompiledAgentCandidateFeature>>;
  readonly candidateAggregates: Readonly<Record<string, CompiledAgentAggregate>>;
  readonly pruningRules: Readonly<Record<string, CompiledAgentPruningRule>>;
  readonly considerations: Readonly<Record<string, CompiledAgentConsideration>>;  // replaces scoreTerms + completionScoreTerms
  readonly tieBreakers: Readonly<Record<string, CompiledAgentTieBreaker>>;
  readonly strategicConditions: Readonly<Record<string, CompiledStrategicCondition>>;
}

// In CompiledAgentProfile (types-core.ts:702)
export interface CompiledAgentProfile {
  readonly fingerprint: string;
  readonly observerName?: string;
  readonly params: Readonly<Record<string, AgentParameterValue>>;
  readonly use: {
    readonly considerations: readonly string[];  // replaces scoreTerms + completionScoreTerms
    readonly pruningRules: readonly string[];
    readonly tieBreakers: readonly string[];
  };
  // completionGuidance REMOVED — derived from presence of completion-scoped considerations
  readonly preview?: PreviewToleranceConfig;
  readonly plan: {
    readonly stateFeatures: readonly string[];
    readonly candidateFeatures: readonly string[];
    readonly candidateAggregates: readonly string[];
    readonly considerations: readonly string[];  // replaces implicit scoreTerms/completionScoreTerms plan entries
  };
}
```

Completion guidance is implicitly enabled when a profile's `use.considerations` includes any consideration with `'completion'` in its `scopes`. The runtime checks this at evaluation time by filtering the considerations list.

### Part E: Compilation Changes

1. `compile-agents.ts` — `AgentLibraryCompiler`:
   - Remove `compileScoreTerm()` (~line 1229) and `compileCompletionScoreTerm()` (~line 1299) methods
   - Add `compileConsideration()` method that validates scopes, then compiles weight/value/when expressions
   - Scope-specific validation:
     - `completion` scope: `decision.*` and `option.*` refs are allowed
     - `move` scope: `candidate.*` and `preview.*` refs are allowed
     - A consideration with `scopes: [move, completion]` that references scope-specific refs without a `context.kind` guard emits a **warning** (not error) — the `when` clause may provide the guard at runtime
     - A consideration with `scopes: [completion]` only that references `candidate.*` or `preview.*` is a **compile error** (will always fail at runtime)
     - A consideration with `scopes: [move]` only that references `decision.*` or `option.*` is a **compile error**
   - Remove `scoreTermStatus` and `completionScoreTermStatus` tracking maps → replace with `considerationStatus`
2. `validate-agents.ts`:
   - Validate `scopes` is non-empty and contains only `'move'` | `'completion'`
   - Validate profile `use.considerations` references exist in library
   - Remove validation for `use.scoreTerms` and `use.completionScoreTerms`
3. Profile lowering:
   - `use.considerations` replaces `use.scoreTerms` + `use.completionScoreTerms`
   - `completionGuidance` config removed — no longer lowered
   - `plan.considerations` derived from `use.considerations` transitive dependencies

### Part F: Runtime Changes

1. `policy-eval.ts` (move-level scoring):
   - Filter profile's considerations to those with `'move'` in scopes
   - Evaluate filtered set (same scoring loop as current scoreTerms)
   - Set `context.kind = 'move'` in evaluation context
2. `completion-guidance-eval.ts` (completion-level scoring):
   - Filter profile's considerations to those with `'completion'` in scopes
   - Evaluate filtered set (same scoring loop as current completionScoreTerms)
   - Set `context.kind = 'completion'` in evaluation context
   - Completion guidance is enabled when the filtered set is non-empty (replaces explicit `completionGuidance` config check)
3. `policy-evaluation-core.ts`:
   - Add `contextKind` ref kind handling: returns `'move'` or `'completion'` based on `this.input.completion` presence
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

**Single-scope violations are errors**: A consideration with `scopes: [completion]` referencing `candidate.*` is a compile error (will fail at runtime).

**Dual-scope cross-context refs are warnings**: A consideration with `scopes: [move, completion]` referencing `candidate.*` without a visible `context.kind` guard emits a warning — the `when` clause or `if` expression may provide the guard at runtime, which the compiler cannot statically verify.

## Testing

1. **Scope filtering test**: consideration with `scopes: [move]` is not evaluated in completion context, and vice versa
2. **Dual-scope test**: consideration with `scopes: [move, completion]` runs in both contexts with correct `context.kind` value
3. **Scope validation test**: consideration referencing `preview.*` with `scopes: [completion]` fails compilation
4. **context.kind ref test**: `{ eq: [{ ref: context.kind }, move] }` returns true in move context, false in completion
5. **Behavioral equivalence test**: FITL and Texas Hold'em produce identical move selections before and after migration (same seed, same state, same candidates)
6. **Profile validation test**: profile referencing non-existent consideration fails
7. **Golden tests**: updated compiled GameDef output
8. **Empty considerations test**: profile with no considerations compiles and produces score 0 for all candidates
9. **Derived completion guidance test**: profile with completion-scoped consideration enables completion guidance; profile without does not
10. **Dual-scope warning test**: consideration with `scopes: [move, completion]` using `candidate.*` without `context.kind` guard emits warning

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

Profile `use:` section changes:
- `scoreTerms: [...]` + `completionScoreTerms: [...]` → `considerations: [...]` (merged list)
- `completionGuidance` config removed

### Texas Hold'em

All current scoreTerms become `considerations` with `scopes: [move]`. No completionScoreTerms exist, so no completion-scoped considerations.

## Migration Checklist

- [ ] Rename `CompiledAgentScoreTerm` → `CompiledAgentConsideration` in `types-core.ts` (add `scopes` field)
- [ ] Replace `scoreTerms` + `completionScoreTerms` with `considerations` in `CompiledAgentLibraryIndex`
- [ ] Replace `scoreTerms` + `completionScoreTerms` with `considerations` in `CompiledAgentProfile.use`
- [ ] Remove `completionGuidance` from `CompiledAgentProfile`
- [ ] Update `plan` section in `CompiledAgentProfile` to include `considerations`
- [ ] Add `contextKind` ref kind to `CompiledAgentPolicyRef` union in `types-core.ts`
- [ ] Add `considerations` to library schema in `game-spec-doc.ts`
- [ ] Remove `scoreTerms` and `completionScoreTerms` from library schema in `game-spec-doc.ts`
- [ ] Update profile schema: `use.considerations` replaces `use.scoreTerms` + `use.completionScoreTerms`
- [ ] Remove `completionGuidance` from profile schema in `game-spec-doc.ts`
- [ ] Update Zod schemas in `schemas-core.ts`: `CompiledAgentConsiderationSchema`, `CompiledAgentLibraryIndexSchema`, `CompiledAgentProfileSchema`, `contextKind` ref kind
- [ ] Implement `compileConsideration()` in `AgentLibraryCompiler`
- [ ] Remove `compileScoreTerm()` and `compileCompletionScoreTerm()`
- [ ] Add `context.kind` ref resolution in `compile-agents.ts`
- [ ] Add `contextKind` runtime evaluation in `policy-evaluation-core.ts`
- [ ] Rename `evaluateScoreTerm()` → `evaluateConsideration()` in `policy-evaluation-core.ts`
- [ ] Update `policy-eval.ts` to filter considerations by `move` scope
- [ ] Update `completion-guidance-eval.ts` to filter considerations by `completion` scope and derive enablement
- [ ] Update `validate-agents.ts`: scope validation, profile `use.considerations` validation
- [ ] Register new `CNL_COMPILER_*` diagnostic codes in `compiler-diagnostic-codes.ts`
- [ ] Update `CompileSectionResults` exhaustiveness test (`compiler-structured-results.test.ts`)
- [ ] Migrate FITL `92-agents.md`
- [ ] Migrate Texas Hold'em `92-agents.md`
- [ ] Regenerate `GameDef.schema.json` via `pnpm -F @ludoforge/engine run schema:artifacts`
- [ ] Update all affected tests and golden fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
