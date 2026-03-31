# Spec 103: Action Tags and Candidate Metadata

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Blocks**: None (but simplifies authored profiles, making future specs easier to reason about)
**Estimated effort**: 3-5 days

## Problem Statement

Every game defines N boolean candidate features of the form `is<Action>: { eq: [candidate.actionId, <actionName>] }`. FITL has 14 such features (`isRally`, `isMarch`, `isAttack`, `isTerror`, `isTax`, `isSubvert`, `isInfiltrate`, `isBombard`, `isTrain`, `isPatrol`, `isAssault`, `isAdvise`, `isSweep`, `isGovern`). Texas Hold'em has 5 (`isCheck`, `isCall`, `isRaise`, `isAllIn`, `isFold`).

This "boolean forest" pattern:
1. Does not scale — every new action requires a new feature definition
2. Cannot express action families (e.g., "all insurgent operations") without yet more boolean features
3. Inflates the authored YAML and compiled IR with repetitive boilerplate
4. Makes profile assembly verbose — every `is<Action>` feature must be referenced in score terms

The external review identified this as one of the most visible authoring pain points and recommended first-class action tags and metadata.

## Goals

- Add optional `tags` to action definitions in GameSpecDoc
- Compile an `ActionTagIndex` mapping each action ID to its tag set
- Expose new policy ref surfaces: `candidate.tag.<tagName>` (boolean) and `candidate.tags` (idList)
- Enable tag-set membership tests via the existing `in` operator
- Remove all `is<Action>` boolean features from FITL and Texas Hold'em agent profiles
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
| **12. Compiler-Kernel Boundary** | Tag index is built at compile time. Runtime performs lookup only. |
| **14. No Backwards Compatibility** | `is<Action>` features removed in the same change. All owned game specs migrated. |
| **16. Testing as Proof** | Tag index compilation tests. Tag ref resolution tests. Migration coverage for both games. |

## Design

### Part A: GameSpecDoc Schema — Action Tags

Actions in the GameSpecDoc gain an optional `tags` field:

```yaml
actions:
  rally:
    tags: [insurgent-operation, placement]
    # ... existing action fields (effects, preconditions, etc.)
  march:
    tags: [insurgent-operation, movement]
  attack:
    tags: [insurgent-operation, combat]
  terror:
    tags: [insurgent-operation, destabilize]
  train:
    tags: [coin-operation, placement]
  patrol:
    tags: [coin-operation, movement]
  sweep:
    tags: [coin-operation, combat]
  assault:
    tags: [coin-operation, combat]
  govern:
    tags: [coin-operation, governance]
  advise:
    tags: [coin-operation, support]
  tax:
    tags: [coin-operation, economic]
  subvert:
    tags: [insurgent-special-activity]
  infiltrate:
    tags: [insurgent-special-activity]
  bombard:
    tags: [coin-special-activity]
  event:
    tags: [event-play]
  pass:
    tags: [pass]
```

- `tags` is an optional `string[]`, defaults to `[]`
- Tag names are kebab-case identifiers
- Tags are validated at compile time: no empty strings, no duplicates within a single action
- The same tag can appear on multiple actions (that's the point — it creates families)

### Part B: Compiled IR

```typescript
// New type in types-core.ts
interface CompiledActionTagIndex {
  /** Maps each actionId to its set of tags (as a sorted readonly string array). */
  readonly byAction: Readonly<Record<string, readonly string[]>>;
  /** Maps each tag to the set of actionIds that carry it (as a sorted readonly string array). */
  readonly byTag: Readonly<Record<string, readonly string[]>>;
}

// Added to CompiledGameDef (or CompiledAgentPolicyCatalog — wherever action metadata lives)
interface CompiledAgentPolicyCatalog {
  // ... existing fields ...
  readonly actionTagIndex: CompiledActionTagIndex;
}
```

The `byTag` reverse index enables fast tag membership checks and future tag-based aggregation.

### Part C: New Policy Ref Surfaces

| Reference | Type | Description |
|-----------|------|-------------|
| `candidate.tag.<tagName>` | boolean | Whether the candidate's action has the given tag |
| `candidate.tags` | idList | All tags on the candidate's action |

Resolution in `policy-surface.ts`:

```typescript
// candidate.tag.<tagName>
function resolveCandidateTagRef(tagName: string, actionId: string, tagIndex: CompiledActionTagIndex): boolean {
  const tags = tagIndex.byAction[actionId];
  return tags !== undefined && tags.includes(tagName);
}

// candidate.tags
function resolveCandidateTagsRef(actionId: string, tagIndex: CompiledActionTagIndex): readonly string[] {
  return tagIndex.byAction[actionId] ?? [];
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
  # ... 12 more ...

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

1. `compile-agents.ts` (or new `compile-action-tags.ts`):
   - Walk all action definitions, collect `tags` arrays
   - Build `byAction` and `byTag` indexes
   - Validate: no empty tags, no duplicate tags per action, all tag names are valid identifiers
2. `validate-agents.ts`:
   - Validate `candidate.tag.<name>` refs: warn if `<name>` doesn't appear in any action's tags (dead ref)
   - Validate `candidate.tags` ref is used with `in` operator (type check)
3. Expression type inference:
   - `candidate.tag.<name>` → `boolean`
   - `candidate.tags` → `idList`

### Part F: Cost Classification

- `candidate.tag.*` refs have cost class `candidate` (depend on which candidate is being evaluated)
- Same cost class as existing `candidate.actionId` — no new cost class needed

## Testing

1. **Tag index compilation test**: compile a spec with tagged actions, assert `byAction` and `byTag` maps
2. **Tag ref resolution test**: `candidate.tag.insurgent-operation` returns true for rally, false for train
3. **Tags ref resolution test**: `candidate.tags` returns correct list for each action
4. **Dead tag warning test**: ref to `candidate.tag.nonexistent` produces compiler warning
5. **FITL migration test**: compile FITL with tags, verify all `is<Action>` features are removed, agent behavior is equivalent
6. **Texas Hold'em migration test**: same for Texas Hold'em
7. **Empty tags test**: action with no tags → `candidate.tag.*` returns false, `candidate.tags` returns `[]`
8. **Golden test updates**: compiled GameDef output includes `actionTagIndex`

## Migration Checklist

- [ ] Add `tags` field to action definition schema in `game-spec-doc.ts`
- [ ] Add `CompiledActionTagIndex` type to `types-core.ts`
- [ ] Implement tag index compilation
- [ ] Add `candidate.tag.*` and `candidate.tags` ref resolution to `policy-surface.ts`
- [ ] Add tag ref type inference to expression compiler
- [ ] Migrate FITL action definitions to include tags
- [ ] Migrate FITL agent profile: remove `is<Action>` features, replace score terms with tag refs
- [ ] Migrate Texas Hold'em action definitions to include tags
- [ ] Migrate Texas Hold'em agent profile: remove `is<Action>` features, replace with tag refs
- [ ] Update GameDef JSON schema
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
