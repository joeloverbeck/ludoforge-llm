# CONCPAR-002: Conceal compiler parity with reveal

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler (compile-effects, binder-surface-contract, compiler tests)
**Deps**: CONCPAR-001

## Problem

The compiler's `lowerConcealEffect` only lowers `zone`, ignoring optional `from` and `filter`. This means specs that author selective conceal syntax (for example `conceal: { zone: "hand:0", from: { chosen: "$actor" }, filter: [...] }`) compile to blanket conceal and silently lose intent. Binder-surface metadata for conceal also misses binding-template reference tracking for `from.chosen`.

## Assumption Reassessment (2026-02-21)

1. **Compiler gap is real**: `packages/engine/src/cnl/compile-effects.ts` still returns conceal AST as `{ conceal: { zone } }` only.
2. **Mirror exists for reveal**: `lowerRevealEffect` already lowers selector + filter with generic lowering helpers (`lowerPlayerSelector`, `lowerTokenFilterArray`).
3. **Binder metadata gap is real**: `packages/engine/src/cnl/binder-surface-contract.ts` still has conceal `bindingTemplateReferencerPaths: NO_REFERENCER_PATHS`; reveal already tracks `[['to', 'chosen']]`.
4. **Validator assumption was stale**: `packages/engine/src/kernel/validate-gamedef-behavior.ts` already validates conceal `from` and `filter`. This work is complete and out of scope for this ticket.
5. **Tests assumption was stale**: `packages/engine/test/unit/validate-gamedef.test.ts` already has conceal `from` and `filter` diagnostics coverage.
6. **CONCPAR-001 dependency status**: Landed. AST types/schemas already include conceal `from?: 'all' | PlayerSel` and `filter?: TokenFilterPredicate[]`.

## Architecture Check

1. **Mirror pattern**: Making conceal lowering structurally mirror reveal reduces divergence and future defects.
2. **Game-agnostic**: The change stays in shared compiler primitives and binder-surface metadata; no game-specific branches.
3. **Strict architecture preference**: No aliasing or compatibility shim is required; we preserve zone-only behavior while correctly compiling selective fields when authored.
4. **Net architecture benefit**: High. It removes a lossy compile path and aligns contracts across compiler, binder analysis, and existing validator/schema/runtime type surfaces.

## What to Change

### 1. Rewrite lowerConcealEffect in compile-effects.ts

Mirror `lowerRevealEffect` structure:
- Lower `source.zone` (already done)
- If `source.from` is present and not `'all'`: call `lowerPlayerSelector`
- If `source.from === 'all'`: set `from = 'all'`
- If `source.filter` is present: validate it's an array, call `lowerTokenFilterArray`
- Return `{ conceal: { zone, ...(from !== undefined ? { from } : {}), ...(filter === undefined ? {} : { filter }) } }`

### 2. Update binder-surface-contract.ts conceal entry

Change `bindingTemplateReferencerPaths` from `NO_REFERENCER_PATHS` to `[['from', 'chosen']]` to match the reveal pattern (which uses `[['to', 'chosen']]`).

### 3. Extend conceal validation in validate-gamedef-behavior.ts

Already implemented; remove from scope for this ticket.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/binder-surface-contract.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify if needed for explicit conceal-path assertion)

## Out of Scope

- Type/schema changes (CONCPAR-001)
- Runtime selective conceal logic (CONCPAR-003)
- Trace emission (CONCPAR-004)
- New game spec YAML examples

## Acceptance Criteria

### Tests That Must Pass

1. Compiler test: conceal with `from: { chosen: "x" }` produces correct AST
2. Compiler test: conceal with `filter` array produces correct AST
3. Compiler test: conceal with `from: "all"` is preserved in AST
4. Compiler test: conceal with zone-only still compiles identically
5. Binder-surface test: conceal contract includes `from.chosen` template path
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Zone-only conceal specs compile identically to pre-change behavior
2. Binder surface contract for conceal includes `from.chosen` binding path
3. Selective conceal fields authored in YAML are not dropped during lowering

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — add conceal-with-from, conceal-with-from-all, conceal-with-filter, and zone-only-stability compilation assertions.
2. `packages/engine/test/unit/binder-surface-registry.test.ts` — add/extend assertion that conceal binding template referencer paths include `['from', 'chosen']`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "conceal"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-21
- **What changed**:
  - Implemented conceal compiler lowering parity in `packages/engine/src/cnl/compile-effects.ts` for optional `from` and `filter`.
  - Updated conceal binder surface contract in `packages/engine/src/cnl/binder-surface-contract.ts` to include `['from', 'chosen']`.
  - Added compiler coverage in `packages/engine/test/unit/compile-effects.test.ts` for conceal with `from`, `from: 'all'`, `filter`, and zone-only behavior.
  - Added explicit binder-surface parity assertion in `packages/engine/test/unit/binder-surface-registry.test.ts`.
- **Deviations from original plan**:
  - `validate-gamedef-behavior` changes were removed from scope because conceal `from/filter` validation was already implemented.
  - Validator tests were already present; no additional validator test changes were necessary.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "compile-effects lowering|binder-surface-registry|conceal"` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
