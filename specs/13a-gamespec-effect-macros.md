# Spec 13a: GameSpecDoc Effect Macros

**Status**: Draft
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 25c (extended kernel primitives)
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming Sections 4.2, 7.4

## Overview

Implement a compile-time parameterized macro system for GameSpecDoc YAML. Macros allow reusable effect patterns to be defined once and invoked multiple times with different parameters, expanding at compile time before GameDef generation. This eliminates duplication in Spec 26 operations that share complex effect logic (piece removal ordering, dynamic piece sourcing).

**Key constraint**: Macros are a GameSpecDoc authoring convenience. They expand entirely at compile time. The kernel and GameDef know nothing about macros — they only see expanded EffectAST nodes.

## Scope

### In Scope

- `effectMacros` top-level section in GameSpecDoc YAML
- Macro definition: id, params (name + type), effects template
- Macro invocation: `{ macro: <id>, args: { ... } }` inside effect arrays
- Structural substitution: `$paramName` replaced with corresponding arg value
- Compile-time expansion before effects are lowered to EffectAST
- Validation: unique IDs, param types, all `$params` declared, cycle detection
- Two FITL macros: `piece-removal-ordering`, `place-from-available-or-map`

### Out of Scope

- Runtime macros (macros are purely compile-time)
- Macro libraries or registry (macros live in the GameSpecDoc that uses them)
- Conditional macro bodies (use `if` effects inside the macro template instead)
- Recursive macros (a macro cannot invoke itself — cycle detection prevents this)
- Macro versioning or namespacing
- Generic type parameters (params have fixed types)

## Macro Definition Syntax

Top-level `effectMacros` section in GameSpecDoc YAML:

```yaml
effectMacros:
  - id: piece-removal-ordering
    params:
      - { name: space, type: zone }
      - { name: damageExpr, type: expr }
    effects:
      # Template body using $space, $damageExpr
      - let:
          bind: damage
          value: $damageExpr
          in:
            # Step 1: Remove enemy Troops
            - let:
                bind: troopsBefore
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { ref: actor } }] } } }
                in:
                  - forEach:
                      bind: target
                      over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { ref: actor } }] }
                      limit: { ref: binding, name: damage }
                      effects:
                        - moveToken: { token: $target, from: $space, to: { concat: ['available:', { ref: tokenProp, token: $target, prop: faction }] } }
                  - let:
                      bind: troopsAfter
                      value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { ref: actor } }] } } }
                      in:
                        - let:
                            bind: remainingDamage
                            value: { op: '-', left: { ref: binding, name: damage }, right: { op: '-', left: { ref: binding, name: troopsBefore }, right: { ref: binding, name: troopsAfter } } }
                            in:
                              # Step 2: Attacker chooses faction order for Active Guerrillas
                              - chooseOne:
                                  bind: targetFactionFirst
                                  options: { query: enums, values: ['NVA', 'VC'] }

                              # Step 3: Remove Active Guerrillas of chosen faction
                              - let:
                                  bind: guerrillasBefore1
                                  value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: targetFactionFirst } }, { prop: activity, eq: active }] } } }
                                  in:
                                    - forEach:
                                        bind: target
                                        over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: targetFactionFirst } }, { prop: activity, eq: active }] }
                                        limit: { ref: binding, name: remainingDamage }
                                        effects:
                                          - moveToken: { token: $target, from: $space, to: { concat: ['available:', { ref: binding, name: targetFactionFirst }] } }
                                    - let:
                                        bind: guerrillasAfter1
                                        value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: targetFactionFirst } }, { prop: activity, eq: active }] } } }
                                        in:
                                          - let:
                                              bind: remainingDamage2
                                              value: { op: '-', left: { ref: binding, name: remainingDamage }, right: { op: '-', left: { ref: binding, name: guerrillasBefore1 }, right: { ref: binding, name: guerrillasAfter1 } } }
                                              in:
                                                # Step 4: Remove Active Guerrillas of other faction
                                                - let:
                                                    bind: targetFactionSecond
                                                    value: { if: { when: { op: '==', left: { ref: binding, name: targetFactionFirst }, right: 'NVA' }, then: 'VC', else: 'NVA' } }
                                                    in:
                                                      - forEach:
                                                          bind: target
                                                          over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: targetFactionSecond } }, { prop: activity, eq: active }] }
                                                          limit: { ref: binding, name: remainingDamage2 }
                                                          effects:
                                                            - moveToken: { token: $target, from: $space, to: { concat: ['available:', { ref: binding, name: targetFactionSecond }] } }

                                                # Step 5: Bases only if no enemy guerrillas remain
                                                      - let:
                                                          bind: guerrillasRemaining
                                                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: neq, value: { ref: actor } }, { prop: activity, eq: active }] } } }
                                                          in:
                                                            - if:
                                                                when: { op: '==', left: { ref: binding, name: guerrillasRemaining }, right: 0 }
                                                                then:
                                                                  - forEach:
                                                                      bind: target
                                                                      over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: base }, { prop: faction, op: neq, value: { ref: actor } }] }
                                                                      effects:
                                                                        # Tunneled bases: die roll
                                                                        - if:
                                                                            when: { op: '==', left: { ref: tokenProp, token: $target, prop: tunnel }, right: 'tunneled' }
                                                                            then:
                                                                              - rollRandom:
                                                                                  bind: dieRoll
                                                                                  min: 1
                                                                                  max: 6
                                                                                  in:
                                                                                    - if:
                                                                                        when: { op: '>=', left: { ref: binding, name: dieRoll }, right: 4 }
                                                                                        then:
                                                                                          - setTokenProp: { token: $target, prop: tunnel, value: 'untunneled' }
                                                                            else:
                                                                              - moveToken: { token: $target, from: $space, to: { concat: ['available:', { ref: tokenProp, token: $target, prop: faction }] } }
```

## Macro Invocation Syntax

Inside operation resolution effects:

```yaml
# Example: Attack invokes piece-removal-ordering
- macro: piece-removal-ordering
  args:
    space: $space
    damageExpr: { op: '/', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }, { prop: activity, eq: active }] } } }, right: 2 }
```

## Substitution Model

**Simple structural substitution**:

1. Deep-clone the macro's `effects` template
2. Walk the cloned tree, replacing every `$paramName` string with the corresponding `args` value
3. Replacement is structural: if the arg is an object (e.g., a ValueExpr), the `$paramName` string is replaced with the full object
4. If `$paramName` appears as a string value (e.g., inside a `zone:` field), it is replaced with the arg's string value
5. If `$paramName` appears as a complete value node, the entire node is replaced with the arg value
6. The expanded effects are inlined at the invocation site

**String vs structural replacement rules**:
- If arg type is `zone` or `binding`: the `$paramName` is treated as a string reference and replaced with the string value
- If arg type is `int`: the `$paramName` is replaced with the numeric value
- If arg type is `expr`: the `$paramName` is replaced with the full ValueExpr object

## Parameter Types

| Type | YAML Value | Substitution Behavior |
|------|-----------|----------------------|
| `zone` | String (zone ID or binding reference like `$space`) | String replacement |
| `int` | Number | Numeric replacement |
| `binding` | String (binding name) | String replacement |
| `expr` | ValueExpr object | Structural replacement (full object) |

## Validation

### At Definition Time

1. **Unique IDs**: No two macros share the same `id`
2. **Valid param types**: Each param type is one of `zone`, `int`, `binding`, `expr`
3. **Param usage**: All `$paramName` references in `effects` correspond to declared params
4. **No undeclared references**: Warn if a declared param is never used in the template

### At Invocation Time

1. **Macro exists**: The `macro` field references a defined macro ID
2. **All params provided**: Every declared param has a corresponding `args` entry
3. **Type compatibility**: Arg values match declared param types (zone arg is string, int arg is number, expr arg is ValueExpr-shaped)
4. **No extra args**: Warn if `args` contains keys not in the macro's param list

### Cycle Detection

Macros may invoke other macros (nested expansion). Cycle detection uses DFS with a visited set:

1. Before expanding a macro invocation, add the macro ID to the "expanding" set
2. If a nested invocation references a macro already in the "expanding" set → error with cycle path
3. After expansion completes, remove the macro ID from the "expanding" set

Maximum nesting depth: 10 (configurable, prevents deeply nested but acyclic chains from causing issues).

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `src/cnl/expand-effect-macros.ts` | Core expansion engine: find invocations, substitute params, inline |
| `src/cnl/validate-effect-macros.ts` | Definition + invocation validation, cycle detection |

### Modified Files

| File | Change |
|------|--------|
| `src/cnl/game-spec-doc.ts` | Add `effectMacros` field to `GameSpecDoc` interface |
| `src/cnl/compiler.ts` | Call `expandEffectMacros()` before lowering effects to EffectAST |
| `src/cnl/parser.ts` | Parse `effectMacros` YAML section |
| `src/cnl/validate-spec.ts` | Validate effectMacros definitions |

### GameSpecDoc Type Change

```typescript
// src/cnl/game-spec-doc.ts — add to GameSpecDoc
export interface GameSpecEffectMacroParam {
  readonly name: string;
  readonly type: 'zone' | 'int' | 'binding' | 'expr';
}

export interface GameSpecEffectMacroDef {
  readonly id: string;
  readonly params: readonly GameSpecEffectMacroParam[];
  readonly effects: readonly GameSpecEffect[];
}

export interface GameSpecDoc {
  // ... existing fields ...
  readonly effectMacros: readonly GameSpecEffectMacroDef[] | null;
}
```

### Expansion Pipeline

The expansion runs as a preprocessing step in the compiler:

```
GameSpecDoc (with macros + invocations)
  → validateEffectMacros(doc)           // validate definitions
  → expandEffectMacros(doc)             // expand all invocations
  → GameSpecDoc (macros resolved, invocations replaced with expanded effects)
  → compileGameSpecToGameDef(doc)       // normal compilation (no macro awareness needed)
```

### expandEffectMacros Algorithm

```
function expandEffectMacros(doc: GameSpecDoc): GameSpecDoc
  macros = indexById(doc.effectMacros)
  expandedDoc = deepClone(doc)

  // Walk all effect arrays in the doc (actions, triggers, operations, setup, etc.)
  for each effectArray in allEffectArrays(expandedDoc):
    expandedArray = expandEffectArray(effectArray, macros, new Set())
    replace effectArray with expandedArray

  // Remove effectMacros section (consumed)
  return { ...expandedDoc, effectMacros: null }

function expandEffectArray(effects, macros, expanding):
  result = []
  for each effect in effects:
    if isMacroInvocation(effect):
      macroId = effect.macro
      if expanding.has(macroId):
        throw CycleError(expanding, macroId)
      if expanding.size > 10:
        throw NestingDepthError
      macro = macros.get(macroId)
      substituted = substitute(macro.effects, macro.params, effect.args)
      expanding.add(macroId)
      expanded = expandEffectArray(substituted, macros, expanding)
      expanding.delete(macroId)
      result.push(...expanded)
    else:
      // Recursively expand nested effect arrays (if, forEach, let, etc.)
      result.push(expandNestedEffects(effect, macros, expanding))
  return result
```

## FITL Macros

### 1. piece-removal-ordering

**Params**: `space` (zone), `damageExpr` (expr)

**Used by**: Assault (Task 26.5), Attack (Task 26.8)

**Encodes** (Rule 3.2.4, 3.3.3):
1. Compute damage from `damageExpr`
2. Remove enemy Troops (up to damage)
3. Re-count remaining damage via cascading `let` bindings (no mutable state)
4. Attacker chooses faction order for Active Guerrillas
5. Remove Active Guerrillas of chosen faction first (up to remaining damage)
6. Re-count remaining damage
7. Remove Active Guerrillas of other faction (up to remaining damage)
8. Bases: only if no enemy Active Guerrillas remain in space
9. Underground Guerrillas: immune (never targeted — filters require `activity: active`)
10. Tunneled Bases: die roll (1-3 nothing, 4-6 remove tunnel marker)

**Damage tracking approach**: Cascading `let` bindings. Each removal step:
1. Count targets before removal
2. `forEach` with `limit: remainingDamage` removes up to N
3. Count targets after removal
4. `let remainingDamage = previousRemaining - (before - after)`

This avoids mutable global variables. Each step re-queries the zone to compute actual removals.

### 2. place-from-available-or-map

**Params**: `pieceType` (binding), `faction` (binding), `targetSpace` (zone), `limit` (int)

**Used by**: Train (Task 26.2), Rally (Task 26.6)

**Encodes** (Rule 1.4.1):
1. Count available pieces of desired type/faction
2. Place from Available up to limit
3. If need more AND faction is NOT US (for troops/bases):
   - Player chooses which map space to take piece from
   - Move piece from chosen map space to target
4. US Troops and US Bases: Available only, never from map

```yaml
effectMacros:
  - id: place-from-available-or-map
    params:
      - { name: pieceType, type: binding }
      - { name: faction, type: binding }
      - { name: targetSpace, type: zone }
      - { name: limit, type: int }
    effects:
      # Phase 1: Place from Available
      - forEach:
          bind: piece
          over:
            query: tokensInZone
            zone: { concat: ['available:', $faction] }
            filter: [{ prop: type, eq: $pieceType }]
          limit: $limit
          effects:
            - moveToken:
                token: $piece
                from: { concat: ['available:', $faction] }
                to: $targetSpace

      # Phase 2: If more needed and not US troops/bases, take from map
      # (US exception: troops and bases never from map)
      - if:
          when:
            op: and
            args:
              - { op: '!=', left: $faction, right: 'US' }
              - { op: '<',
                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $targetSpace, filter: [{ prop: type, eq: $pieceType }, { prop: faction, eq: $faction }] } } },
                  right: $limit }
          then:
            # Player chooses source space for additional pieces
            - chooseN:
                bind: sourceSpaces
                options:
                  query: zones
                  filter:
                    op: '>'
                    left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: type, eq: $pieceType }, { prop: faction, eq: $faction }] } } }
                    right: 0
                min: 0
                max: 99
            - forEach:
                bind: srcSpace
                over: { query: binding, name: sourceSpaces }
                effects:
                  - forEach:
                      bind: mapPiece
                      over:
                        query: tokensInZone
                        zone: { ref: binding, name: srcSpace }
                        filter: [{ prop: type, eq: $pieceType }, { prop: faction, eq: $faction }]
                      limit: 1
                      effects:
                        - moveToken:
                            token: $mapPiece
                            from: { ref: binding, name: srcSpace }
                            to: $targetSpace
```

## Testing Requirements

### Unit Tests (expand-effect-macros)

1. **Simple expansion**: Single macro with one zone param, one invocation → correctly substituted
2. **Multi-param expansion**: Macro with zone + expr params → both substituted correctly
3. **Structural substitution**: expr param replaces `$param` with full ValueExpr object
4. **String substitution**: zone param replaces `$param` with zone ID string
5. **Nested macro expansion**: Macro A invokes macro B → both expanded correctly
6. **Cycle detection**: Macro A invokes macro B, macro B invokes macro A → error with cycle path
7. **Self-referential**: Macro A invokes macro A → error
8. **Nesting depth**: 11-level chain → error
9. **Multiple invocations**: Same macro invoked 3 times with different args → each expanded independently

### Unit Tests (validate-effect-macros)

1. **Valid definition**: Well-formed macro → zero diagnostics
2. **Duplicate ID**: Two macros with same ID → error
3. **Invalid param type**: Param type `"foo"` → error
4. **Undeclared param reference**: `$nonexistent` in template → error
5. **Unused param**: Declared param never referenced → warning
6. **Missing args at invocation**: Macro expects `space` and `damageExpr`, invocation only provides `space` → error
7. **Extra args at invocation**: Args include `unknownParam` → warning
8. **Unknown macro reference**: Invocation references `nonexistent-macro` → error

### Integration Tests

1. **piece-removal-ordering**: Define macro + invoke in Attack context → expands to valid effect tree → compiles to valid EffectAST
2. **place-from-available-or-map**: Define macro + invoke in Train context → expands correctly
3. **Full pipeline**: GameSpecDoc with macros → parse → validate → expand → compile → valid GameDef

### Golden Tests

1. Known macro invocation → expected expanded YAML (snapshot)
2. piece-removal-ordering with specific args → expected expanded effect tree

## Invariants

1. Macro expansion is purely compile-time — GameDef contains no macro references
2. Expansion is deterministic (same input → same output)
3. Circular macro references are detected and rejected with a clear cycle path
4. All `$paramName` references in templates must correspond to declared params
5. After expansion, the `effectMacros` section is removed from the doc (consumed)
6. Expansion preserves all non-macro effects unchanged
7. Macro invocations can appear anywhere an effect can appear (resolution, triggers, setup, etc.)
8. Nested effect structures (`if.then`, `forEach.effects`, `let.in`) are searched for invocations

## Acceptance Criteria

- [ ] `effectMacros` section parses from GameSpecDoc YAML
- [ ] Macro definitions validated (unique IDs, valid params, usage check)
- [ ] Macro invocations validated (macro exists, all params provided, types match)
- [ ] Structural substitution works for all param types (zone, int, binding, expr)
- [ ] Cycle detection prevents circular macro references
- [ ] Nested macro expansion works up to depth 10
- [ ] Expanded effects compile to valid EffectAST
- [ ] piece-removal-ordering macro works for Assault and Attack
- [ ] place-from-available-or-map macro works for Train and Rally
- [ ] `effectMacros` section removed from doc after expansion
- [ ] All existing tests pass (no regression)
- [ ] Build passes (`npm run build`)
- [ ] Typecheck passes (`npm run typecheck`)

## Files to Create/Modify

```
src/cnl/expand-effect-macros.ts     # NEW — core expansion engine
src/cnl/validate-effect-macros.ts   # NEW — definition + invocation validation
src/cnl/game-spec-doc.ts            # MODIFY — add effectMacros to GameSpecDoc
src/cnl/compiler.ts                 # MODIFY — call expansion before compilation
src/cnl/parser.ts                   # MODIFY — parse effectMacros YAML section
src/cnl/validate-spec.ts            # MODIFY — validate effectMacros definitions
test/unit/expand-effect-macros.test.ts    # NEW — expansion unit tests
test/unit/validate-effect-macros.test.ts  # NEW — validation unit tests
test/integration/effect-macro-compile.test.ts  # NEW — end-to-end macro → GameDef
test/fixtures/macro-golden.yaml           # NEW — golden test fixture
```
