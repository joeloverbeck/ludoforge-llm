# EVTLOG-004: Add structured macro origin metadata to effect trace entries

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Large
**Engine Changes**: Yes — kernel trace types, compiler macro expansion
**Deps**: None

## Problem

The runner's `summarizeLifecycleBinding` function uses a heuristic (split on `__`, find first uppercase-containing token) to reverse-engineer the macro name and loop variable from hygienic binding names. This works today but is fragile:

- The heuristic depends on implementation details of `makeHygienicBindingName` in the compiler (`expand-effect-macros.ts`).
- If the compiler changes its naming convention (e.g., different separator, different sanitization), the runner's display silently degrades to showing raw names.
- The boundary detection assumes macro IDs are all-lowercase and GameDef path keys are camelCase — a convention, not a contract.

The root cause is that the kernel's trace output encodes structural information (macro origin, loop variable) inside an opaque string rather than as structured data.

## Assumption Reassessment (2026-02-20)

1. `EffectTraceEntry` currently exposes `forEach.bind` and `reduce.resultBind` as plain strings in `packages/engine/src/kernel/types-core.ts`; these often carry hygienic macro binding names.
2. Hygienic names are generated in `packages/engine/src/cnl/expand-effect-macros.ts` via `makeHygienicBindingName` as `$__macro_${sanitize(macroId)}_${sanitize(path)}_${sanitize(stem)}`.
3. The current compiler pipeline drops all macro-origin structure after expansion:
   - `expand-effect-macros.ts` rewrites binding strings.
   - `compile-effects.ts` reconstructs `forEach`/`reduce` AST nodes from known fields only.
   - `types-ast.ts` does not currently model any macro-origin metadata on control-flow nodes.
4. The kernel traces `forEach`/`reduce` using only AST binding strings (`effects-control.ts` + `control-flow-trace.ts`), so the runner receives opaque identifiers.
5. The runner currently uses a heuristic parser in `packages/runner/src/model/translate-effect-trace.ts` to infer macro/stem labels from the opaque name.
6. Trace schema ownership is zod-first in `packages/engine/src/kernel/schemas-core.ts`; `packages/engine/schemas/Trace.schema.json` is a generated artifact and must remain synchronized.

## Architecture Check

1. Structured macro-origin metadata is strictly better than heuristic parsing: it makes the engine-runner contract explicit and decouples UI output from compiler naming internals.
2. The metadata is engine-infrastructure-only (`macroId`, `stem`) and game-agnostic, so it complies with the Agnostic Engine Rule.
3. Per architecture policy for this ticket: no backwards-compatibility heuristic aliasing. Runner display logic should stop reverse-engineering macro names from hygienic strings.
4. Clean layering:
   - Compiler expansion produces macro-origin metadata.
   - AST preserves it explicitly.
   - Kernel trace emission forwards it unchanged.
   - Runner presentation consumes structured metadata directly.

## What to Change

### 1. Extend `EffectTraceEntry` for `forEach` and `reduce`

Add an optional `macroOrigin` field to the `forEach` and `reduce` trace entry types:

```typescript
// In the engine's effect trace types
interface MacroOrigin {
  readonly macroId: string;   // original kebab-case macro ID
  readonly stem: string;       // original binding variable name (without $)
}

// forEach entry gains:
readonly macroOrigin?: MacroOrigin;

// reduce entry gains:
readonly macroOrigin?: MacroOrigin;
```

Also extend `EffectAST` control-flow nodes (`forEach`, `reduce`) with the same optional `macroOrigin` shape so the compiler can carry this metadata without string parsing in the kernel.

### 2. Populate `macroOrigin` in kernel trace emission

Do not infer from string patterns at runtime. Thread metadata from compiler to kernel:
- In `expand-effect-macros.ts`, attach `{ macroId, stem }` to macro-expanded `forEach.bind` and `reduce.resultBind` nodes.
- In `compile-effects.ts`, preserve valid `macroOrigin` fields when lowering `forEach`/`reduce`.
- In `effects-control.ts` + `control-flow-trace.ts`, emit `macroOrigin` directly from the AST node into trace entries.

### 3. Update `summarizeLifecycleBinding` in the runner

Check for `macroOrigin` first:
```typescript
if (entry.macroOrigin) {
  const variable = formatIdAsDisplayName(entry.macroOrigin.stem);
  const macro = formatIdAsDisplayName(entry.macroOrigin.macroId);
  return `${variable} in ${macro}`;
}
// fallback for non-macro bindings: format the binding identifier directly
return summarizeLifecycleBinding(entry.bind);
```

Remove the heuristic macro-name extraction path that parses `$__macro_...` strings.

### 4. Update JSON Schema for trace entries

Update zod source schema in `packages/engine/src/kernel/schemas-core.ts` and regenerate `packages/engine/schemas/Trace.schema.json`.
Also update AST zod schema in `packages/engine/src/kernel/schemas-ast.ts` for `forEach`/`reduce` optional `macroOrigin`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `MacroOrigin`, extend `EffectTraceForEach`/`EffectTraceReduce`)
- `packages/engine/src/kernel/types-ast.ts` (modify — add optional `macroOrigin` to `forEach`/`reduce`)
- `packages/engine/src/kernel/effects-control.ts` (modify — populate macroOrigin in trace emission)
- `packages/engine/src/kernel/control-flow-trace.ts` (modify — thread macroOrigin through trace builders)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify — embed origin in AST nodes)
- `packages/engine/src/cnl/compile-effects.ts` (modify — thread origin through compilation)
- `packages/runner/src/model/translate-effect-trace.ts` (modify — use structured origin when available)
- `packages/engine/src/kernel/schemas-core.ts` (modify — trace schema source)
- `packages/engine/src/kernel/schemas-ast.ts` (modify — AST schema source)
- `packages/engine/schemas/Trace.schema.json` (regen artifact via schema artifacts command)

## Out of Scope

- Adding macro origin to other trace entry types (varChange, moveToken, etc.)
- Changing the hygienic naming convention itself

## Acceptance Criteria

### Tests That Must Pass

1. Engine unit test: `forEach` trace entry for a macro-expanded loop includes `macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' }`.
2. Engine unit test: `reduce` trace entry for a macro-expanded reduce includes `macroOrigin` with correct macroId and stem.
3. Engine unit test: non-macro `forEach` (direct in action effects) has `macroOrigin: undefined`.
4. Runner unit test: `translateEffectTrace` uses `macroOrigin` when present for `forEach` and `reduce`.
5. Runner unit test: when `macroOrigin` is absent, renderer formats the raw binding name without heuristic macro parsing.
6. Existing suites: `pnpm turbo test`

### Invariants

1. `macroOrigin.macroId` always matches the original kebab-case macro ID from the GameSpecDoc (not the sanitized form).
2. `macroOrigin.stem` always matches the original binding name (with `$` stripped).
3. The runner never crashes if `macroOrigin` is missing — graceful fallback to direct binding formatting (no heuristic parsing).
4. No game-specific data in the `MacroOrigin` type — it describes compiler infrastructure only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — Verify macro-expanded `forEach`/`reduce` carry `macroOrigin` metadata in expanded effects.
2. `packages/engine/test/unit/compile-effects.test.ts` — Verify lowering preserves `macroOrigin` on `forEach`/`reduce`.
3. `packages/engine/test/unit/execution-trace.test.ts` — Verify emitted trace includes `macroOrigin` for annotated control-flow nodes and remains `undefined` for non-macro nodes.
4. `packages/runner/test/model/translate-effect-trace.test.ts` — Verify renderer uses structured `macroOrigin` and does not rely on heuristic parsing.
5. `packages/engine/test/unit/json-schema.test.ts` (existing coverage) — Ensure updated trace schema remains valid via existing schema tests.

### Commands

1. `pnpm turbo test`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Added optional structured `macroOrigin` metadata to `forEach`/`reduce` AST nodes and effect trace entries.
  - Annotated macro-expanded control-flow nodes in the compiler (`expand-effect-macros.ts`) and preserved metadata through lowering (`compile-effects.ts`).
  - Threaded metadata through kernel trace builders/emission (`control-flow-trace.ts`, `effects-control.ts`).
  - Updated runner translation to consume structured metadata and removed heuristic macro-name extraction.
  - Updated schema sources (`schemas-ast.ts`, `schemas-core.ts`) and regenerated `packages/engine/schemas/Trace.schema.json`.
  - Added/updated unit tests for expansion, lowering, trace emission, runner rendering, and schema validation coverage.
- Deviations from original plan:
  - Intentionally removed heuristic parsing fallback behavior to align with strict architecture direction (no compatibility aliasing/backfill parsing).
  - Added explicit AST schema/type touch points not fully captured in original pre-correction plan.
- Verification results:
  - `pnpm turbo schema:artifacts` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
