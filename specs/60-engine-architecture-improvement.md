# Spec 60 — Engine Architecture Improvement

## Context

The `fitl-playbook-golden.test.ts` e2e suite proves the engine is fundamentally game-agnostic and correct. However, deep analysis of the kernel/compiler architecture reveals 6 structural pain points that increase the cost of extending the engine with new primitives, games, and capabilities. This spec addresses all 6 in a comprehensive refactoring with no backwards compatibility constraints.

### Pain Points Summary

| # | Workstream | Problem | Impact |
|---|-----------|---------|--------|
| 1 | LAYCTX | `EffectContext` (23 fields across 3 variants) duplicates `EvalContext` (11 fields); 46+ files import one or both | Every new field must be added twice; context creation is error-prone |
| 2 | EFFREG | `effect-dispatch.ts` uses 35-branch if-chain to route effects | Adding a new effect requires touching 3 places (type, dispatch, handler); no exhaustiveness at the type level |
| 3 | IDENT | 3 overlapping player identity representations (`PlayerId`, seat IDs, player indices) with scattered conversion logic across 8+ files | Seat resolution bugs, inconsistent lookup paths |
| 4 | VALDECOMP | `validate-gamedef-behavior.ts` is a 2,813-line god-file with 30+ private functions | Hard to navigate, test in isolation, or extend for new AST nodes |
| 5 | ASTSAFE | `evalValue` returns `ScalarValue \| ScalarArrayValue` — callers must narrow manually; compiler builds AST via raw object literals | Type errors surface at runtime instead of compile time |
| 6 | MACROEXP | `expand-templates.ts` runs 5 passes in hardcoded order with no dependency awareness | Adding a 6th pass requires manual ordering analysis; no inter-pass reference tracking |

---

## Workstream 1: LAYCTX — Layered Context

### Current State

Two context interfaces exist independently:

- **`EvalContext`** (`eval-context.ts`, 60 LOC) — 11 fields: `def`, `adjacencyGraph`, `state`, `activePlayer`, `actorPlayer`, `bindings`, `resources`, `runtimeTableIndex`, `freeOperationOverlay`, `maxQueryResults`, `collector`
- **`EffectContext`** (`effect-context.ts`, 165 LOC) — 23 fields across base + 3 variant types (`ExecutionEffectContext`, `DiscoveryStrictEffectContext`, `DiscoveryProbeEffectContext`). The base interface (`EffectContextBase`) contains all 11 `EvalContext` fields plus 12 additional effect-specific fields: `rng`, `moveParams`, `traceContext`, `effectPath`, `maxEffectOps`, `freeOperation`, `freeOperationOverlay`, `maxQueryResults`, `collector`, `phaseTransitionBudget`, `iterationPath`, `freeOperationProbeScope`

46+ files import `EffectContext` and/or `EvalContext`. The duplication means every new read-side field must be added to both interfaces, and conversion between contexts is manual and error-prone.

### Target State

A three-layer context hierarchy where each layer extends the previous:

```
ReadContext (immutable game state access)
  └─ WriteContext extends ReadContext (+ rng, bindings mutation, moveParams)
       └─ EffectContext extends WriteContext (+ mode, decisionAuthority, traceContext, budget, ...)
```

- **`ReadContext`**: `def`, `adjacencyGraph`, `state`, `activePlayer`, `actorPlayer`, `bindings`, `resources`, `runtimeTableIndex`, `freeOperationOverlay`, `maxQueryResults`, `collector`
- **`WriteContext`**: ReadContext + `rng`, `moveParams`
- **`EffectContext`**: WriteContext + `traceContext`, `effectPath`, `maxEffectOps`, `freeOperation`, `phaseTransitionBudget`, `iterationPath`, `freeOperationProbeScope`, `mode`, `decisionAuthority`

`EvalContext` becomes a type alias for `ReadContext` (deprecated, then removed).

### Key Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/eval-context.ts` | Replace `EvalContext` with `ReadContext`; keep as re-export alias during migration |
| `packages/engine/src/kernel/effect-context.ts` | Refactor to extend `ReadContext` → `WriteContext` → `EffectContext` |
| 46+ consumer files | Migrate imports from `EvalContext` → `ReadContext` |

### Migration Approach

1. Define `ReadContext` and `WriteContext` in `effect-context.ts`
2. Make `EffectContextBase` extend `WriteContext` (remove duplicated fields)
3. Add `EvalContext = ReadContext` type alias in `eval-context.ts`
4. Migrate all 46+ consumer files to import `ReadContext` directly
5. Remove `eval-context.ts` re-export once all consumers are migrated

### Tickets

| ID | Title | Size | Status |
|----|-------|------|--------|
| LAYCTX-001 | Define ReadContext and WriteContext; refactor EffectContext to extend them | M | ✅ Done |
| LAYCTX-002 | Migrate all EvalContext consumers to ReadContext | L | ✅ Done |
| LAYCTX-003 | Remove EvalContext re-export; delete dead code | S | ✅ Done |

### Implementation Notes

LAYCTX completed. Key decisions and deviations from original plan:

- **ReadContext defined in `eval-context.ts`** (not `effect-context.ts`) to avoid circular imports — `effect-context.ts` imports from `eval-context.ts`, not vice versa.
- **WriteContext defined in `effect-context.ts`** extending `ReadContext` with `rng` and `moveParams`.
- **EffectContextBase** now extends `WriteContext` with 7 effect-specific fields (down from 20+ with duplication).
- **Factory function names preserved**: `createEvalContext`, `EvalContextInput`, `EvalRuntimeResources` kept their names to minimize churn on callers that use factories (not types).
- **No test modifications**: all existing tests pass unchanged, confirming behavioral preservation.
- Phase 2 (EFFREG, IDENT) is now unblocked.

---

## Workstream 2: EFFREG — Effect Registry

### Current State

`effect-dispatch.ts` (309 LOC) contains:

- `effectTypeOf()`: a 35-branch if-chain that discriminates `EffectAST` members by checking `'key' in effect` for each variant
- `dispatchEffect()`: a parallel 35-branch if-chain routing each variant to its handler function across 9 `effects-*.ts` files

Adding a new effect kind requires:
1. Adding the type variant to `EffectAST` in `types-ast.ts`
2. Adding a branch to `effectTypeOf()`
3. Adding a branch to `dispatchEffect()`
4. Implementing the handler in an `effects-*.ts` file

The `effectTypeOf` function does have an exhaustiveness check via `const _exhaustive: never = effect`, but this is runtime-only — a missing dispatch branch compiles fine and throws at runtime.

### Target State

A typed registry pattern with compile-time exhaustiveness:

```typescript
// types-ast.ts — add a mapped type
type EffectKindMap = {
  setVar: { readonly setVar: SetVarPayload };
  addVar: { readonly addVar: AddVarPayload };
  // ... one entry per effect kind
};

type EffectKind = keyof EffectKindMap;
type EffectAST = EffectKindMap[EffectKind];

// effect-registry.ts — new file
type EffectHandler<K extends EffectKind> = (
  effect: EffectKindMap[K],
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffects: ApplyEffectsFn,
) => EffectResult;

type EffectRegistry = { [K in EffectKind]: EffectHandler<K> };

const registry: EffectRegistry = {
  setVar: applySetVar,
  addVar: applyAddVar,
  // ... compile error if any kind is missing
};
```

The registry object enforces that every `EffectKind` has a corresponding handler at compile time. `dispatchEffect` becomes a simple lookup: `registry[effectKind](effect, ctx, budget, applyEffects)`.

### Key Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-ast.ts` | Add `EffectKindMap` mapped type; derive `EffectAST` from it |
| `packages/engine/src/kernel/effect-registry.ts` | New file: typed registry, handler type, registration |
| `packages/engine/src/kernel/effect-dispatch.ts` | Replace if-chains with registry lookup |
| 9 `effects-*.ts` files | Adjust handler signatures to match `EffectHandler<K>` |

### Migration Approach

1. Add `EffectKindMap` to `types-ast.ts`; derive `EffectAST = EffectKindMap[keyof EffectKindMap]`
2. Create `effect-registry.ts` with `EffectHandler` type and `EffectRegistry` mapped type
3. Refactor each `effects-*.ts` handler to conform to the `EffectHandler<K>` signature
4. Build the registry object (compile-time exhaustiveness check)
5. Replace `dispatchEffect` if-chain with registry lookup
6. Remove `effectTypeOf` helper (no longer needed)

### Tickets

| ID | Title | Size | Status |
|----|-------|------|--------|
| EFFREG-001 | Define EffectKindMap mapped type in types-ast.ts | M | ✅ Done |
| EFFREG-002 | Create effect-registry.ts with typed handler registration | M | ✅ Done |
| EFFREG-003 | Replace dispatch if-chains with registry lookup; remove effectTypeOf | M | ✅ Done |

### Implementation Notes

EFFREG completed. Key decisions and deviations from original plan:

- **3 tickets instead of 4**: The original plan had a separate ticket for refactoring `effects-*.ts` handler signatures. Instead, the registry uses a `simple()` wrapper function that adapts 2-arg handlers `(effect, ctx) => EffectResult` to the 4-arg registry signature `(effect, ctx, budget, applyEffects) => EffectResult`, eliminating the need to modify any handler files.
- **`EffectKindMap` interface** (not mapped type): Defined as an `interface` in `types-ast.ts` mapping each of the 34 effect kind names to their tagged object types. `EffectAST` is derived as `EffectKindMap[EffectKind]`, structurally identical to the old union.
- **Helper types exported**: `EffectKind = keyof EffectKindMap` and `EffectOfKind<K>` enable typed effect handling throughout the codebase.
- **`effectKindOf` replaces `effectTypeOf`**: Returns `EffectKind` (typed) instead of `string`. Uses `Object.keys(effect)[0]` — simpler than the old 34-branch if-chain.
- **Registry exhaustiveness**: The `EffectRegistry` mapped type `{ [K in EffectKind]: EffectHandler<K> }` produces a compile error if any effect kind is missing a handler entry.
- **No handler file modifications**: All 9 `effects-*.ts` files remain unchanged. The `simple()` wrapper adapts simple handlers; control-flow handlers (`applyIf`, `applyForEach`, `applyReduce`, `applyRemoveByPriority`, `applyLet`, `applyEvaluateSubset`, `applyRollRandom`) are assigned directly since they already accept budget and callback args.
- **No test modifications**: All existing tests pass unchanged, confirming behavioral preservation.
- Phase 3 (IDENT, VALDECOMP) is now unblocked.

---

## Workstream 3: IDENT — Seat Identity Unification

### Current State

Three overlapping player identity representations:

1. **`PlayerId`** (branded string) — used throughout the kernel as the canonical player identifier
2. **Seat IDs** (string) — human-readable names from `GameDef.seats[].id` (e.g., `"US"`, `"NVA"`)
3. **Player indices** (number) — 0-based position in `GameDef.seats` / `GameState.players`

`seat-resolution.ts` (166 LOC) contains:
- `SeatResolutionIndex` with 5 parallel lookup maps (`seatIdByPlayerIndex`, `playerIndexBySeatId`, `playerIndexByNormalizedSeatId`, `playerIndexByCardSeatKey`, `playerIndexByNormalizedCardSeatKey`)
- `resolvePlayerIndexForSeatValue()` — cascading lookup across 4 maps
- `resolvePlayerIndexForTurnFlowSeat()` — thin wrapper
- `resolveTurnFlowSeatForPlayerIndex()` — reverse lookup via linear scan

8 files import from `seat-resolution.ts`. Additional seat-related logic is scattered across `apply-move.ts`, `legal-moves.ts`, `turn-flow-eligibility.ts`, and `effects-turn-flow.ts`.

### Target State

A single `identity.ts` module that provides:

- `SeatId` branded type (replacing raw strings for seat identifiers)
- `PlayerIndex` branded type (replacing raw numbers)
- `IdentityIndex` — consolidated bidirectional lookup (seat ↔ index, normalized variants, card-seat mapping)
- Clear API: `seatToIndex(seat, index)`, `indexToSeat(index, index)`, `toPlayerId(index, index)`

### Key Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/seat-resolution.ts` | Delete after migration |
| `packages/engine/src/kernel/identity.ts` | New file: branded types, consolidated lookup |
| 8 direct importers + ~37 indirect consumers | Migrate to `identity.ts` API |

### Migration Approach

1. Create `identity.ts` with `SeatId`, `PlayerIndex` branded types and `IdentityIndex`
2. Implement consolidated lookup functions
3. Migrate direct importers (8 files) to new module
4. Update indirect consumers that construct or pass seat values
5. Delete `seat-resolution.ts`

### Tickets

| ID | Title | Size |
|----|-------|------|
| IDENT-001 | Create identity.ts with branded types and IdentityIndex | M |
| IDENT-002 | Migrate all seat-resolution consumers to identity.ts | L |
| IDENT-003 | Delete seat-resolution.ts; clean up dead imports | S |

---

## Workstream 4: VALDECOMP — Validator Decomposition

### Current State

`validate-gamedef-behavior.ts` is a 2,813-line god-file containing 30+ validation functions. It imports from 15+ modules and handles validation for:

- Effects (setVar, addVar, transferVar, moveToken, forEach, chooseOne, etc.)
- Conditions (comparisons, boolean logic, spatial predicates)
- Value expressions (arithmetic, aggregates, references)
- Queries and token filters
- Event structures (branches, targets, free operation grants, lasting effects)
- Turn flow and free operation grant contracts

All functions are private (module-scoped) except `collectEffectDeclaredBinderPolicyPatternsForTest()` (test helper). The file is the single largest in the engine codebase.

### Target State

5 focused validator modules, each ≤600 LOC:

| Module | Responsibility | Estimated LOC |
|--------|---------------|---------------|
| `validate-effects.ts` | Effect AST node validation (setVar, moveToken, forEach, etc.) | ~600 |
| `validate-conditions.ts` | Condition AST validation (comparisons, boolean, spatial) | ~400 |
| `validate-values.ts` | Value expression and reference validation | ~400 |
| `validate-queries.ts` | Query, token filter, and options validation | ~500 |
| `validate-events.ts` | Event structure, branches, free op grants, lasting effects | ~500 |

Plus a thin orchestrator `validate-gamedef-behavior.ts` (~100 LOC) that calls into each module.

A `VALIDATION_BOUNDARY.md` document clarifies the compiler-vs-kernel validation boundary:
- **Compiler**: structural correctness (field presence, type shapes, reference resolution)
- **Kernel**: behavioral correctness (runtime invariants, budget limits, state consistency)

### Key Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/validate-gamedef-behavior.ts` | Decompose into 5 modules; retain as thin orchestrator |
| `packages/engine/src/kernel/validate-effects.ts` | New: effect AST validation |
| `packages/engine/src/kernel/validate-conditions.ts` | New: condition AST validation |
| `packages/engine/src/kernel/validate-values.ts` | New: value expression validation |
| `packages/engine/src/kernel/validate-queries.ts` | New: query and token filter validation |
| `packages/engine/src/kernel/validate-events.ts` | New: event structure validation |

### Migration Approach

1. Identify function clusters by validation domain
2. Extract each cluster to its own module with explicit exports
3. Wire shared types/helpers through a `validate-shared.ts` if needed
4. Retain `validate-gamedef-behavior.ts` as orchestrator that delegates to sub-modules
5. Document compiler-vs-kernel validation boundary

### Tickets

| ID | Title | Size |
|----|-------|------|
| VALDECOMP-001 | Extract effect validation into validate-effects.ts | L |
| VALDECOMP-002 | Extract condition and value validation into separate modules | M |
| VALDECOMP-003 | Extract query/event validation; wire up orchestrator | L |
| VALDECOMP-004 | Document validation boundary (compiler vs kernel) | S |

---

## Workstream 5: ASTSAFE — AST Type Safety

### Current State

`evalValue()` in `eval-value.ts` (133 LOC) returns `ScalarValue | ScalarArrayValue`. Callers must narrow the return type manually:

```typescript
const val = evalValue(expr, ctx);
// Caller must check: is this a number? string? boolean? array?
```

Compiler files (`compile-effects-*.ts`, 9 files) build AST nodes as raw object literals:

```typescript
const effect: EffectAST = { setVar: { var: 'x', player: ..., value: 5 } };
```

This provides no compile-time guarantee that the literal's shape matches the intended variant.

### Target State

**Typed eval variants** that return narrowed types:

```typescript
function evalNumericValue(expr: NumericValueExpr, ctx: ReadContext): number;
function evalStringValue(expr: StringValueExpr, ctx: ReadContext): string;
function evalBooleanValue(expr: BooleanValueExpr, ctx: ReadContext): boolean;
```

Callers use the variant matching their expected type — type errors caught at compile time.

**AST builder functions** that replace raw object literals:

```typescript
// ast-builders.ts — new file
function setVarEffect(payload: SetVarPayload): EffectAST;
function addVarEffect(payload: AddVarPayload): EffectAST;
function moveTokenEffect(payload: MoveTokenPayload): EffectAST;
// ... one per effect kind
```

Builder functions provide autocomplete, validate shape at the call site, and serve as a stable API surface for compiler modules.

### Key Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/eval-value.ts` | Add typed eval variants alongside existing `evalValue` |
| `packages/engine/src/kernel/ast-builders.ts` | New file: builder functions for all EffectAST variants |
| 9 `compile-effects-*.ts` files | Migrate from raw literals to builder functions |
| Kernel consumer files | Migrate to typed eval variants where applicable |

### Migration Approach

1. Define `NumericValueExpr`, `StringValueExpr` (may already exist partially in `types-ast.ts`)
2. Add `evalNumericValue`, `evalStringValue`, `evalBooleanValue` to `eval-value.ts`
3. Create `ast-builders.ts` with one builder per EffectAST variant
4. Migrate compiler files to use builders
5. Migrate kernel consumers to use typed eval variants

### Tickets

| ID | Title | Size |
|----|-------|------|
| ASTSAFE-001 | Add typed eval variants (evalNumericValue, evalStringValue, evalBooleanValue) | M |
| ASTSAFE-002 | Create ast-builders.ts with builder functions for all EffectAST variants | M |
| ASTSAFE-003 | Migrate compiler and kernel consumers to typed eval and builders | L |

---

## Workstream 6: MACROEXP — Macro Expansion Pipeline

### Current State

`expand-templates.ts` (45 LOC) orchestrates 5 expansion passes in a hardcoded sequential order:

```
A1: expandPieceGeneration   — combinatorial piece generation
A2: expandBatchMarkers      — batch marker definitions
A3: expandBatchVars         — batch variable definitions
A4: expandZoneTemplates     — per-player zone templates
A5: expandPhaseTemplates    — phase template definitions
```

Each pass takes a `GameSpecDoc` and returns `{ doc, diagnostics }`. The ordering is implicit — there's no declared dependency between passes, no provenance metadata on generated entities, and no topological validation.

Adding a 6th pass requires manually analyzing which existing passes it depends on and which depend on it.

### Target State

**Dependency-aware expansion** via topological sort:

```typescript
interface ExpansionPass {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly expand: (doc: GameSpecDoc) => { doc: GameSpecDoc; diagnostics: Diagnostic[] };
}

function expandTemplates(passes: readonly ExpansionPass[], doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] };
```

The orchestrator topologically sorts passes by `dependsOn`, validates no cycles exist, and runs them in dependency order. Adding a new pass requires only declaring its dependencies.

**Provenance metadata**: each generated entity carries `_origin: { pass: string; template: string }` so downstream validation can trace generated content back to its source template.

**Unified placeholder syntax**: standardize placeholder format across all passes (currently some use `{player}`, others may use different conventions).

### Key Files

| File | Change |
|------|--------|
| `packages/engine/src/cnl/expand-templates.ts` | Refactor to dependency-aware orchestrator |
| `packages/engine/src/cnl/expand-piece-generation.ts` | Add pass metadata and provenance |
| `packages/engine/src/cnl/expand-batch-markers.ts` | Add pass metadata and provenance |
| `packages/engine/src/cnl/expand-batch-vars.ts` | Add pass metadata and provenance |
| `packages/engine/src/cnl/expand-zone-templates.ts` | Add pass metadata and provenance |
| `packages/engine/src/cnl/expand-phase-templates.ts` | Add pass metadata and provenance |

### Migration Approach

1. Define `ExpansionPass` interface with `id`, `dependsOn`, `expand`
2. Implement topological sort and cycle detection
3. Refactor each existing pass to conform to `ExpansionPass` and declare dependencies
4. Add provenance metadata to generated entities
5. Standardize placeholder syntax across passes

### Tickets

| ID | Title | Size |
|----|-------|------|
| MACROEXP-001 | Define ExpansionPass interface; implement topological sort orchestrator | M |
| MACROEXP-002 | Refactor 5 existing passes to ExpansionPass; declare dependencies | M |
| MACROEXP-003 | Add provenance metadata and unified placeholder syntax | M |

---

## Dependency Ordering

```
Phase 1 (parallel — no cross-dependencies):
  LAYCTX    ─── context hierarchy refactoring ✅ COMPLETE
  VALDECOMP ─── validator decomposition
  ASTSAFE   ─── AST type safety
  MACROEXP  ─── macro expansion pipeline

Phase 2 (UNBLOCKED — LAYCTX complete):
  EFFREG ─── effect registry (needs ReadContext/WriteContext from LAYCTX)
  IDENT  ─── seat identity (needs ReadContext from LAYCTX)
```

EFFREG and IDENT depend on LAYCTX because:
- EFFREG handler signatures reference `EffectContext` which will be restructured by LAYCTX
- IDENT's `IdentityIndex` will be integrated into `ReadContext`

VALDECOMP, ASTSAFE, and MACROEXP are purely additive restructurings with no cross-dependencies.

---

## Ticket Summary

| Workstream | Tickets | Total Size |
|-----------|---------|------------|
| LAYCTX | 3 (M + L + S) | ~5 story points |
| EFFREG | 4 (M + M + L + M) | ~7 story points |
| IDENT | 3 (M + L + S) | ~5 story points |
| VALDECOMP | 4 (L + M + L + S) | ~7 story points |
| ASTSAFE | 3 (M + M + L) | ~5 story points |
| MACROEXP | 3 (M + M + M) | ~5 story points |
| **Total** | **20 tickets** | **~34 story points** |

---

## Verification Strategy

### Per-Ticket Gate

Every ticket must pass before merge:

```bash
pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test
```

### Per-Workstream Structural Verification

| Workstream | Verification |
|-----------|-------------|
| LAYCTX | ✅ No direct `EvalContext` type imports remain; `ReadContext → WriteContext → EffectContextBase` hierarchy verified |
| EFFREG | `effect-dispatch.ts` contains no if-chains; registry object compiles with exhaustiveness |
| IDENT | `seat-resolution.ts` deleted; no raw seat string comparisons outside `identity.ts` |
| VALDECOMP | `validate-gamedef-behavior.ts` ≤200 LOC (orchestrator only); each sub-module ≤600 LOC |
| ASTSAFE | No raw `EffectAST` object literals in `compile-effects-*.ts`; no unnarrrowed `evalValue` calls at new call sites |
| MACROEXP | `expand-templates.ts` uses topological sort; all passes declare `dependsOn` |

### Ultimate Verification

The golden test suite must pass unchanged — these tests prove the refactoring preserves all behavioral semantics:

- `fitl-playbook-golden.test.ts` — 41+ FITL game scenarios
- `texas-holdem-vector.test.ts` — Texas Hold'em deterministic vector
- All existing unit, integration, and e2e tests (`pnpm turbo test`)

No test should be modified to accommodate the refactoring. If a test fails, the implementation is wrong.
