# Spec 62: Conditional Piece Sourcing & Fallback Selection

**Status**: Draft
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 25, Spec 25b
**Estimated effort**: 2-4 days
**Source sections**: FITL card implementation gap discovered during card 87 (`Nguyen Chanh Thi`)

## Overview

Implement a game-agnostic piece-sourcing model that can express ordered fallback rules such as:

- prefer pieces from source A that satisfy qualifier Q
- if insufficient, source only the remaining needed pieces from source B using the same qualifier Q
- optionally continue through additional fallback sources in priority order

This capability is required to encode Fire in the Lake rules such as Rule 1.4.1 exactly, without hardcoding game-specific logic into `GameDef`, simulation, or kernel behavior. The solution must live in the generic GameSpecDoc/CNL/compiler/kernel stack and be reusable by any game that needs prioritized sourcing or replacement.

After this spec is implemented, the current card 87 implementation must be reviewed and reworked to use the new sourcing capability so that its unshaded side matches the rule precisely.

## Problem Statement

Current declarative sourcing can express:

- selecting from one source
- selecting from a concatenated pool of sources
- filtering pieces by faction/type/zone

Current declarative sourcing cannot express:

- "take up to N pieces of the desired type from Available; only if that type is unavailable there, continue sourcing that same type from map spaces"
- "the fallback source is conditional on insufficiency of prior sources"
- "the fallback selection count is the remaining unmet count after earlier sources are applied"
- "the qualifier used to determine fallback eligibility is shared across all source tiers"

As a result, card 87 currently over-allows ARVN pieces already on the map to be selected even when same-type ARVN pieces remain Available.

This is an architectural gap, not a card-specific bug.

## Goals

1. Add a generic sourcing abstraction that models ordered fallback selection.
2. Keep `GameDef`, simulation, and runtime fully game-agnostic.
3. Preserve game-specific rules in GameSpecDoc/YAML only.
4. Make the feature expressive enough for FITL card/event sourcing, operation sourcing, and future non-FITL games.
5. Avoid special-case runtime logic keyed on FITL factions, piece types, cards, or map regions.
6. Make the resulting compiled representation inspectable and testable.
7. Treat this as a forward-only architecture improvement; no backwards compatibility constraints are required.

## Non-Goals

- Do not implement FITL-specific hardcoded "desired type" rules in the kernel.
- Do not add special event-only codepaths.
- Do not solve visual presentation concerns in this spec.
- Do not redesign the whole query language if a focused sourcing abstraction is sufficient.

## Proposed Capability

Introduce a declarative **prioritized sourcing** construct that resolves selections across ordered tiers.

Conceptually:

```yaml
chooseN:
  bind: $pieces
  count: 3
  sourcing:
    kind: prioritized
    tiers:
      - id: available
        options: ...
        qualifierKey: ...
      - id: mapFallback
        options: ...
        qualifierKey: ...
        enabledWhen: priorTiersInsufficient
```

The exact syntax may differ, but the semantics must support:

1. Ordered source tiers.
2. A requested total count.
3. Per-tier option queries.
4. Shared qualifier semantics across tiers.
5. Remaining-count propagation from earlier tiers to later tiers.
6. Deterministic compilation and runtime behavior.

## Required Semantics

### 1. Ordered tier consumption

The sourcing model must treat tiers as an ordered list.

Given requested count `N`:

- tier 1 may satisfy some or all of `N`
- tier 2 may satisfy only the unmet remainder
- tier 3 may satisfy only the unmet remainder after tiers 1 and 2

No lower-priority tier may contribute while a higher-priority tier still has eligible items for the same qualified request.

### 2. Shared qualifier semantics

The model must support a shared qualifier that applies across tiers.

Examples:

- same piece type
- same faction and type
- same trait bundle
- same table-derived category

The qualifier must be declarative and generic, not encoded in kernel code as "piece type fallback".

### 3. Partial fulfillment

If all tiers together contain fewer than the requested count, the selection resolves to the maximum legal partial count, subject to the caller's min/max rules.

### 4. Legal choice surfaces

When a move is still awaiting user choice, legal choice generation must expose only the pieces currently legal under tier ordering.

That means:

- fallback-tier pieces are not legal while earlier tiers still contain qualifying pieces for the unmet portion
- once earlier tiers are exhausted for the qualifier, fallback-tier pieces become legal

### 5. Deterministic binding behavior

Resolved move params and runtime bindings must deterministically preserve the final chosen set and any intermediate tier-specific decisions needed by execution.

### 6. Compiler transparency

Compiled output must make the tier ordering and fallback logic observable enough for test assertions and debugging.

## Design Requirements

### A. Game-agnostic IR

The implementation must introduce or extend a generic IR surface in compiler/kernel types.

Acceptable directions include:

- a new options query kind for prioritized sourcing
- a new `chooseN` sourcing block lowered into existing effects plus compiler-generated helper bindings
- a dedicated lowerable intermediate form for staged selection

Unacceptable direction:

- adding FITL-specific branches anywhere in shared runtime/compiler code

### B. No hidden rule coupling

The runtime must not infer FITL concepts such as:

- ARVN / VC / US / NVA
- "desired type" as a hardcoded token prop
- "Available before map" as a card-specific heuristic

All such policy must come from GameSpecDoc-authored data.

### C. Extensible qualifier definition

Qualifier extraction must be generic enough to support future use cases. It must not be limited to `token.props.type`.

Examples of acceptable qualifier sources:

- token property
- zone property
- bound value expression
- table lookup result

### D. Strong diagnostics

Compilation and validation must reject malformed sourcing definitions with precise diagnostics.

Examples:

- missing qualifier definition when fallback matching depends on it
- unresolved binding used by qualifier
- incompatible tier domains
- illegal circular dependency between generated helper bindings

### E. Testability

The design must support:

- unit tests on compilation/lowering
- unit tests on legal choice generation
- unit tests on runtime execution
- integration tests on real FITL cards

## Candidate Execution Model

The implementation should evaluate one of these generic approaches and choose the smallest coherent model.

### Option 1: Compiler-lowered staged choose sequence

The compiler lowers prioritized sourcing into multiple internal `chooseN` stages:

- stage 1 selects from tier 1
- compiler computes remainder
- stage 2 selects from tier 2 constrained by qualifier and remainder
- repeat for later tiers
- compiler exports a flattened final binding

Pros:

- reuses existing runtime choice machinery
- easy to inspect in compiled effects
- keeps complex logic mostly in compiler lowering

Risks:

- binding lifetime and iteration-path handling must remain robust
- qualifier propagation may require helper bindings or aggregate expressions

### Option 2: New runtime query primitive for prioritized sources

Add a first-class runtime query/choice domain that understands tier order directly.

Pros:

- compact authored form
- legal choices may be simpler to compute directly

Risks:

- larger kernel surface increase
- higher implementation complexity in legal choice generation and apply-move paths

### Option 3: Hybrid sourcing IR

Add a dedicated sourcing IR node that the compiler may partially lower, while the runtime handles final admissibility.

Pros:

- clearer long-term abstraction for sourcing

Risks:

- more moving parts than Option 1

### Recommendation

Prefer **Option 1** unless detailed investigation finds a blocker. It best aligns with existing choice sequencing, keeps the runtime generic, and produces explicit compiled structure that is straightforward to test.

## Detailed Requirements

### Authoring Surface

The authoring model must allow GameSpecDoc data to express:

- a total requested count
- ordered source tiers
- qualifier extraction logic
- fallback matching against earlier unmet qualified demand

It must be concise enough that event authors can use it without writing opaque compiler tricks.

### Compiler

The compiler must:

1. Validate prioritized sourcing definitions.
2. Lower them deterministically.
3. Produce stable internal bind names / decision identities.
4. Preserve enough structure for readable diagnostics.
5. Avoid emitting ambiguous choice domains.

### Runtime

The runtime must:

1. Surface the correct pending choices in sequence.
2. Enforce tier order in legality checks.
3. Preserve normalized move params for resolved decision sequences.
4. Correctly flatten/export the final chosen result for downstream effects.

### Query/Value System

If implementation requires additional generic query/value support, add it generically.

Examples that may be needed:

- projecting qualifiers from selected items
- counting unmet qualified demand
- filtering a later source by a qualifier set derived from earlier unmet demand

These additions must be generic and documented in tests.

## Invariants

1. Prioritized sourcing behavior is deterministic.
2. Lower-priority tiers never contribute while higher tiers can still satisfy the same qualified remainder.
3. Qualifier matching is driven entirely by authored data.
4. No FITL-specific identifiers appear in shared compiler/kernel logic.
5. Resolved final bindings are stable and consumable by ordinary downstream effects.
6. Legal choice generation and move application agree on admissibility.

## Required Tests

### Unit Tests

Compiler/lowering:

- valid prioritized sourcing lowers successfully
- malformed tier definition emits diagnostic
- malformed qualifier reference emits diagnostic
- compiled bind structure is stable and inspectable

Runtime choice legality:

- tier 2 items are illegal while tier 1 still has qualifying items
- tier 2 items become legal once tier 1 is exhausted for the qualifier
- partial fulfillment across tiers works
- multiple qualifiers in one request work correctly

Runtime execution:

- resolved move params apply correctly
- final exported binding contains the merged selected set
- deterministic decision normalization preserves the staged selections

### Integration Tests

FITL:

- card 87 unshaded exact Rule 1.4.1 sourcing behavior
- at least one additional FITL regression test using the same capability once another candidate exists

Non-FITL/generic:

- add at least one small synthetic spec fixture demonstrating prioritized sourcing outside FITL terminology

## Implementation Plan

1. Design and document the new sourcing IR / authored surface.
2. Implement compiler validation and lowering.
3. Implement any required generic query/value/runtime support.
4. Add focused unit coverage.
5. Rework card 87 to use the new capability.
6. Replace the current documented card 87 precision gap with exact behavior.
7. Add regression tests proving the prior over-permissive selection is gone.

## Acceptance Criteria

This spec is complete when:

1. GameSpecDoc can express prioritized fallback sourcing generically.
2. The compiler and kernel enforce the behavior without FITL-specific code.
3. Card 87 unshaded is re-authored to use the new capability.
4. Card 87 no longer allows selecting on-map ARVN pieces of a type that is still Available.
5. Focused unit and integration tests pass.
6. The full relevant engine test suite passes.

## Follow-up Requirement

After implementing this spec, the current implementation of card 87 in:

- [065-096.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-events/065-096.md)

must be reviewed and reworked to use the new sourcing model. The present implementation should be treated as an interim encoding that intentionally over-approximates Rule 1.4.1 and must not be considered final once this capability exists.
