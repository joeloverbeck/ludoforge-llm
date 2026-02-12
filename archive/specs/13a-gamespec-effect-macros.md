# Spec 13a: GameSpecDoc Effect Macros

**Status**: COMPLETED
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 25c (extended kernel primitives)
**Source sections**: Brainstorming Sections 4.2, 7.4

## Overview

A compile-time parameterized macro system for GameSpecDoc YAML. Macros allow reusable effect patterns to be defined once and invoked multiple times with different parameters, expanding at compile time before GameDef generation. This eliminates duplication in Spec 26 operations that share complex effect logic (piece removal ordering, dynamic piece sourcing).

**Key constraint**: Macros are a GameSpecDoc authoring convenience. They expand entirely at compile time. The kernel and GameDef know nothing about macros — they only see expanded EffectAST nodes.

### New Kernel Primitives (prerequisites)

This spec also added three general-purpose kernel primitives required by macro templates but useful for any game definition:

1. **`concat` ValueExpr** — string concatenation from heterogeneous parts
2. **`forEach.limit` as `ValueExpr`** — runtime-computed iteration limits (was `number`)
3. **`forEach.countBind` + `forEach.in`** — post-iteration count binding

## Scope

### In Scope

- `effectMacros` top-level section in GameSpecDoc YAML
- Macro definition: id, params (name + type), effects template
- Macro invocation: `{ macro: <id>, args: { ... } }` inside effect arrays
- Structural substitution: `{ param: name }` objects replaced with corresponding arg value
- Compile-time expansion before effects are lowered to EffectAST
- Validation: unique IDs, required args, extra args warning, cycle detection
- Three kernel primitives: `concat`, dynamic `forEach.limit`, `forEach.countBind`/`in`
- Two FITL macros: `piece-removal-ordering`, `place-from-available-or-map`

### Out of Scope

- Runtime macros (macros are purely compile-time)
- Macro libraries or registry (macros live in the GameSpecDoc that uses them)
- Conditional macro bodies (use `if` effects inside the macro template instead)
- Recursive macros (a macro cannot invoke itself — cycle detection prevents this)
- Macro versioning or namespacing
- Generic type parameters (params have fixed types)

## Design Decisions

### D1: Macro param syntax — `{ param: name }` objects

Template bodies use `{ param: name }` YAML objects for macro parameter references:

```yaml
zone: { param: space }          # macro param reference — replaced with arg value
limit: { param: damageExpr }    # structural replacement — full ValueExpr inlined
token: $target                   # binding ref — untouched by expander
```

Why not `$param` or `{{param}}`:
- `$name` collides with binding refs (`isBindingToken` in `compile-selectors.ts`)
- `{{name}}` is a YAML parse error (curly braces start flow mappings in YAML 1.2)
- `{ param: name }` is valid YAML, unambiguous, and structurally distinct from all other node types

### D2: `concat` ValueExpr

New variant in `ValueExpr` union:

```typescript
| { readonly concat: readonly ValueExpr[] }
```

- Evaluates each element via `evalValue()`, coerces to string via `String()`, concatenates with empty separator
- Example: `{ concat: ['available:', { ref: tokenProp, token: '$t', prop: faction }] }` evaluates to `"available:NVA"`
- General-purpose: any game with dynamic zone IDs, labels, or composite keys

### D3: `forEach.limit` accepts `ValueExpr` (was `number`)

```typescript
readonly limit?: ValueExpr;  // was: number
```

- `number` is already a valid `ValueExpr`, so literal limits like `limit: 3` still work
- Now also accepts runtime expressions: `limit: { ref: binding, name: '$damage' }`
- Evaluated once before iteration begins; result must be a non-negative integer

### D4: `forEach.countBind` + `forEach.in`

```typescript
readonly forEach: {
  readonly bind: string;
  readonly over: OptionsQuery;
  readonly effects: readonly EffectAST[];
  readonly limit?: ValueExpr;
  readonly countBind?: string;          // NEW
  readonly in?: readonly EffectAST[];   // NEW
};
```

- After iteration, `countBind` receives actual iteration count (number of items processed)
- `in` effects run with `countBind` in scope (follows the same pattern as `let`/`rollRandom`)
- Eliminates the 4-step count-before/forEach/count-after/subtract pattern that was repeated in macro templates

## Macro Definition Syntax

Top-level `effectMacros` section in GameSpecDoc YAML:

```yaml
effectMacros:
  - id: set-score
    params:
      - { name: value, type: number }
    effects:
      - setVar: { scope: global, var: score, value: { param: value } }
```

### Parameter Types

| Type | YAML Value | Substitution Behavior |
|------|-----------|----------------------|
| `string` | String | Direct string replacement |
| `number` | Number | Direct numeric replacement |
| `value` | ValueExpr object | Structural replacement (full ValueExpr inlined) |
| `effect` | Single EffectAST object | Structural replacement |
| `effects` | Array of EffectAST objects | Structural replacement (full array inlined) |
| `condition` | ConditionAST object | Structural replacement |
| `query` | OptionsQuery object | Structural replacement |

## Macro Invocation Syntax

Inside any effect array (setup, action effects, trigger effects):

```yaml
# Simple invocation
- macro: set-score
  args:
    value: 10

# Invocation with expression arg
- macro: piece-removal-ordering
  args:
    space: $space
    damageExpr: { op: '/', left: { aggregate: ... }, right: 2 }
```

## Substitution Model

The expander deep-clones the macro's `effects` template and walks the tree:

1. If a node is `{ param: 'name' }` (an object with exactly one key `param` whose value is a string) → replace with the corresponding arg value
2. If a node is an array → recurse into each element (also expanding any macro invocations found)
3. If a node is a plain object → recurse into each value
4. Strings, numbers, booleans → left unchanged

Binding refs like `$target` are plain strings — they pass through substitution untouched.

After substitution, if any expanded effects contain further macro invocations, they are recursively expanded (with cycle detection).

## Validation

### At Definition Time

1. **Unique IDs**: No two macros share the same `id` → `EFFECT_MACRO_DUPLICATE_ID`
2. **Valid param types**: Each param type must be one of the defined types

### At Invocation Time

1. **Macro exists**: The `macro` field references a defined macro ID → `EFFECT_MACRO_UNKNOWN`
2. **All params provided**: Every declared param has a corresponding `args` entry → `EFFECT_MACRO_MISSING_ARGS`
3. **No extra args**: Warn if `args` contains keys not in the macro's param list → `EFFECT_MACRO_EXTRA_ARGS`

### Cycle Detection

Macros may invoke other macros (nested expansion). Cycle detection uses DFS with a visited set per expansion chain:

1. Before expanding a macro invocation, add the macro ID to the "expanding" set
2. If a nested invocation references a macro already in the "expanding" set → `EFFECT_MACRO_CYCLE`
3. After expansion completes, the macro ID is removed via the immutable set copy pattern

Maximum nesting depth: 10 → `EFFECT_MACRO_DEPTH_EXCEEDED`

## Expansion Pipeline

The expansion runs as a preprocessing step in the compiler, BEFORE the existing `expandMacros()` (zone macros + built-in effect macros):

```
GameSpecDoc (with effectMacros + invocations)
  → expandEffectMacros(doc)             // substitute all, cycle detection, validation
  → GameSpecDoc (effectMacros: null)    // clean doc, no { param: } or { macro: } nodes remain
  → expandMacros(doc)                   // existing zone/built-in macro expansion (unchanged)
  → compileExpandedDoc(doc)             // existing compilation flow (unchanged)
```

The function returns `{ doc: GameSpecDoc, diagnostics: Diagnostic[] }`. If the `effectMacros` field is null or empty, the doc is returned unchanged with zero diagnostics.

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `src/cnl/expand-effect-macros.ts` | Core expansion engine: find invocations, substitute params, inline, cycle detection |

### Files Modified

| File | Change |
|------|--------|
| `src/cnl/game-spec-doc.ts` | Added `EffectMacroParam`, `EffectMacroDef`, `effectMacros` field to `GameSpecDoc` |
| `src/cnl/compiler.ts` | Call `expandEffectMacros()` before `expandMacros()` |
| `src/cnl/parser.ts` | Parse `effectMacros` YAML section (list section, merged on append) |
| `src/cnl/section-identifier.ts` | Added `'effectMacros'` to `CANONICAL_SECTION_KEYS` |
| `src/cnl/index.ts` | Export `expand-effect-macros` module |
| `src/cnl/compile-effects.ts` | Lower `countBind`/`in` in `lowerForEachEffect`, dynamic `limit` as ValueExpr |
| `src/cnl/compile-conditions.ts` | Lower `concat` in `lowerValueNode` |
| `src/kernel/types.ts` | `concat` ValueExpr, `forEach.limit` as ValueExpr, `countBind`/`in` |
| `src/kernel/eval-value.ts` | Concat evaluation |
| `src/kernel/effects.ts` | Dynamic limit evaluation, `countBind`/`in` execution |
| `src/kernel/schemas.ts` | Zod schemas for concat, dynamic limit, countBind, in |
| `src/kernel/validate-gamedef.ts` | Validation for concat, dynamic limit, in[] |
| `src/kernel/legal-choices.ts` | Walk dynamic limit, countBind/in in choice enumeration |
| `schemas/GameDef.schema.json` | JSON Schema for concat, dynamic limit, countBind, in |

### GameSpecDoc Types

```typescript
// src/cnl/game-spec-doc.ts
export interface EffectMacroParam {
  readonly name: string;
  readonly type: 'string' | 'number' | 'effect' | 'effects' | 'value' | 'condition' | 'query';
}

export interface EffectMacroDef {
  readonly id: string;
  readonly params: readonly EffectMacroParam[];
  readonly effects: readonly GameSpecEffect[];
}

export interface GameSpecDoc {
  // ... existing fields ...
  readonly effectMacros: readonly EffectMacroDef[] | null;
}
```

### Kernel Type Changes

```typescript
// src/kernel/types.ts — ValueExpr union (new variant)
| { readonly concat: readonly ValueExpr[] };

// src/kernel/types.ts — forEach in EffectAST
readonly forEach: {
  readonly bind: string;
  readonly over: OptionsQuery;
  readonly effects: readonly EffectAST[];
  readonly limit?: ValueExpr;           // was: number
  readonly countBind?: string;          // NEW
  readonly in?: readonly EffectAST[];   // NEW
};
```

### expandEffectMacros Algorithm

```
function expandEffectMacros(doc: GameSpecDoc): { doc, diagnostics }
  if doc.effectMacros is null or empty → return { doc, diagnostics: [] }

  index = buildMacroIndex(doc.effectMacros, diagnostics)  // checks for duplicate IDs

  // Walk all effect arrays in the doc
  expandedSetup    = expandEffectList(doc.setup, index, diagnostics, 'setup')
  expandedActions  = doc.actions.map(a => expandActionEffects(a, index, ...))
  expandedTriggers = doc.triggers.map(t => expandTriggerEffects(t, index, ...))

  return { doc: { ...doc, setup, actions, triggers, effectMacros: null }, diagnostics }

function expandEffect(effect, index, diagnostics, path, visitedStack, depth):
  if not isMacroInvocation(effect):
    return [expandEffectsInNode(effect, ...)]   // recurse into nested effect arrays

  macroId = effect.macro
  if macroId not in index → EFFECT_MACRO_UNKNOWN error
  if macroId in visitedStack → EFFECT_MACRO_CYCLE error
  if depth >= 10 → EFFECT_MACRO_DEPTH_EXCEEDED error

  validate args (missing → EFFECT_MACRO_MISSING_ARGS, extra → EFFECT_MACRO_EXTRA_ARGS warning)

  substituted = def.effects.map(e => substituteParams(e, args))
  nestedVisited = new Set(visitedStack) + macroId
  return substituted.flatMap(e => expandEffect(e, index, ..., nestedVisited, depth + 1))
```

## FITL Macros

### 1. piece-removal-ordering

**Params**: `space` (string — zone ID or binding ref), `damageExpr` (value — ValueExpr)

**Used by**: Assault (Task 26.5), Attack (Task 26.8)

**Encodes** (Rule 3.2.4, 3.3.3):
1. Compute damage from `damageExpr`
2. Remove enemy Troops (up to damage), using `forEach.countBind` to track actual removals
3. Compute remaining damage: `damage - troopsRemoved`
4. Attacker chooses faction order for Active Guerrillas
5. Remove Active Guerrillas of chosen faction first, tracking removals via `countBind`
6. Remove Active Guerrillas of other faction with remaining damage
7. Bases: only if no enemy Active Guerrillas remain in space
8. Underground Guerrillas: immune (filters require `activity: active`)
9. Tunneled Bases: die roll (1-3 nothing, 4-6 remove tunnel marker)

```yaml
effectMacros:
  - id: piece-removal-ordering
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
    effects:
      - let:
          bind: damage
          value: { param: damageExpr }
          in:
            # Step 1: Remove enemy Troops (countBind tracks actual removals)
            - forEach:
                bind: $target
                over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { ref: actor } }] }
                limit: { ref: binding, name: $damage }
                effects:
                  - moveToken: { token: $target, from: { param: space }, to: { concat: ['available:', { ref: tokenProp, token: $target, prop: faction }] } }
                countBind: $troopsRemoved
                in:
                  - let:
                      bind: remainingDamage
                      value: { op: '-', left: { ref: binding, name: $damage }, right: { ref: binding, name: $troopsRemoved } }
                      in:
                        # Step 2: Choose faction order for Active Guerrillas
                        - chooseOne:
                            bind: $targetFactionFirst
                            options: { query: enums, values: ['NVA', 'VC'] }

                        # Step 3: Remove Active Guerrillas of chosen faction
                        - forEach:
                            bind: $target2
                            over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionFirst } }, { prop: activity, eq: active }] }
                            limit: { ref: binding, name: $remainingDamage }
                            effects:
                              - moveToken: { token: $target2, from: { param: space }, to: { concat: ['available:', { ref: binding, name: $targetFactionFirst }] } }
                            countBind: $guerrillas1Removed
                            in:
                              - let:
                                  bind: remainingDamage2
                                  value: { op: '-', left: { ref: binding, name: $remainingDamage }, right: { ref: binding, name: $guerrillas1Removed } }
                                  in:
                                    # Step 4: Determine other faction
                                    - let:
                                        bind: targetFactionSecond
                                        value: { if: { when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'NVA' }, then: 'VC', else: 'NVA' } }
                                        in:
                                          # Remove Active Guerrillas of other faction
                                          - forEach:
                                              bind: $target3
                                              over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionSecond } }, { prop: activity, eq: active }] }
                                              limit: { ref: binding, name: $remainingDamage2 }
                                              effects:
                                                - moveToken: { token: $target3, from: { param: space }, to: { concat: ['available:', { ref: binding, name: $targetFactionSecond }] } }

                                          # Step 5: Bases only if no enemy active guerrillas remain
                                          - let:
                                              bind: guerrillasRemaining
                                              value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: neq, value: { ref: actor } }, { prop: activity, eq: active }] } } }
                                              in:
                                                - if:
                                                    when: { op: '==', left: { ref: binding, name: $guerrillasRemaining }, right: 0 }
                                                    then:
                                                      - forEach:
                                                          bind: $baseTarget
                                                          over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: neq, value: { ref: actor } }] }
                                                          effects:
                                                            - if:
                                                                when: { op: '==', left: { ref: tokenProp, token: $baseTarget, prop: tunnel }, right: 'tunneled' }
                                                                then:
                                                                  - rollRandom:
                                                                      bind: $dieRoll
                                                                      min: 1
                                                                      max: 6
                                                                      in:
                                                                        - if:
                                                                            when: { op: '>=', left: { ref: binding, name: $dieRoll }, right: 4 }
                                                                            then:
                                                                              - setTokenProp: { token: $baseTarget, prop: tunnel, value: 'untunneled' }
                                                                else:
                                                                  - moveToken: { token: $baseTarget, from: { param: space }, to: { concat: ['available:', { ref: tokenProp, token: $baseTarget, prop: faction }] } }
```

**Key improvements** over original draft:
- `{ param: space }` / `{ param: damageExpr }` instead of `$space` / `$damageExpr` (no collision with binding refs)
- `forEach.countBind` + `forEach.in` eliminates count-before/count-after/subtract pattern (saves ~40 lines)
- `concat` ValueExpr for dynamic zone ID construction (`available:NVA`)
- Dynamic `forEach.limit` accepts ValueExpr (`{ ref: binding, name: $damage }`)

### 2. place-from-available-or-map

**Params**: `pieceType` (string), `faction` (string), `targetSpace` (string), `maxPieces` (value — ValueExpr)

**Used by**: Train (Task 26.2), Rally (Task 26.6)

**Encodes** (Rule 1.4.1):
1. Count available pieces of desired type/faction
2. Place from Available up to limit, tracking actual placements via `countBind`
3. If need more AND faction is NOT US (for troops/bases):
   - Player chooses which map space to take piece from
   - Move piece from chosen map space to target
4. US Troops and US Bases: Available only, never from map

```yaml
effectMacros:
  - id: place-from-available-or-map
    params:
      - { name: pieceType, type: string }
      - { name: faction, type: string }
      - { name: targetSpace, type: string }
      - { name: maxPieces, type: value }
    effects:
      # Phase 1: Place from Available
      - forEach:
          bind: $piece
          over:
            query: tokensInZone
            zone: { concat: ['available:', { param: faction }] }
            filter: [{ prop: type, eq: { param: pieceType } }]
          limit: { param: maxPieces }
          effects:
            - moveToken:
                token: $piece
                from: { concat: ['available:', { param: faction }] }
                to: { param: targetSpace }
          countBind: $placed
          in:
            # Phase 2: If more needed and not US, take from map
            - let:
                bind: remaining
                value: { op: '-', left: { param: maxPieces }, right: { ref: binding, name: $placed } }
                in:
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '!=', left: { param: faction }, right: 'US' }
                          - { op: '>', left: { ref: binding, name: $remaining }, right: 0 }
                      then:
                        - chooseN:
                            bind: $sourceSpaces
                            options:
                              query: zones
                              filter:
                                op: '>'
                                left: { aggregate: { op: count, query: { query: tokensInZone, zone: { ref: binding, name: $srcZone }, filter: [{ prop: type, eq: { param: pieceType } }, { prop: faction, eq: { param: faction } }] } } }
                                right: 0
                            min: 0
                            max: 99
                        - forEach:
                            bind: $srcSpace
                            over: { query: binding, name: $sourceSpaces }
                            effects:
                              - forEach:
                                  bind: $mapPiece
                                  over:
                                    query: tokensInZone
                                    zone: { ref: binding, name: $srcSpace }
                                    filter: [{ prop: type, eq: { param: pieceType } }, { prop: faction, eq: { param: faction } }]
                                  limit: 1
                                  effects:
                                    - moveToken:
                                        token: $mapPiece
                                        from: { ref: binding, name: $srcSpace }
                                        to: { param: targetSpace }
```

**Key improvements** over original draft:
- Fixed `$zone` bug (line 370 of original) — was referencing undeclared param; now uses `{ param: targetSpace }`
- `{ param: faction }`, `{ param: pieceType }` instead of `$faction`, `$pieceType`
- `concat` for `available:` zone construction
- `countBind` tracks actual placements to compute remaining needs
- `maxPieces` is type `value` (ValueExpr), supporting runtime-computed limits

## Testing

### Unit Tests — `test/unit/expand-effect-macros.test.ts` (17 tests)

1. Returns doc unchanged when effectMacros is null
2. Returns doc unchanged when effectMacros is empty
3. Expands a simple macro invocation in setup
4. Expands macro invocations in action effects
5. Expands macro invocations in trigger effects
6. Handles multi-param macros
7. Expands macros with structural param (effects array)
8. Binding refs (`$name`) are untouched by expansion
9. Multiple invocations with different args
10. Nested macro expansion (macro A invokes macro B)
11. Detects cycle: A -> B -> A
12. Detects self-referencing macro
13. Detects unknown macro reference
14. Detects duplicate macro IDs
15. Detects missing required args
16. Warns on extra args (expansion still proceeds)
17. Expands macros nested inside forEach effects

### Unit Tests — Kernel primitives

- `test/unit/eval-value.test.ts`: 5 tests for `concat` (empty, strings, mixed types, refs, nested)
- `test/unit/effects-control-flow.test.ts`: 4 tests for `forEach` extensions (dynamic limit via binding, countBind/in basic, countBind with limit, countBind with empty collection)

### Integration Tests — `test/integration/effect-macro-compile.test.ts` (6 tests)

1. Macro invocation in setup expands and compiles to valid GameDef
2. Macro in action effects expands and compiles
3. Nested macro expansion compiles correctly
4. `concat` ValueExpr compiles through the full pipeline
5. `forEach` with `countBind`/`in` compiles through full pipeline
6. `forEach` with dynamic limit (ValueExpr) compiles through full pipeline

## Diagnostic Codes

| Code | Severity | When |
|------|----------|------|
| `EFFECT_MACRO_DUPLICATE_ID` | error | Two macros share the same `id` |
| `EFFECT_MACRO_UNKNOWN` | error | Invocation references undefined macro |
| `EFFECT_MACRO_CYCLE` | error | Circular macro expansion detected |
| `EFFECT_MACRO_DEPTH_EXCEEDED` | error | Nesting depth exceeds 10 |
| `EFFECT_MACRO_MISSING_ARGS` | error | Required params not provided in `args` |
| `EFFECT_MACRO_EXTRA_ARGS` | warning | Args contains keys not in macro's param list |

## Invariants

1. Macro expansion is purely compile-time — GameDef contains no macro references
2. Expansion is deterministic (same input -> same output)
3. Circular macro references are detected and rejected with a clear cycle path
4. All `{ param: name }` nodes in templates must correspond to declared params
5. After expansion, the `effectMacros` section is set to null (consumed)
6. Expansion preserves all non-macro effects unchanged
7. Macro invocations can appear anywhere an effect can appear (setup, action effects, trigger effects)
8. Nested effect structures (`if.then`, `forEach.effects`, `let.in`) are searched for invocations
9. Binding refs (`$name`) pass through expansion untouched — only `{ param: name }` nodes are substituted

## Acceptance Criteria

- [x] `effectMacros` section parses from GameSpecDoc YAML
- [x] Macro definitions validated (unique IDs, params)
- [x] Macro invocations validated (macro exists, all params provided, extra args warned)
- [x] `{ param: name }` substitution works for all param types
- [x] Cycle detection prevents circular macro references
- [x] Nested macro expansion works up to depth 10
- [x] Expanded effects compile to valid EffectAST
- [x] `effectMacros` section set to null after expansion
- [x] `concat` ValueExpr implemented and tested in kernel
- [x] `forEach.limit` accepts `ValueExpr` (was `number`)
- [x] `forEach.countBind` + `forEach.in` implemented and tested
- [x] All existing tests pass (no regression)
- [x] Build passes (`npm run build`)
- [x] Typecheck passes (`npm run typecheck`)
- [x] 32 new tests added (17 unit macro + 5 concat + 4 forEach + 6 integration)

## Outcome

**Completion date**: 2026-02-12

**What was changed**:
- 3 new kernel primitives: `concat` ValueExpr, dynamic `forEach.limit`, `forEach.countBind`/`in`
- Complete macro expansion system: `src/cnl/expand-effect-macros.ts` (~300 lines)
- Parser, compiler, schema, and validation updates across 14 files
- 32 new tests (955 total, up from 923)

**Deviations from original draft**:
- `$paramName` syntax replaced with `{ param: name }` objects (showstopper: `$` prefix collision)
- Param types simplified to `string | number | effect | effects | value | condition | query` (generic, not game-specific like `zone` or `binding`)
- `validate-effect-macros.ts` was NOT created as a separate file — validation is integrated into `expand-effect-macros.ts`
- FITL macro templates rewritten with new primitives (countBind, concat, dynamic limit)
