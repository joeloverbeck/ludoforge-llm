# Spec 08b: Game Spec Compiler

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: L
**Dependencies**: Spec 02, Spec 07, Spec 08a
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming sections 2.2C, 2.2D, 4

## Overview

Implement the compiler that lowers a parsed `GameSpecDoc` into an executable `GameDef` JSON. This is the mechanical transformation from the LLM-facing Game Spec format to the kernel-facing executable format. The compiler expands macros (board generation, draw-per-player, refillToSize), normalizes zone addressing and player selectors, builds AST nodes, and produces LLM-friendly diagnostics for any compilation failures. The compiler is mechanical — no interpretation, guessing, or AI inference.

## Scope

### In Scope
- Macro expansion: `grid(R,C)`, `hex(radius)`, `draw:each`, `refillToSize`, `discardDownTo`
- Compilation: `GameSpecDoc` → `GameDef` with full AST construction
- Zone addressing normalization: `"hand:each"` → per-player zone expansion
- Player selector normalization: string-based actor specs → typed `PlayerSel`
- AST canonicalization: spec-level shorthand → kernel-level AST nodes
- Spatial topology diagnostics pass-through from Spec 07 (`grid/hex` input validation + adjacency validation)
- Compiler contract enforcement (brainstorming section 4)
- LLM-friendly diagnostic generation with path, suggestion, contextSnippet, alternatives
- MissingCapability diagnostic for unsupported features
- Output validation: compiled GameDef passes `validateGameDef` (Spec 02)

### Out of Scope
- Markdown/YAML parsing (Spec 08a)
- Structural spec validation (Spec 08a)
- Kernel execution of the compiled output (Spec 06)
- Round-trip compilation GameDef → Game Spec (post-MVP)
- Mechanic Bundle composition (Spec 13)

## Key Types & Interfaces

### Public API

```typescript
// Expand macros in a parsed GameSpecDoc
function expandMacros(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
};

// Compile a validated GameSpecDoc into executable GameDef
// Optional source map from Spec 08a enables contextSnippet-rich diagnostics
function compileGameSpecToGameDef(
  doc: GameSpecDoc,
  options?: { readonly sourceMap?: GameSpecSourceMap },
): {
  readonly gameDef: GameDef | null;
  readonly diagnostics: readonly Diagnostic[];
};
```

### Compiler Context (internal)

```typescript
interface CompilerContext {
  readonly specDoc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap | null;
  readonly diagnostics: Diagnostic[]; // mutable during compilation, readonly on return
  readonly zoneMap: ReadonlyMap<string, ZoneDef>; // resolved zone IDs
  readonly varMap: ReadonlyMap<string, VariableDef>; // all variable definitions
  readonly tokenTypeMap: ReadonlyMap<string, TokenTypeDef>;
  readonly phaseMap: ReadonlyMap<string, PhaseDef>;
  readonly actionMap: ReadonlyMap<string, ActionDef>;
}
```

## Implementation Requirements

### Macro Expansion

`expandMacros(doc)` processes the GameSpecDoc and expands compiler sugar into kernel-compatible form. This runs BEFORE compilation.

#### Board Generation Macros

- `grid(rows, cols)`: Expand into zone definitions using `generateGrid` from Spec 07. Replace the macro node with generated `ZoneDef[]`.
- `hex(radius)`: Expand into zone definitions using `generateHex` from Spec 07. Replace the macro node with generated `ZoneDef[]`.
- Macro parameters must be validated at expansion time:
  - `grid`: integer `rows >= 1`, integer `cols >= 1`
  - `hex`: integer `radius >= 0`
- Invalid parameters produce diagnostics and block compilation output (`gameDef: null`).
- Expansion order is deterministic:
  - `grid`: row-major zone generation order from Spec 07
  - `hex`: deterministic coordinate iteration order from Spec 07

Detection contract: macro nodes MUST be explicit in `GameSpecDoc` (no heuristic detection). The parser (Spec 08a) is responsible for producing explicit macro-tagged nodes.

#### draw:each (per-player expansion)

A `draw` effect with `to: "hand:each"` expands into a `forEach` over all players:
```
draw: { from: "deck:none", to: "hand:each", count: 5 }
→
forEach: {
  bind: "$p",
  over: { query: "players" },
  effects: [
    { draw: { from: "deck:none", to: "hand:$p", count: 5 } }
  ]
}
```

#### refillToSize(zone, size, fromZone)

Compiler-derived effect — NOT a kernel primitive. Expands to:
```
let: {
  bind: "$deficit",
  value: { op: "-", left: size, right: { ref: "zoneCount", zone: zone } },
  in: [
    { if: {
      when: { op: ">", left: { ref: "binding", name: "$deficit" }, right: 0 },
      then: [
        { draw: { from: fromZone, to: zone, count: ??? } }
      ]
    } }
  ]
}
```

Note: Since `draw` count must be a static number, `refillToSize` may need to use a bounded `forEach` with a counter, or the compiler can set count to `size` and rely on `draw`'s behavior of moving "up to count" tokens.

Simplified expansion:
```
draw: { from: fromZone, to: zone, count: size }
```
This works because `draw` already handles "fewer available than requested" as a no-op for the missing tokens.

#### discardDownTo(zone, size)

Expands to:
```
forEach: {
  bind: "$token",
  over: { query: "tokensInZone", zone: zone },
  effects: [
    { if: {
      when: { op: ">", left: { ref: "zoneCount", zone: zone }, right: size },
      then: [
        { destroyToken: { token: "$token" } }
        // or moveToken to discard pile
      ]
    } }
  ]
}
```

Or, if a discard destination is specified, use `chooseN` for player-driven discard.

### Compilation Pipeline

`compileGameSpecToGameDef(doc, options?)`:

1. **Build lookup maps**: Create maps for zones, variables, token types, phases, actions from the expanded doc
2. **Compile metadata**: Extract `id`, `players`, `maxTriggerDepth`
3. **Compile constants**: Direct mapping
4. **Compile variables**: Convert `GameSpecVarDef[]` → `VariableDef[]`
5. **Compile zones**: Convert `GameSpecZoneDef[]` → `ZoneDef[]` with branded ZoneIds. Expand `owner: "player"` zones into per-player zones (e.g., `hand` with `owner: "player"` and 3 players → `hand:0`, `hand:1`, `hand:2`)
6. **Compile token types**: Convert to `TokenTypeDef[]`
7. **Compile turn structure**: Convert phases and activePlayerOrder
8. **Compile actions**: For each action:
   - Compile `actor` → `PlayerSel`
   - Compile `phase` → `PhaseId` (validate exists)
   - Compile `params` → `ParamDef[]` (validate domain queries)
   - Compile `pre` → `ConditionAST | null`
   - Compile `cost` → `EffectAST[]`
   - Compile `effects` → `EffectAST[]`
   - Compile `limits` → `LimitDef[]`
9. **Compile triggers**: Convert each trigger's event, conditions, and effects
10. **Compile end conditions**: Convert each condition and result
11. **Compile scoring**: If present
12. **Compile setup**: Convert setup effects to `EffectAST[]`
13. **Validate spatial topology**: Run Spec 07 adjacency validation on compiled zones and append diagnostics.
14. **Validate output**: Run `validateGameDef` on compiled result. If errors, add to diagnostics.
15. **Return**: `{ gameDef, diagnostics }`

If compilation encounters errors that prevent producing a valid GameDef, return `gameDef: null` with error diagnostics.

### Compiler Contract Enforcement (Section 4)

The compiler MUST verify:

1. **Every action has required fields**: id, actor, phase, params (with domains), pre, cost, effects. Missing fields → error with list of missing fields.
2. **Every token reference is bound**: References like `$card` must come from a param, chooseOne, chooseN, or forEach bind. Unbound reference → error with "token '$card' is not bound; it must be a parameter or bound by chooseOne/forEach".
3. **Every choice has enumerable options**: chooseOne/chooseN must have an OptionsQuery that produces a finite, enumerable domain. Non-enumerable → error.
4. **All macros fully expanded**: No macro nodes remain in output GameDef. Verify by checking for any expansion markers.

### LLM-Friendly Diagnostics

Every compiler diagnostic MUST include:

- **`path`**: exact location in the spec structure (e.g., `actions[2].effects[0].moveToken.from`)
- **`severity`**: `'error'` for compilation-blocking issues, `'warning'` for suspicious patterns, `'info'` for suggestions
- **`message`**: human-readable description of the problem
- **`suggestion`**: concrete fix (e.g., `"replace 'shop' with 'market'"`)
- **`contextSnippet`**: 2-3 lines of the original spec around the error location (when parser `sourceMap` is supplied from Spec 08a)
- **`alternatives`**: valid options when a reference fails, computed via fuzzy matching (Levenshtein distance or similar)

#### MissingCapability Diagnostic

When the spec requires something the kernel cannot express:
```typescript
{
  path: "actions[3].effects[1]",
  severity: "error",
  message: "Simultaneous player selection is not supported by the kernel",
  suggestion: "Replace simultaneous selection with sequential draft using chooseOne per player",
  alternatives: ["chooseOne", "forEach over players with chooseOne"]
}
```

Track MissingCapability diagnostics separately for evolution pipeline aggregation (Spec 14).

### Zone Addressing Normalization

Convert spec-level zone references to kernel-level concrete zone IDs:

- `"deck:none"` → `"deck"` (unowned zone, single instance)
- `"hand:actor"` → resolved at runtime (stays as `"hand:actor"` in GameDef, resolved by kernel)
- `"hand:each"` → expanded by macro into per-player references during macro expansion
- `"hand:0"` → concrete player-owned zone ID
- `"market"` (bare name) → determine if owned or unowned from zone definitions, resolve accordingly

### Player Selector Normalization

Convert spec-level actor/player strings to typed `PlayerSel`:

- `"activePlayer"` or `"active"` → `'active'`
- `"actor"` → `'actor'`
- `"all"` → `'all'`
- `"allOther"` → `'allOther'`
- `"left"` → `{ relative: 'left' }`
- `"right"` → `{ relative: 'right' }`
- Numeric string `"2"` → `{ id: 2 }`

### AST Construction

Convert spec-level effect/condition shorthand into kernel AST nodes:

**Effect shorthand examples**:
- `{ addVar: { var: "money", delta: 1 } }` → infer `scope: "pvar"`, `player: "actor"` from context
- `{ draw: { from: "deck", to: "hand", count: 3 } }` → normalize zone selectors, construct `EffectAST`

**Condition shorthand examples**:
- `{ op: "<", left: { ref: "pvar", var: "money" }, right: 10 }` → infer `player: "actor"` for pvar reference

## Invariants

1. Compiler is mechanical — no interpretation, guessing, or AI inference
2. Valid Game Spec always compiles to valid GameDef (completeness)
3. Invalid Game Spec produces diagnostics, never crashes (total function)
4. All macros fully expanded — no macro nodes in output GameDef
5. Output GameDef passes `validateGameDef` (Spec 02) when no error diagnostics present
6. Every diagnostic has a non-empty `path`
7. Every error-severity diagnostic has a `suggestion`
8. Board generation macros produce correct zone adjacency (as tested in Spec 07)
9. Compiled GameDef is deterministic — same spec input → same GameDef output
10. Per-player zone expansion produces correct number of zones (players.max zones per player-owned zone)
11. Invalid board macro parameters always produce blocking diagnostics

## Required Tests

### Unit Tests

**Basic compilation**:
- Compile minimal valid spec (metadata + 1 zone + 1 action + 1 end condition) → valid GameDef
- Compile spec with all features → valid GameDef with all fields populated
- Compiled GameDef passes `validateGameDef` → zero semantic errors

**Macro expansion**:
- `grid(3,3)` in zones → 9 ZoneDefs with adjacency after expansion
- `hex(1)` in zones → 7 ZoneDefs with adjacency
- `grid(0,3)` → blocking diagnostic with path + suggestion
- `hex(-1)` → blocking diagnostic with path + suggestion
- `draw:each` → expanded to forEach over players
- `refillToSize` → expanded to draw with correct count

**Zone normalization**:
- `"hand:each"` with 3 players → `hand:0`, `hand:1`, `hand:2`
- `"deck:none"` → single zone `"deck"`
- `"market"` bare name → correct resolution

**Player selector normalization**:
- `"activePlayer"` → `'active'`
- `"actor"` → `'actor'`
- `"2"` → `{ id: 2 }`

**Error diagnostics**:
- Unbound token reference `$card` not in params → error with suggestion
- Missing action field (no `effects`) → error listing missing fields
- Invalid zone reference `"shop"` when zones are ["deck", "hand", "market"] → error with `alternatives: ["market"]`
- MissingCapability: spec uses unsupported feature → diagnostic with workaround suggestion

**AST construction**:
- Effect shorthand compiles to correct EffectAST structure
- Condition shorthand compiles to correct ConditionAST structure
- Nested effects (forEach with if with setVar) compile correctly

### Integration Tests

- Full pipeline: `parseGameSpec` → `validateGameSpec` → `expandMacros` → `compileGameSpecToGameDef` → `validateGameDef` — all pass with zero errors on valid spec
- Full pipeline on spec with 3 errors → 3 diagnostics with correct paths and suggestions

### Property Tests

- For any spec that compiles without errors, the output GameDef passes `validateGameDef`
- Compilation is deterministic: same spec → same GameDef (JSON equality)
- Every diagnostic in output has non-empty `path` and non-empty `message`

### Golden Tests

- Known full Game Spec (brainstorming example) → expected GameDef JSON (structural comparison)
- Known spec with `grid(3,3)` → expected GameDef with 9 zones and correct adjacency

## Acceptance Criteria

- [ ] Valid Game Spec compiles to valid GameDef
- [ ] Invalid Game Spec produces diagnostics, never crashes
- [ ] All macros fully expanded (grid, hex, draw:each, refillToSize)
- [ ] Zone addressing normalized correctly (per-player expansion)
- [ ] Player selectors normalized to typed PlayerSel
- [ ] Compiler contract enforced (bound tokens, enumerable choices, required fields)
- [ ] Every error diagnostic has path and suggestion
- [ ] Reference failures include fuzzy-matched alternatives
- [ ] MissingCapability diagnostics generated for unsupported features
- [ ] Output GameDef passes validateGameDef
- [ ] Compilation is deterministic
- [ ] Invalid `grid`/`hex` parameters produce blocking diagnostics
- [ ] Full pipeline (parse → validate → expand → compile → validate) works end-to-end

## Files to Create/Modify

```
src/cnl/expand-macros.ts         # NEW — macro expansion (grid, hex, draw:each, etc.)
src/cnl/compiler.ts              # NEW — compileGameSpecToGameDef main entry point
src/cnl/compile-actions.ts       # NEW — action compilation (params, pre, cost, effects)
src/cnl/compile-effects.ts       # NEW — effect AST construction from spec shorthand
src/cnl/compile-conditions.ts    # NEW — condition AST construction from spec shorthand
src/cnl/compile-zones.ts         # NEW — zone normalization and per-player expansion
src/cnl/compile-selectors.ts     # NEW — player selector normalization
src/cnl/fuzzy-match.ts           # NEW — fuzzy string matching for diagnostic suggestions
src/cnl/index.ts                 # MODIFY — re-export compiler APIs
test/unit/expand-macros.test.ts  # NEW — macro expansion tests
test/unit/compiler.test.ts       # NEW — compilation tests
test/unit/compile-effects.test.ts    # NEW — effect AST construction tests
test/unit/compile-conditions.test.ts # NEW — condition AST construction tests
test/unit/compile-zones.test.ts  # NEW — zone normalization tests
test/unit/fuzzy-match.test.ts    # NEW — fuzzy matching tests
test/integration/compile-pipeline.test.ts  # NEW — full compilation pipeline
```
