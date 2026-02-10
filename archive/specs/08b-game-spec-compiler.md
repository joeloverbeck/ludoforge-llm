# Spec 08b: Game Spec Compiler

**Status**: ✅ COMPLETED
**Priority**: P1 (required for MVP)
**Complexity**: L
**Dependencies**: Spec 02, Spec 07, Spec 08a
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming sections 2.2C, 2.2D, 4

## Overview

Implement the deterministic compiler that lowers a parsed `GameSpecDoc` (Spec 08a) into executable `GameDef` (Spec 02).

This compiler is mechanical:
- no interpretation or intent guessing
- deterministic output and deterministic diagnostics
- total behavior (returns diagnostics, never crashes)

This spec is on Milestone 2 critical path from `spec:compile` in Spec 12 and from evolution compile loops in Spec 14.

## Scope

### In Scope
- Compiler macro expansion (`grid`, `hex`, `draw:each`, `refillToSize`, `discardDownTo`)
- Full lowering `GameSpecDoc -> GameDef`
- Zone selector canonicalization and validation
- Player selector normalization to `PlayerSel`
- AST lowering from CNL shorthand to kernel AST nodes
- Bound-reference checking across lexical scopes (params, choose/forEach/let bindings)
- Spatial diagnostics pass-through via Spec 07 adjacency validation
- Final semantic validation through `validateGameDef` (Spec 02)
- Deterministic, source-aware diagnostics for LLM correction loops
- Missing-capability diagnostics for features not representable in kernel AST

### Out of Scope
- Markdown/YAML parsing and section extraction (Spec 08a)
- Structural section validation (Spec 08a)
- Kernel execution semantics (Specs 04-07)
- Mechanic bundle composition (Spec 13)
- Reverse compilation (`GameDef -> GameSpecDoc`)

## Public API

```typescript
interface CompileLimits {
  readonly maxExpandedEffects: number; // default 20_000
  readonly maxGeneratedZones: number; // default 10_000
  readonly maxDiagnosticCount: number; // default 500
}

interface CompileOptions {
  readonly sourceMap?: GameSpecSourceMap;
  readonly limits?: Partial<CompileLimits>;
}

function expandMacros(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
};

function compileGameSpecToGameDef(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly gameDef: GameDef | null;
  readonly diagnostics: readonly Diagnostic[];
};
```

## Core Contracts

### Contract A: Diagnostic shape matches Spec 02 exactly
Every diagnostic emitted by this compiler must include:
- `code`
- `path`
- `severity`
- `message`

Optional fields:
- `suggestion`
- `contextSnippet` (when `sourceMap` is provided)
- `alternatives`

### Contract B: Zone IDs are canonicalized for runtime selectors
Output `GameDef.zones[*].id` must be canonical:
- unowned zone base `deck` becomes `deck:none`
- player-owned zone base `hand` is materialized as `hand:0`, `hand:1`, ..., `hand:(players.max-1)`

Output zone selectors in refs/queries/effects are canonicalized too:
- bare `market` is normalized to `market:none` if unambiguous
- `hand:actor`, `hand:active`, `hand:all`, `hand:left`, `hand:right`, `hand:$p`, `hand:2` are preserved
- `hand:each` is macro sugar only and must not remain after expansion

### Contract C: Determinism and totality
- Same input doc + options -> byte-equivalent `GameDef` output and same ordered diagnostics.
- Compiler never throws for user-authored input; failures are represented as diagnostics.

### Contract D: Output validity
If no error diagnostics are returned, compiled output must pass `validateGameDef` with zero errors.

## Macro Expansion

Expansion happens before lowering and must itself be deterministic and bounded by `CompileLimits`.

### Board macros

- `grid(rows, cols)` uses Spec 07 `generateGrid(rows, cols)`.
- `hex(radius)` uses Spec 07 `generateHex(radius)`.
- Parameter validation at expansion-time:
  - `grid`: integers, `rows >= 1`, `cols >= 1`
  - `hex`: integer, `radius >= 0`
- Invalid macro args are blocking errors and yield no `gameDef`.
- Generated zone order follows Spec 07 deterministic iteration order.

### `draw:each`

Sugar:

```yaml
draw: { from: "deck:none", to: "hand:each", count: 5 }
```

Expands to:
- `forEach` over `players`
- bind player variable (default `$p`)
- `draw` to `hand:$p`

### `refillToSize(zone, size, fromZone)`

This is compiler sugar, not kernel primitive.

Required deterministic expansion:
- `size` must be compile-time integer literal `>= 0`; otherwise emit `CNL_COMPILER_MISSING_CAPABILITY`.
- Expand to bounded loop with per-iteration `draw count: 1`, not a single `draw count: size`.
- Loop upper bound is `size`.
- Each iteration checks `zoneCount(zone) < size` before drawing.

This preserves top-up semantics and avoids overfill when zone already has tokens.

### `discardDownTo(zone, size[, to])`

- `size` must be compile-time integer literal `>= 0`; otherwise emit `CNL_COMPILER_MISSING_CAPABILITY`.
- Expand to deterministic bounded sequence:
  - iterate over deterministic token query result
  - while `zoneCount(zone) > size`, either:
    - `moveToken` to destination `to`, or
    - `destroyToken` if destination omitted
- Expansion must respect `maxExpandedEffects`.

## Compilation Pipeline

`compileGameSpecToGameDef(doc, options?)`:

1. Expand macros (or assume caller already expanded; either path must be idempotent).
2. Build lookup indexes for phases/actions/zones/vars/token types.
3. Compile metadata/constants/vars/token types/turn structure/setup.
4. Compile zones:
   - normalize IDs
   - apply owner materialization contract (`:none`, `:0..max-1`)
   - preserve deterministic order
5. Compile actions/triggers/end conditions/scoring:
   - actor and selector normalization
   - shorthand AST lowering
   - lexical binding checks
6. Run Spec 07 adjacency validation and merge diagnostics.
7. Run `validateGameDef` and merge diagnostics.
8. Deterministically sort diagnostics and dedupe equivalent duplicates.
9. Return `gameDef: null` if any error diagnostics exist.

## Selector and Binding Rules

### Player selector normalization

- `"activePlayer"` and `"active"` -> `'active'`
- `"actor"` -> `'actor'`
- `"all"` -> `'all'`
- `"allOther"` -> `'allOther'`
- `"left"` -> `{ relative: 'left' }`
- `"right"` -> `{ relative: 'right' }`
- numeric string `"2"` -> `{ id: 2 }`
- binding token like `"$p"` -> `{ chosen: '$p' }` where context expects `PlayerSel`

### Zone selector normalization

- Canonical output always uses `zoneBase:qualifier`.
- If bare zone name is used in source:
  - resolve to `:none` for unowned zones
  - error when ambiguous or invalid
- `zoneBase:each` is macro-only input and must be removed post-expansion.

### Binding scope validation

Compiler must reject unbound references and enforce lexical scope:
- Action params are in scope for action `pre/cost/effects`.
- `forEach.bind`, `let.bind`, `chooseOne.bind`, `chooseN.bind` are in scope only within their nested effect arrays.
- Inner bindings can shadow outer names only with warning (`CNL_COMPILER_BINDING_SHADOWED`).
- Unbound `$name` is blocking error with location and nearest alternatives.

## Missing Capability Diagnostics

Use `code: "CNL_COMPILER_MISSING_CAPABILITY"` when source requests behavior not expressible in current kernel AST.

Required fields:
- `path`
- `message` describing unsupported behavior
- `suggestion` with actionable rewrite
- `alternatives` when applicable

These diagnostics are consumed by Spec 14 aggregation.

## Deterministic Diagnostics

All compiler diagnostics must be stable-ordered by:
1. source-map byte offset when available
2. `path` lexical order
3. severity rank (`error`, `warning`, `info`)
4. `code`

When `sourceMap` is provided, include `contextSnippet` for user-facing diagnostics.

## Invariants

1. Compiler is mechanical and deterministic.
2. Compiler is total (diagnostics over crashes).
3. No macro nodes remain after expansion.
4. Output selectors are canonicalized.
5. Every diagnostic has non-empty `code`, `path`, and `message`.
6. Error diagnostics include `suggestion` unless no safe suggestion exists.
7. No unresolved identifiers remain in output.
8. If zero errors, `validateGameDef` returns zero errors.
9. Expansion and compilation honor configured safety limits.

## Required Tests

### Unit tests

- Minimal valid doc compiles to valid `GameDef`.
- Determinism: compile same doc twice -> deep-equal output and diagnostics.
- Zone owner materialization:
  - `owner: none` -> `base:none`
  - `owner: player` + max=3 -> `base:0`, `base:1`, `base:2`
- Zone selector canonicalization:
  - bare `deck` -> `deck:none`
  - invalid qualifier -> diagnostic with alternatives
- Macro tests:
  - `grid(3,3)` -> 9 zones
  - `hex(1)` -> 7 zones
  - invalid params -> blocking diagnostics
  - `draw:each` expansion correctness
  - `refillToSize` does not overfill pre-populated zone
  - `discardDownTo` removes exact surplus count
- Binding scope tests:
  - valid nested binding resolution
  - unbound token reference -> blocking diagnostic
  - shadowing -> warning
- Missing capability diagnostics emitted with required fields.

### Integration tests

- Full chain:
  - `parseGameSpec -> validateGameSpec -> expandMacros -> compileGameSpecToGameDef -> validateGameDef`
  - valid input produces no errors
- Invalid input with 3 independent issues returns 3 stable diagnostics with source paths.
- `players.min` and `players.max` variants compile consistently for zone materialization policy.

### Property tests

- Any compilation with zero errors passes `validateGameDef`.
- Diagnostic ordering is stable regardless of object key insertion order in input YAML.
- All diagnostics satisfy required field non-emptiness.

### Golden tests

- Representative full Game Spec -> expected GameDef snapshot.
- Representative malformed spec -> expected diagnostics snapshot (code/path/suggestion).

## Acceptance Criteria

- [ ] Valid Game Spec compiles to valid GameDef
- [ ] Invalid Game Spec yields deterministic diagnostics and never crashes
- [ ] Diagnostics conform to Spec 02 shape (`code`, `path`, `severity`, `message`)
- [ ] Macro expansion covers `grid`, `hex`, `draw:each`, `refillToSize`, `discardDownTo`
- [ ] No macro sugar remains in compiled output
- [ ] Zone IDs/selectors are canonicalized and ownership-correct
- [ ] Player selectors are normalized to valid `PlayerSel`
- [ ] Lexical binding validation catches unbound and shadowed bindings
- [ ] Missing-capability diagnostics are emitted for non-expressible constructs
- [ ] `validateGameDef` returns zero errors when compiler returns zero errors
- [ ] Compilation output and diagnostics are deterministic
- [ ] Safety limits prevent unbounded expansion
- [ ] End-to-end pipeline (`parse -> validate -> expand -> compile -> validate`) passes

## Files to Create/Modify

```text
src/cnl/expand-macros.ts             # MODIFY — doc-level macro expansion + safety limits
src/cnl/compiler.ts                  # NEW — compileGameSpecToGameDef entry point
src/cnl/compile-actions.ts           # NEW — actions/triggers/end conditions compilation
src/cnl/compile-effects.ts           # NEW — effect lowering + binding scope checks
src/cnl/compile-conditions.ts        # NEW — condition/value/query lowering
src/cnl/compile-zones.ts             # NEW — zone materialization + selector canonicalization
src/cnl/compile-selectors.ts         # NEW — player/zone selector normalization
src/cnl/compiler-diagnostics.ts      # NEW — deterministic diagnostic ordering/helpers
src/cnl/index.ts                     # MODIFY — export compiler APIs
test/unit/cnl/expand-macros.test.ts  # NEW
test/unit/cnl/compiler.test.ts       # NEW
test/unit/cnl/compile-zones.test.ts  # NEW
test/unit/cnl/compile-bindings.test.ts  # NEW
test/integration/cnl/compile-pipeline.test.ts  # NEW
```

## Outcome
- **Completion date**: 2026-02-10
- **What was actually changed**:
  - Deterministic compiler pipeline implemented and exported via `src/cnl/index.ts`.
  - Macro expansion, selector normalization, zone materialization, diagnostics ordering/dedupe, and final `validateGameDef` merge implemented.
  - Compiler coverage added across unit, integration, property-style, and golden tests, including fixture-based pipeline coverage.
- **Deviations from original plan**:
  - Test paths were aligned with the current repository layout (for example `test/integration/compile-pipeline.test.ts` and `test/unit/compiler.golden.test.ts`).
  - Dedicated compiler fixtures were added under `test/fixtures/cnl/compiler/` because parser/validator fixtures were not fully compiler-valid.
- **Verification results**:
  - `npm run build` passed.
  - Targeted compiler property/golden/pipeline test commands passed.
  - `npm test` passed.
