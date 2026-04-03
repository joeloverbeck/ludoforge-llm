# 65INTINTDOM-001: InternTable type, GameDef field, and compiler generation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — types-core.ts (InternTable type, GameDef field), compiler-core.ts (intern table generation), GameDef.schema.json
**Deps**: `specs/65-integer-interned-domain-ids.md`

## Problem

The kernel uses branded string IDs for all domain identifiers. To migrate to integer-interned IDs, the foundational infrastructure must exist first: an `InternTable` type that maps integer indices to canonical string names, a `GameDef.internTable` field that stores the compiled mapping, and compiler logic that assigns sequential indices during compilation.

## Assumption Reassessment (2026-04-03)

1. `GameDef` is defined in `packages/engine/src/kernel/types-core.ts` (~line 745-774). No `internTable` field exists — confirmed via reassessment.
2. `compiler-core.ts` is the actual compiler implementation (`compiler.ts` is a 10-line re-export). 89 sub-modules in `packages/engine/src/cnl/`.
3. `GameDef.schema.json` exists at `packages/engine/schemas/GameDef.schema.json` — will need `internTable` property added.
4. `PlayerId` is already `Brand<number, 'PlayerId'>` in `branded.ts:3` — the intern table must include a `players` field for I/O boundary conversion.

## Architecture Check

1. `InternTable` is pure static data generated at compile time — no runtime code generation, no eval, no callbacks. Aligns with Foundation 7 (Specs Are Data).
2. The intern table lives in `GameDef` (compiled artifact), not in `GameSpecDoc` (YAML). Game specs continue to use string IDs. The compiler maps strings to integers during compilation. Aligns with Foundation 2 (Evolution-First) — evolution mutates YAML only.
3. No backwards-compatibility shims. The `InternTable` is additive infrastructure — existing code continues to work until subsequent tickets migrate ID types.

## What to Change

### 1. Define `InternTable` interface in `types-core.ts`

Add the `InternTable` interface:

```typescript
interface InternTable {
  readonly zones: readonly string[];      // index → canonical string
  readonly actions: readonly string[];
  readonly tokenTypes: readonly string[];
  readonly seats: readonly string[];
  readonly players: readonly string[];    // PlayerId already number — for I/O
  readonly phases: readonly string[];
  readonly globalVars: readonly string[];
  readonly perPlayerVars: readonly string[];
  readonly zoneVars: readonly string[];
}
```

Add `internTable: InternTable` to the `GameDef` interface.

### 2. Implement intern table generation in `compiler-core.ts`

During compilation, collect all unique domain IDs encountered and assign sequential 0-based indices. The intern table arrays must be deterministic — sorted alphabetically by canonical string name so that the same GameSpecDoc always produces the same index assignments regardless of parse order.

### 3. Update `GameDef.schema.json`

Add `internTable` as a required property with the appropriate JSON Schema definition (object with string array properties for each domain).

### 4. Add roundtrip test infrastructure

Create `intern`/`extern` helper functions (not yet integrated — just defined and tested in isolation). These will be used by ticket 004 for serialization boundaries.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — `InternTable` interface, `GameDef.internTable` field
- `packages/engine/src/cnl/compiler-core.ts` (modify) — intern table generation during compilation
- `packages/engine/schemas/GameDef.schema.json` (modify) — add `internTable` schema
- `packages/engine/src/kernel/intern.ts` (new) — `intern*`/`extern*` helper functions
- `packages/engine/test/unit/kernel/intern.test.ts` (new) — roundtrip tests

## Out of Scope

- Changing any branded ID type from string to number (ticket 002)
- Changing `GameState.zones` storage (ticket 003)
- Integrating intern/extern at serialization boundaries (ticket 004)
- Runner changes (ticket 005)
- Variable name interning implementation (ticket 009)

## Acceptance Criteria

### Tests That Must Pass

1. `intern(extern(id, table), table) === id` roundtrip for all domain ID types
2. Compiling the same GameSpecDoc twice produces identical `internTable` (determinism)
3. FITL and Texas Hold'em specs compile successfully with `internTable` populated
4. Existing suite: `pnpm turbo test`

### Invariants

1. Intern table indices are contiguous 0-based (0..N-1, no gaps) for each domain
2. Intern table arrays are sorted alphabetically by canonical string name (deterministic assignment)
3. `GameDef` remains serializable — `InternTable` is pure data (string arrays), no functions or closures

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/intern.test.ts` — roundtrip tests for all domain ID types, edge cases (empty table, single entry, duplicate strings)
2. `packages/engine/test/unit/cnl/compiler-intern-table.test.ts` — verify intern table generation from compiled FITL and Texas Hold'em specs

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test`

## Outcome

- Completed: 2026-04-04
- Added `InternTable`, compiler generation, schema support, raw string/index `intern*` and `extern*` codecs, and fixture/golden/test coverage for the new compiled field.
- Deviation from original plan: compiled artifacts and `GameDef` schema now require `internTable`, but the TypeScript `GameDef` field remains temporarily optional by confirmed design decision so handwritten in-memory fixtures outside the compiler-owned artifact path did not need a repo-wide migration in this ticket.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
