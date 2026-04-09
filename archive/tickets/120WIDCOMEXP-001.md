# 120WIDCOMEXP-001: Widen value expr compiler — simple references

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/condition-compiler.ts`
**Deps**: None

## Problem

`tryCompileValueExpr` currently handles only `gvar`, `pvar(active)`, `binding`, and `aggregate count(tokensInZone)`. Five additional reference types (`zoneCount`, `zoneVar`, `tokenProp`, `pvar` with literal `{ id: PlayerId }` selector, scalar array literal) return `null`, forcing all conditions that use them to fall back to the interpreter. These are high-frequency reference types in FITL — compiling them unlocks significant downstream compilation in condition and token filter compilers.

## Assumption Reassessment (2026-04-09)

1. `tryCompileValueExpr` is in `packages/engine/src/kernel/condition-compiler.ts` at line 192 — confirmed.
2. `compileReferenceAccessor` (line 49) handles `gvar`, `pvar` (active-only guard at line 72), `binding` — confirmed. Returns `null` at default (line 128) for all other ref types.
3. AST tags confirmed: `_t: 1` = scalar array, `_t: 2` = references. Reference variants `zoneCount`, `zoneVar`, `tokenProp` exist in `types-ast.ts`.
4. `tryStaticScopedVarNameExpr` is used by existing `gvar`/`pvar` cases — reuse for `zoneVar`.
5. Compiled predicate signature `(state, activePlayer, bindings, snapshot?) → ScalarValue | ScalarArrayValue` is established.

## Architecture Check

1. Extends existing `compileReferenceAccessor` switch — no new modules, no new patterns. Each case is a self-contained accessor closure.
2. All new accessors read from `GameState` (zone tokens, zone vars, per-player vars) or bindings — no game-specific logic.
3. No backwards-compatibility shims. New cases return compiled accessors; unsupported variants continue to return `null`.

## What to Change

### 1. Add `zoneCount` case to `compileReferenceAccessor`

In `condition-compiler.ts`, add a `case 'zoneCount'` for the live typed `ZoneSel` string shape, returning an accessor that reads `state.zones[zoneId].length` (or `snapshot.zoneTotals.get(zoneId)` when snapshot is present). Reuse the existing `compileZoneCountAccessor` helper if its signature matches, or delegate to it directly.

### 2. Add `zoneVar` case to `compileReferenceAccessor`

Add `case 'zoneVar'` that checks `typeof expr.zone === 'string'` and `tryStaticScopedVarNameExpr(expr.var) !== null`, then returns an accessor that reads `state.zoneVars[zoneId][varName]`. Return `null` for dynamic zone selectors or dynamic var names.

### 3. Add `tokenProp` case to `compileReferenceAccessor`

Add `case 'tokenProp'` that resolves the token via binding lookup and reads the property from the token. The token selector (`expr.token`) must resolve to a binding name. Return `null` for complex token selectors.

### 4. Extend `pvar` case for literal player id selectors

Currently guarded by `if (expr.player !== 'active') return null`. Extend to also accept `expr.player` with a literal `{ id: PlayerId }` selector. Complex `PlayerSel` variants (`actor`, `relative`, `all`, `allOther`, `chosen`) continue to return `null`.

### 5. Add scalar array literal case to `tryCompileValueExpr`

In the main `tryCompileValueExpr` function, add `case 1` (before `case 2`) for `_t: 1` scalar array literals. Return a constant accessor: `() => expr.scalarArray`.

### 6. Parity tests

For each new case, write parity tests that:
- Construct the AST node
- Evaluate via `resolveRef` (interpreter path)
- Evaluate via the compiled accessor
- Assert identical results
- Cover typical values, boundary values (missing zone, missing var), and error cases

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify — add parity tests)

## Out of Scope

- `zoneProp` with dynamic zone reference — deferred per spec
- Dynamic variable names (`VarNameExpr` with binding interpolation) — deferred per spec
- `aggregate sum/min/max` — deferred per spec
- Condition compiler changes (ticket 003)
- Application site integration (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. Parity test: `zoneCount` with static zone ID — compiled accessor matches `resolveRef` output
2. Parity test: `zoneVar` with static zone + static var — compiled accessor matches `resolveRef` output
3. Parity test: `tokenProp` with binding-resolvable token — compiled accessor matches `resolveRef` output
4. Parity test: `pvar` with literal `{ id: PlayerId }` selector — compiled accessor matches `resolveRef` output
5. Parity test: scalar array literal — compiled accessor returns the constant array
6. Null-return test: `zoneVar` with dynamic var name returns `null`
7. Null-return test: `pvar` with `relative(...)` player selector returns `null`
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `tryCompileValueExpr` returns `null` for any node type it cannot fully compile — no partial compilation
2. Compiled accessors never mutate `state`, `bindings`, or `snapshot` (Foundation 11)
3. Compiled accessor results are identical to interpreter results for all inputs (Foundation 8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — parity tests for 5 new node types + null-return tests for unsupported variants

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="condition-compiler"`
2. `pnpm turbo test`

## Outcome

- Completion date: 2026-04-09
- What actually changed: [packages/engine/src/kernel/condition-compiler.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/condition-compiler.ts) now compiles scalar array literals plus `zoneCount`, `zoneVar`, `tokenProp`, and fixed-player `{ id: PlayerId }` `pvar` references; [packages/engine/test/unit/kernel/condition-compiler.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/condition-compiler.test.ts) now covers parity, snapshot-backed reads, and error/null behavior for those cases.
- Deviations from original plan: the ticket was corrected to match the live typed runtime surface. `pvar` concrete-player compilation uses literal `{ id: PlayerId }` selectors rather than raw seat strings, and the stale `zoneCount` dynamic-selector null-return acceptance case was removed because the live `ZoneSel` shape is already a string at this layer. The stale focused test command was also substituted with the repo-valid built-test command for Node's test runner.
- Verification results: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js`, `pnpm -F @ludoforge/engine test`, and `pnpm turbo test` all passed.
