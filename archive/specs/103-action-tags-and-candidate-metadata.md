# Spec 103: Action Tags and Candidate Metadata

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Blocks**: None (but simplifies authored profiles, making future specs easier to reason about)
**Estimated effort**: 3-5 days

## Problem Statement

Every game defines N boolean candidate features of the form `is<Action>: { eq: [candidate.actionId, <actionName>] }`. FITL has 16 such features (`isPass`, `isEvent`, `isRally`, `isMarch`, `isAttack`, `isTerror`, `isTax`, `isSubvert`, `isInfiltrate`, `isBombard`, `isTrain`, `isPatrol`, `isAssault`, `isAdvise`, `isSweep`, `isGovern`). Texas Hold'em has 5 (`isCheck`, `isCall`, `isRaise`, `isAllIn`, `isFold`).

Additionally, `candidate.isPass` exists as a hard-coded intrinsic in `AGENT_POLICY_CANDIDATE_INTRINSICS` (`packages/engine/src/cnl/policy-contract.ts`), duplicating the pattern at the engine level. With first-class tags, this intrinsic becomes redundant — `candidate.tag.pass` replaces it.

This "boolean forest" pattern:
1. Does not scale — every new action requires a new feature definition
2. Cannot express action families (e.g., "all insurgent operations") without yet more boolean features
3. Inflates the authored YAML and compiled IR with repetitive boilerplate
4. Makes profile assembly verbose — every `is<Action>` feature must be referenced in score terms

The external review identified this as one of the most visible authoring pain points and recommended first-class action tags and metadata.

## Goals

- Add optional `tags` to action definitions in GameSpecDoc
- Compile an `ActionTagIndex` on `GameDef`, mapping each action ID to its tag set and vice versa
- Expose new policy ref surfaces via a new `candidateTag` ref kind: `candidate.tag.<tagName>` (boolean) and `candidate.tags` (idList)
- Enable tag-set membership tests via the existing `in` operator
- Remove all `is<Action>` boolean candidate features from FITL and Texas Hold'em agent profiles
- Remove the `isPass` intrinsic from `AGENT_POLICY_CANDIDATE_INTRINSICS` — replaced by `candidate.tag.pass`
- Enable action families as shared tags (e.g., `insurgent-operation` groups rally, march, attack, terror)

## Non-Goals

- Action metadata beyond tags (e.g., authored costs, effect annotations) — future work
- Changing the action definition schema beyond adding `tags`
- Modifying the kernel's action enumeration or legality pipeline

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Tags are generic string labels, not game-specific. The compiler and runtime process them generically. |
| **2. Evolution-First** | Tags live in GameSpecDoc YAML. Evolution can add/remove tags. |
| **7. Specs Are Data** | Tags are declarative string arrays, no code. |
| **8. Determinism** | Static compilation. Same spec = same tag index. Tag lookup is a pure function. |
| **10. Bounded Computation** | Tag sets are finite (bounded by action count × max tags per action). Lookup is O(1). |
| **11. Immutability** | `ActionTagIndex` is deeply readonly. Tag lookup returns frozen arrays. |
| **12. Compiler-Kernel Boundary** | Tag index is built at compile time. Runtime performs lookup only. |
| **14. No Backwards Compatibility** | `is<Action>` features removed in the same change. `candidate.isPass` intrinsic removed. All owned game specs migrated. |
| **16. Testing as Proof** | Tag index compilation tests. Tag ref resolution tests. Migration coverage for both games. Behavioral equivalence proven for migrated profiles. |

## Design

### Part A: GameSpecDoc Schema — Action Tags

Actions in the GameSpecDoc gain an optional `tags` field. Actions are defined as an array of objects with `id` fields:

```yaml
actions:
  - id: rally
    tags: [insurgent-operation, placement]
    # ... existing action fields (effects, preconditions, etc.)
  - id: march
    tags: [insurgent-operation, movement]
  - id: attack
    tags: [insurgent-operation, combat]
  - id: terror
    tags: [insurgent-operation, destabilize]
  - id: train
    tags: [coin-operation, placement]
  - id: patrol
    tags: [coin-operation, movement]
  - id: sweep
    tags: [coin-operation, combat]
  - id: assault
    tags: [coin-operation, combat]
  - id: govern
    tags: [coin-operation, governance]
  - id: advise
    tags: [coin-operation, support]
  - id: tax
    tags: [coin-operation, economic]
  - id: subvert
    tags: [insurgent-special-activity]
  - id: infiltrate
    tags: [insurgent-special-activity]
  - id: bombard
    tags: [coin-special-activity]
  - id: event
    tags: [event-play]
  - id: pass
    tags: [pass]
```

- `tags` is an optional `string[]` on `GameSpecActionDef`, defaults to `[]`
- Tag names are kebab-case identifiers
- Tags are validated at compile time: no empty strings, no duplicates within a single action
- The same tag can appear on multiple actions (that's the point — it creates families)

Type change in `game-spec-doc.ts`:

```typescript
export interface GameSpecActionDef {
  // ... existing fields ...
  readonly tags?: readonly string[];  // NEW
}
```

### Part B: Compiled IR

```typescript
// New type in types-core.ts
export interface CompiledActionTagIndex {
  /** Maps each actionId to its set of tags (as a sorted readonly string array). */
  readonly byAction: Readonly<Record<string, readonly string[]>>;
  /** Maps each tag to the set of actionIds that carry it (as a sorted readonly string array). */
  readonly byTag: Readonly<Record<string, readonly string[]>>;
}
```

The tag index lives on `GameDef` (not `AgentPolicyCatalog`), because tags are action metadata — a game-level concept that agents reference but don't own:

```typescript
// Added to GameDef in types-core.ts
export interface GameDef {
  // ... existing fields ...
  readonly actionTagIndex?: CompiledActionTagIndex;  // NEW
}
```

The field is optional — games with no tagged actions produce `undefined`, preserving current behavior.

A corresponding Zod schema must be added to `schemas-core.ts`:

```typescript
const CompiledActionTagIndexSchema = z.object({
  byAction: z.record(StringSchema, z.array(StringSchema)),
  byTag: z.record(StringSchema, z.array(StringSchema)),
}).strict();
```

And `GameDefSchema` updated to include `actionTagIndex: CompiledActionTagIndexSchema.optional()`.

The `byTag` reverse index enables fast tag membership checks and future tag-based aggregation.

### Part C: New Policy Ref Surfaces

| Reference | Type | Ref Kind | Description |
|-----------|------|----------|-------------|
| `candidate.tag.<tagName>` | boolean | `candidateTag` | Whether the candidate's action has the given tag |
| `candidate.tags` | idList | `candidateTags` | All tags on the candidate's action |

These are **not** intrinsics. Intrinsics (`actionId`, `stableMoveKey`, `paramCount`) are structural properties that exist regardless of game content. Tags are game-authored content — they belong to a new ref kind.

**Ref path parsing**: `candidate.tag.insurgent-operation` is a 3-segment path. The `resolveRuntimeRef` method in `compile-agents.ts` (currently at ~line 1671) must be extended to recognize the `tag` segment after `candidate` and extract the third segment as the tag name.

Resolution in `compile-agents.ts` (extending `resolveRuntimeRef`):

```typescript
// candidate.tag.<tagName> → new ref kind
if (segments[0] === 'candidate' && segments[1] === 'tag' && segments.length === 3) {
  const tagName = segments[2]!;
  // Optionally warn if tagName doesn't appear in any action's tags (dead ref)
  return {
    valueType: 'boolean',
    costClass: 'candidate',
    ref: { kind: 'candidateTag', tagName },
  };
}

// candidate.tags → all tags for the candidate's action
if (segments[0] === 'candidate' && segments[1] === 'tags' && segments.length === 2) {
  return {
    valueType: 'idList',
    costClass: 'candidate',
    ref: { kind: 'candidateTags' },
  };
}
```

The compiled ref IR types must be extended in `types-core.ts`:

```typescript
// New ref kinds (added to the existing ref kind union)
interface CandidateTagRef {
  readonly kind: 'candidateTag';
  readonly tagName: string;
}

interface CandidateTagsRef {
  readonly kind: 'candidateTags';
}
```

### Part D: Usage in Policies

Before (current — boolean forest):
```yaml
candidateFeatures:
  isRally:
    type: boolean
    expr: { eq: [{ ref: candidate.actionId }, rally] }
  isMarch:
    type: boolean
    expr: { eq: [{ ref: candidate.actionId }, march] }
  # ... 14 more ...

scoreTerms:
  preferRallyAction:
    weight: 1
    value: { boolToNumber: { ref: feature.isRally } }
```

After (with tags):
```yaml
scoreTerms:
  preferInsurgentOps:
    weight: 1
    value:
      boolToNumber:
        ref: candidate.tag.insurgent-operation
  preferPlacement:
    weight: 0.5
    value:
      boolToNumber:
        ref: candidate.tag.placement
```

Or using `in` for membership:
```yaml
scoreTerms:
  preferCombat:
    weight: 2
    value:
      boolToNumber:
        in:
          - combat
          - { ref: candidate.tags }
```

### Part E: Compilation Pipeline

1. **Tag index compilation** (new function in `compile-agents.ts` or dedicated `compile-action-tags.ts`):
   - Walk all action definitions, collect `tags` arrays
   - Build `byAction` and `byTag` indexes (both sorted for determinism)
   - Validate: no empty tags, no duplicate tags per action, all tag names are valid kebab-case identifiers
   - Store on `GameDef.actionTagIndex`

2. **Ref resolution extension** in `compile-agents.ts`:
   - Extend `resolveRuntimeRef` to handle `candidate.tag.<name>` (3-segment path → `candidateTag` ref kind)
   - Extend `resolveRuntimeRef` to handle `candidate.tags` (2-segment path → `candidateTags` ref kind)
   - At compile time, optionally warn if `<name>` in `candidate.tag.<name>` doesn't appear in any action's `tags` (dead ref warning)

3. **Expression type inference** in `policy-expr.ts`:
   - `candidateTag` ref kind → `boolean` type, `candidate` cost class
   - `candidateTags` ref kind → `idList` type, `candidate` cost class

4. **Runtime evaluation** in the policy evaluation pipeline:
   - `candidateTag`: look up `actionTagIndex.byAction[candidateActionId]`, return whether `tagName` is in the array
   - `candidateTags`: return `actionTagIndex.byAction[candidateActionId] ?? []`

5. **`isPass` intrinsic removal**:
   - Remove `'isPass'` from `AGENT_POLICY_CANDIDATE_INTRINSICS` in `policy-contract.ts`
   - Remove the `isPass` case from `resolveRuntimeRef` in `compile-agents.ts`
   - All usages migrate to `candidate.tag.pass`

6. **`compiler-core.ts`** wiring:
   - Call tag index compilation after action compilation
   - Store result on `GameDef.actionTagIndex`
   - Pass tag index to agent compilation context for dead-ref warnings

### Part F: Cost Classification

- `candidateTag` and `candidateTags` refs have cost class `candidate` (depend on which candidate is being evaluated)
- Same cost class as existing `candidate.actionId` — no new cost class needed

## Testing

1. **Tag index compilation test**: compile a spec with tagged actions, assert `byAction` and `byTag` maps are correct and sorted
2. **Tag ref resolution test**: `candidate.tag.insurgent-operation` returns true for rally, false for train
3. **Tags ref resolution test**: `candidate.tags` returns correct list for each action
4. **Dead tag warning test**: ref to `candidate.tag.nonexistent` produces compiler warning
5. **FITL migration test**: compile FITL with tags, verify all `is<Action>` features are removed, agent behavior is equivalent
6. **Texas Hold'em migration test**: same for Texas Hold'em
7. **Empty tags test**: action with no tags → `candidate.tag.*` returns false, `candidate.tags` returns `[]`
8. **Golden test updates**: compiled GameDef output includes `actionTagIndex`
9. **`isPass` intrinsic removal test**: `candidate.isPass` is no longer a valid ref; `candidate.tag.pass` works instead
10. **`in` operator with tags test**: `in: [combat, { ref: candidate.tags }]` evaluates correctly
11. **Zod schema validation test**: GameDef with `actionTagIndex` passes `GameDefSchema.safeParse`
12. **Diagnostic registry audit**: any new `CNL_COMPILER_*` codes pass the registry audit

## Migration Checklist

- [ ] Add `tags` field to `GameSpecActionDef` in `game-spec-doc.ts`
- [ ] Add `CompiledActionTagIndex` type to `types-core.ts`
- [ ] Add `actionTagIndex` field to `GameDef` in `types-core.ts`
- [ ] Add `CompiledActionTagIndexSchema` to `schemas-core.ts`
- [ ] Update `GameDefSchema` to include `actionTagIndex`
- [ ] Add `CandidateTagRef` and `CandidateTagsRef` to compiled ref kind union in `types-core.ts`
- [ ] Implement tag index compilation (new function or in `compile-agents.ts`)
- [ ] Wire tag index compilation in `compiler-core.ts`
- [ ] Extend `resolveRuntimeRef` in `compile-agents.ts` for `candidate.tag.*` and `candidate.tags`
- [ ] Add tag ref type inference to `policy-expr.ts`
- [ ] Add runtime evaluation for `candidateTag` and `candidateTags` ref kinds
- [ ] Remove `isPass` from `AGENT_POLICY_CANDIDATE_INTRINSICS` in `policy-contract.ts`
- [ ] Remove `isPass` case from `resolveRuntimeRef` in `compile-agents.ts`
- [ ] Register new `CNL_COMPILER_*` diagnostic codes in `compiler-diagnostic-codes.ts`
- [ ] Migrate FITL action definitions to include tags (`data/games/fire-in-the-lake/30-rules-actions.md`)
- [ ] Migrate FITL agent profile: remove all `is<Action>` features, replace score terms with tag refs (`data/games/fire-in-the-lake/92-agents.md`)
- [ ] Migrate Texas Hold'em action definitions to include tags (`data/games/texas-holdem/30-rules-actions.md`)
- [ ] Migrate Texas Hold'em agent profile: remove `is<Action>` features, replace with tag refs (`data/games/texas-holdem/92-agents.md`)
- [ ] Regenerate `GameDef.schema.json` via `pnpm -F @ludoforge/engine run schema:artifacts`
- [ ] Update all affected tests and golden fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
