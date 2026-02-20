# EVTLOG-007: Move control-flow macro provenance to reserved compiler metadata channel

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — AST metadata model, macro expansion, lowering, schemas, trace emission
**Deps**: EVTLOG-006

## Problem

`macroOrigin` currently sits directly on `forEach`/`reduce` user-shape nodes. Even with stricter validation, that model mixes compiler-private provenance with DSL-facing effect fields. For long-term extensibility (more provenance kinds, more compiler passes), provenance should live in a reserved internal metadata channel rather than ad hoc node-level user fields.

## Assumption Reassessment (2026-02-20)

1. Macro expansion currently annotates `forEach`/`reduce` by writing `macroOrigin` directly into expanded effect nodes.
2. AST schemas/types now expose optional `macroOrigin` on `forEach`/`reduce`, making compiler-private data appear as ordinary effect shape.
3. Runner rendering relies on trace-level provenance only; it does not require AST-level public fields.
4. Existing tests do not enforce a reserved compiler metadata namespace contract.

## Architecture Check

1. A reserved compiler metadata envelope is cleaner and more extensible than adding per-node ad hoc provenance fields. It scales to future provenance without polluting DSL shape.
2. This cleanly separates GameSpecDoc behavior/data from compiler infrastructure metadata, preserving engine/game agnosticism.
3. No compatibility aliases: migrate fully to the reserved metadata channel and remove direct user-shape provenance fields.

## What to Change

### 1. Introduce reserved internal metadata envelope for effect nodes

- Define a reserved metadata field (for example `__compilerMeta`) for compiler-internal provenance.
- Store control-flow macro provenance under this envelope, not directly as `forEach.macroOrigin` / `reduce.macroOrigin`.

### 2. Thread metadata through compiler and kernel boundaries

- `expand-effect-macros.ts`: write provenance into reserved metadata channel.
- `compile-effects.ts`: consume only reserved metadata channel and map into kernel AST internal representation.
- `effects-control.ts` + trace builders: continue emitting trace-level `macroOrigin` from trusted compiler provenance.

### 3. Remove direct DSL-shape provenance exposure

- Remove direct `macroOrigin` from public-facing effect DSL schema surface where possible.
- Keep runtime trace schema as explicit contract (`EffectTraceEntry`) with `macroOrigin`.

## Files to Touch

- `packages/engine/src/cnl/expand-effect-macros.ts` (modify — write reserved metadata)
- `packages/engine/src/cnl/compile-effects.ts` (modify — consume reserved metadata only)
- `packages/engine/src/kernel/types-ast.ts` (modify — internal metadata typing)
- `packages/engine/src/kernel/schemas-ast.ts` (modify — reserved metadata schema semantics)
- `packages/engine/src/kernel/effects-control.ts` (modify — provenance threading)
- `packages/engine/src/kernel/control-flow-trace.ts` (modify — trace contract unchanged)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify — metadata location assertions)
- `packages/engine/test/unit/compile-effects.test.ts` (modify — reserved metadata consumption)
- `packages/engine/test/unit/execution-trace.test.ts` (modify — trace invariants unchanged)

## Out of Scope

- Adding provenance for non-control-flow effect kinds
- Runner UI feature changes unrelated to provenance consumption

## Acceptance Criteria

### Tests That Must Pass

1. Macro expansion emits provenance only in reserved compiler metadata channel.
2. Lowering ignores/rejects direct user-shape provenance fields and consumes reserved metadata.
3. Runtime trace still emits correct `macroOrigin` for macro-originated control-flow entries.
4. Existing suites: `pnpm turbo test`

### Invariants

1. Compiler-private provenance is represented only in reserved metadata fields, not as regular user DSL fields.
2. GameSpecDoc authoring surface remains focused on game semantics, not compiler infrastructure internals.
3. Trace contract remains explicit and stable for runner consumption.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — assert provenance is emitted in reserved metadata channel.
2. `packages/engine/test/unit/compile-effects.test.ts` — assert lowering consumes reserved metadata and rejects direct user-shape provenance.
3. `packages/engine/test/unit/execution-trace.test.ts` — assert trace-level provenance behavior remains correct.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/unit/expand-effect-macros.test.ts test/unit/compile-effects.test.ts test/unit/execution-trace.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

