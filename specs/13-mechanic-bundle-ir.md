# Spec 13: Mechanic Bundle IR

**Status**: Draft
**Priority**: P2 (post-MVP)
**Complexity**: L
**Dependencies**: Spec 02, Spec 08b
**Estimated effort**: 3-5 days
**Source sections**: Brainstorming section 1.2

## Overview

Implement the Mechanic Bundle intermediate representation — composable "mechanic patches" that LLMs can generate, swap, and mutate during evolution. Bundles are the unit of mutation in the evolution pipeline (Spec 14). Each bundle defines a reusable game mechanic (e.g., deck-building, auction, worker placement) as a patch of variables, zones, tokens, actions, triggers, and setup effects. The composition engine merges multiple bundles into a complete GameSpecDoc, handling dependency resolution, conflict detection, and namespace isolation.

## Scope

### In Scope
- `MechanicBundle` type implementation (defined in Spec 02, implemented here)
- Bundle composition engine: merge N bundles → GameSpecDoc patch
- Dependency resolution: topological sort of `requires` graph
- Conflict detection: validate `conflicts` arrays
- Namespace isolation: bundle ID prefixes all names
- Parameter binding: resolve bundle parameters at composition time
- Bundle validation: structural and referential integrity
- Starter bundle library design (interface and 3-5 example bundles for testing)

### Out of Scope
- Full starter bundle library of 20-30 bundles (separate effort after this spec)
- Evolution operators that mutate bundles (Spec 14)
- LLM generation of bundles (Spec 14)
- Bundle versioning and semver compatibility (post-MVP enhancement)
- Bundle marketplace or registry
- Visual bundle editor

## Key Types & Interfaces

### MechanicBundle (from Spec 02)

```typescript
interface MechanicBundle {
  readonly id: string;
  readonly name: string;
  readonly patch: {
    readonly variables?: readonly VariableDef[];
    readonly zones?: readonly ZoneDef[];
    readonly tokenTypes?: readonly TokenTypeDef[];
    readonly actions?: readonly ActionDef[];
    readonly triggers?: readonly TriggerDef[];
    readonly setup?: readonly EffectAST[];
    readonly constants?: Readonly<Record<string, number>>;
  };
  readonly requires?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly parameters?: readonly ParameterDef[];
  readonly mutationPoints?: readonly string[];
}
```

### Composition API

```typescript
// Compose multiple bundles into a GameSpecDoc patch
function composeBundles(
  bundles: readonly MechanicBundle[],
  paramBindings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  // paramBindings[bundleId][paramName] = value
): {
  readonly doc: Partial<GameSpecDoc>;
  readonly diagnostics: readonly Diagnostic[];
};

// Validate a single bundle for structural integrity
function validateBundle(bundle: MechanicBundle): readonly Diagnostic[];

// Validate bundle compatibility (can these bundles coexist?)
function validateBundleCompatibility(
  bundles: readonly MechanicBundle[]
): readonly Diagnostic[];

// Resolve dependency order (topological sort)
function resolveDependencyOrder(
  bundles: readonly MechanicBundle[]
): {
  readonly ordered: readonly MechanicBundle[];
  readonly diagnostics: readonly Diagnostic[];
};
```

### Bundle Registry (for starter library)

```typescript
interface BundleRegistry {
  readonly bundles: ReadonlyMap<string, MechanicBundle>;
  get(id: string): MechanicBundle | undefined;
  list(): readonly MechanicBundle[];
  findByTag(tag: string): readonly MechanicBundle[];
}

function createBundleRegistry(
  bundles: readonly MechanicBundle[]
): BundleRegistry;
```

## Implementation Requirements

### Bundle Composition Engine

`composeBundles(bundles, paramBindings)`:

1. **Dependency resolution**: Build dependency graph from `requires` arrays. Topological sort. Error if circular dependency detected.
2. **Conflict detection**: For each bundle, check if any other bundle is in its `conflicts` list (and vice versa). Error if conflicts found.
3. **Parameter binding**: For each bundle with `parameters`, resolve values from `paramBindings`. Use `default` if no binding provided. Validate value is within `[min, max]` range for numeric params.
4. **Namespace prefixing**: For each bundle, prefix all names with `bundleId.`:
   - Variables: `bundleId.varName`
   - Zones: `bundleId.zoneName`
   - Token types: `bundleId.tokenType`
   - Actions: `bundleId.actionName`
   - Triggers: `bundleId.triggerName`
   - Constants: `bundleId.constName`
   - Internal references within the bundle are also updated to use prefixed names
5. **Merge**: Combine all bundle patches additively:
   - Variables: concatenate all variable arrays
   - Zones: concatenate all zone arrays
   - Token types: concatenate
   - Actions: concatenate
   - Triggers: concatenate
   - Setup effects: concatenate in dependency order
   - Constants: merge records (error on collision after prefixing — should be impossible if prefixing is correct)
6. **Collision check**: After prefixing, verify no name collisions exist. If two bundles somehow produce the same prefixed name (e.g., via nested requires), emit `NamespaceCollision` diagnostic.
7. **Return**: Merged GameSpecDoc patch + diagnostics

### Dependency Resolution

`resolveDependencyOrder(bundles)`:

1. Build directed graph: bundle A → bundle B if A `requires` B
2. Detect cycles using DFS with coloring (white/gray/black)
3. If cycle found: diagnostic with the cycle path (e.g., "A requires B requires C requires A")
4. Topological sort: dependencies come before dependents
5. If a `requires` references a bundle not in the input set: diagnostic with missing bundle ID

### Conflict Detection

`validateBundleCompatibility(bundles)`:

1. For each bundle A, for each bundle B in A's `conflicts` list:
   - If B is present in the input bundles → error diagnostic
2. Also check reverse: for each bundle B, if B's `conflicts` includes A and A is present → error
3. Conflicts are symmetric: if A conflicts with B, the error is raised regardless of which declares the conflict

### Namespace Isolation

All names within a bundle are prefixed with `bundleId.` during composition:

```
Bundle "auction":
  action: "bid"   → "auction.bid"
  variable: "pot" → "auction.pot"
  zone: "pool"    → "auction.pool"
```

Internal references within a bundle (e.g., an action referencing a variable) must also be updated:

```
action "bid" with effect { addVar: { var: "pot", delta: 1 } }
→
action "auction.bid" with effect { addVar: { var: "auction.pot", delta: 1 } }
```

### Parameter Binding

Bundles can declare configurable parameters:

```typescript
{
  id: "auction",
  parameters: [
    { name: "startingBid", type: "int", default: 1, min: 0, max: 100 },
    { name: "bidIncrement", type: "int", default: 1, min: 1, max: 10 }
  ],
  patch: {
    constants: { startingBid: 1, bidIncrement: 1 }
    // These values are replaced by parameter bindings during composition
  }
}
```

During composition, parameter values replace constants:
```typescript
composeBundles([auctionBundle], {
  "auction": { startingBid: 5, bidIncrement: 2 }
})
// Result: constants have startingBid=5, bidIncrement=2
```

### Bundle Validation

`validateBundle(bundle)`:

1. `id` is non-empty string, valid identifier format
2. `name` is non-empty string
3. `patch` has at least one non-empty field
4. All internal references are consistent (actions reference variables that exist in the patch)
5. `parameters` have valid types and ranges
6. `requires` and `conflicts` reference valid bundle ID format
7. `mutationPoints` reference valid paths within the bundle

### Starter Bundle Examples (3-5 for testing)

Define example bundles to validate the composition engine:

1. **deck-core**: Basic deck operations (deck zone, hand zone, draw action, discard action)
2. **resource-core**: Resource variables (money, VP), gain/spend actions
3. **auction-ascending**: Ascending auction mechanic (bid action, pot variable, resolve trigger). Requires: resource-core.
4. **market-row**: Market display with buy/refill mechanic. Requires: resource-core, deck-core.
5. **push-luck**: Press-your-luck loop (draw-or-stop, bust condition). Requires: deck-core.

These serve as test fixtures and examples for the full library.

## Invariants

1. Bundle composition is deterministic (same bundles + same params = same output)
2. Circular dependencies detected and rejected with diagnostic showing the cycle
3. Conflicting bundles detected before composition (not during)
4. Namespace isolation prevents cross-bundle name collisions
5. Missing required bundles produce clear error diagnostic listing which bundle is missing
6. Parameter values are validated against declared ranges
7. Composition is additive — bundles add definitions, never replace
8. All names in composed output are prefixed (no raw bundle-internal names leak)
9. Internal references within bundles are updated to use prefixed names
10. Empty bundle (no patch content) composes without error but produces warning

## Required Tests

### Unit Tests

**Single bundle**:
- Validate valid bundle → zero diagnostics
- Validate bundle with missing id → error
- Validate bundle with empty patch → warning
- Compose single bundle → valid GameSpecDoc patch with prefixed names

**Two compatible bundles**:
- Compose resource-core + auction → merged patch with all variables, zones, actions
- All names prefixed correctly (resource-core.money, auction.bid, etc.)
- Internal references updated (auction.bid references resource-core.money)

**Conflict detection**:
- Bundle A conflicts with Bundle B, both present → error diagnostic
- Bundle A conflicts with Bundle C, C not present → no error
- Symmetric conflict: B conflicts A (not declared on A) → still detected

**Dependency resolution**:
- A requires B, both present → B ordered before A
- A requires B, B not present → error with missing bundle ID
- A requires B requires C → C, B, A order
- A requires B, B requires A → circular dependency error with cycle path

**Namespace isolation**:
- Two bundles both define variable "score" → after prefixing: "bundle1.score" and "bundle2.score", no collision
- Collision detection: if somehow same prefixed name → NamespaceCollision diagnostic

**Parameter binding**:
- Bundle with param "startingBid" default=1, bind to 5 → constant value is 5
- Bundle with param min=0 max=100, bind to 150 → error (out of range)
- Bundle with param, no binding provided → uses default value
- Bundle with no parameters, binding provided → ignored (or warning)

**Dependency ordering**:
- 3 bundles with linear dependency → correct topological order
- 3 bundles with diamond dependency (A→B, A→C, B→D, C→D) → valid order

### Integration Tests

- 3 bundles compose → valid GameSpecDoc patch that can be compiled (Spec 08b) to valid GameDef
- Composed result passes structural validation

### Property Tests

- For any set of non-conflicting, acyclic bundles, composition succeeds
- Composition is deterministic: same input → same output
- All names in composed output contain a `.` separator (prefixed)
- No name in composed output appears more than once

### Golden Tests

- resource-core + auction-ascending → expected composed GameSpecDoc patch

## Acceptance Criteria

- [ ] `composeBundles` merges multiple bundles correctly
- [ ] Circular dependencies detected with cycle path in diagnostic
- [ ] Conflicting bundles detected before composition
- [ ] Namespace prefixing applied to all names and internal references
- [ ] Missing dependencies produce clear diagnostics
- [ ] Parameter binding works with validation
- [ ] 3-5 starter bundles defined and tested
- [ ] Composition output is deterministic
- [ ] Composed patches can be compiled to valid GameDef (integration with Spec 08b)
- [ ] Bundle validation catches structural issues

## Files to Create/Modify

```
src/cnl/bundle.ts                # NEW — MechanicBundle operations
src/cnl/bundle-compose.ts        # NEW — composition engine
src/cnl/bundle-dependency.ts     # NEW — dependency resolution (topological sort)
src/cnl/bundle-namespace.ts      # NEW — namespace prefixing and collision detection
src/cnl/bundle-validate.ts       # NEW — bundle validation
src/cnl/bundle-registry.ts       # NEW — bundle registry
src/cnl/bundles/                 # NEW — directory for starter bundles
src/cnl/bundles/deck-core.ts     # NEW — example bundle
src/cnl/bundles/resource-core.ts # NEW — example bundle
src/cnl/bundles/auction.ts       # NEW — example bundle
src/cnl/index.ts                 # MODIFY — re-export bundle APIs
test/unit/bundle-compose.test.ts     # NEW
test/unit/bundle-dependency.test.ts  # NEW
test/unit/bundle-namespace.test.ts   # NEW
test/unit/bundle-validate.test.ts    # NEW
test/integration/bundle-compile.test.ts  # NEW — compose → compile integration
```
