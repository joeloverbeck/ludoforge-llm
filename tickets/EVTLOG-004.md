# EVTLOG-004: Add structured macro origin metadata to effect trace entries

**Status**: PENDING
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

1. `EffectTraceEntry` for `forEach` has `bind: string` and for `reduce` has `resultBind: string` — these are the hygienic names.
2. `makeHygienicBindingName` (expand-effect-macros.ts:531-534) constructs the name as `$__macro_${sanitize(macroId)}_${sanitize(path)}_${sanitize(stem)}`.
3. The kernel passes these strings through unchanged in the trace.
4. The runner receives them in `EffectTraceEntry` and must parse them for display.
5. `EffectTraceEntry` is defined in the engine's runtime types and is part of the engine-runner contract.

## Architecture Check

1. Adding structured metadata to the trace entry is cleaner than heuristic parsing — it makes the contract explicit and keeps presentation logic out of the compiler's naming internals.
2. This change is game-agnostic: the `macroOrigin` field describes compiler infrastructure (macro expansion), not game-specific behavior. Any game using macros benefits.
3. No backwards-compatibility shims — the `macroOrigin` field is additive and optional. The runner checks for its presence and falls back to the existing heuristic for trace entries that lack it (e.g., traces from older compilations or non-macro bindings).

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

### 2. Populate `macroOrigin` in kernel trace emission

In `effects-control.ts`, when emitting `forEach` and `reduce` trace entries, check whether the bind name matches the `$__macro_` pattern and, if so, populate the `macroOrigin` field. Alternatively, thread the macro origin metadata from the compiled `EffectAST` node (the compiler already knows the macro ID and stem at expansion time — it could embed them in the AST).

The preferred approach is to embed origin in the AST during compilation:
- In `expand-effect-macros.ts`, when generating the hygienic name, also attach `{ macroId, stem }` to the forEach/reduce AST node.
- The kernel reads this from the AST and includes it in the trace entry.

### 3. Update `summarizeLifecycleBinding` in the runner

Check for `macroOrigin` first:
```typescript
if (entry.macroOrigin) {
  const variable = formatIdAsDisplayName(entry.macroOrigin.stem);
  const macro = formatIdAsDisplayName(entry.macroOrigin.macroId);
  return `${variable} in ${macro}`;
}
// fall back to existing heuristic
return summarizeLifecycleBinding(entry.bind);
```

### 4. Update JSON Schema for trace entries

If `packages/engine/schemas/` has a trace schema, add the optional `macroOrigin` object.

## Files to Touch

- `packages/engine/src/kernel/types.ts` or equivalent trace entry type file (modify — add `MacroOrigin`)
- `packages/engine/src/kernel/effects-control.ts` (modify — populate macroOrigin in trace emission)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify — embed origin in AST nodes)
- `packages/engine/src/cnl/compile-effects.ts` (modify — thread origin through compilation)
- `packages/runner/src/model/translate-effect-trace.ts` (modify — use structured origin when available)
- `packages/engine/schemas/trace.schema.json` (modify — if exists, add macroOrigin)

## Out of Scope

- Removing the heuristic fallback (keep it for backwards compatibility with traces that lack the field)
- Adding macro origin to other trace entry types (varChange, moveToken, etc.)
- Changing the hygienic naming convention itself

## Acceptance Criteria

### Tests That Must Pass

1. Engine unit test: `forEach` trace entry for a macro-expanded loop includes `macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' }`.
2. Engine unit test: `reduce` trace entry for a macro-expanded reduce includes `macroOrigin` with correct macroId and stem.
3. Engine unit test: non-macro `forEach` (direct in action effects) has `macroOrigin: undefined`.
4. Runner unit test: `translateEffectTrace` uses `macroOrigin` when present, producing the same display as the heuristic.
5. Runner unit test: `translateEffectTrace` falls back to heuristic when `macroOrigin` is absent.
6. Existing suites: `pnpm turbo test`

### Invariants

1. `macroOrigin.macroId` always matches the original kebab-case macro ID from the GameSpecDoc (not the sanitized form).
2. `macroOrigin.stem` always matches the original binding name (with `$` stripped).
3. The runner never crashes if `macroOrigin` is missing — graceful fallback to heuristic parsing.
4. No game-specific data in the `MacroOrigin` type — it describes compiler infrastructure only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effects-control.test.ts` (or equivalent) — Verify macroOrigin presence in forEach/reduce trace entries from macro-expanded effects.
2. `packages/engine/test/integration/cnl-to-trace.test.ts` (or equivalent) — Compile a spec with macros, run it, verify trace entries contain macroOrigin.
3. `packages/runner/test/model/translate-effect-trace.test.ts` — Add test case with `macroOrigin` field present on forEach/reduce entries, verify message matches expected format. Add test case without `macroOrigin`, verify heuristic fallback.

### Commands

1. `pnpm turbo test`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/runner test`
