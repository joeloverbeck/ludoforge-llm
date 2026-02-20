# CARGAMVISEXP-001: Token type selector matching (fix gray circles)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (standalone)

## Problem

`getTokenTypeVisual()` in `visual-config-provider.ts` does exact key lookup on `config.tokenTypes[tokenTypeId]`. Texas Hold'em has 52 token types (`card-2S` through `card-AS`) but no individual `tokenTypes` entries, so the fallback is a gray circle. The fix is a `tokenTypeDefaults` array in the visual config schema that matches token IDs by `TokenTypeSelectors` (`ids` and/or `idPrefixes`).

## Assumption Reassessment (2026-02-20)

1. `TokenTypeSelectorsSchema` exists at `visual-config-types.ts:124-127` with `ids` and `idPrefixes` fields — confirmed.
2. `TokenTypeVisualStyleSchema` exists at `visual-config-types.ts:114-122` — confirmed.
3. `getTokenTypeVisual()` at `visual-config-provider.ts:108-118` does exact-key-only lookup — confirmed, no prefix fallback present.
4. `resolveTokenSymbols()` at `visual-config-provider.ts:124-147` does exact-key-only lookup — confirmed.
5. `getTokenTypeDisplayName()` at `visual-config-provider.ts:120-122` does exact-key-only lookup — confirmed.
6. `VisualConfigSchema` at `visual-config-types.ts:195-206` does not have `tokenTypeDefaults` — confirmed.
7. `data/games/texas-holdem/visual-config.yaml` has no `tokenTypes` section and no `tokenTypeDefaults` — confirmed.

### Discrepancies Corrected Before Implementation

1. Original change description used a prefix-only helper. Since `match` uses `TokenTypeSelectorsSchema`, implementation should use selector semantics (`ids` + `idPrefixes`) rather than a prefix-only path.
2. Scope now explicitly includes selector-based matching behavior tests so defaults are robust and reusable beyond prefix-only cases.

## Architecture Check

1. Selector-based matching is a generic visual config feature — any game can use `tokenTypeDefaults` with exact IDs and/or prefixes. No game-specific branching.
2. Exact match still takes priority over prefix defaults, so existing games with explicit `tokenTypes` entries are unaffected.
3. Reuses existing `TokenTypeSelectorsSchema` for the `match` field — no new matching concepts introduced.
4. No backwards-compatibility shims: the field is optional, old configs without it behave identically.

## What to Change

### 1. Add `TokenTypeDefaultSchema` and `tokenTypeDefaults` to schema

In `visual-config-types.ts`:
- Define `TokenTypeDefaultSchema = z.object({ match: TokenTypeSelectorsSchema, style: TokenTypeVisualStyleSchema })`
- Add `tokenTypeDefaults: z.array(TokenTypeDefaultSchema).optional()` to `VisualConfigSchema`

### 2. Add selector fallback to three provider methods

In `visual-config-provider.ts`:
- Extract a private helper `findTokenTypeDefault(tokenTypeId: string)` that iterates `config.tokenTypeDefaults` and returns the first entry whose `match` selectors match via existing selector semantics (`ids` and/or `idPrefixes`).
- In `getTokenTypeVisual()`: after exact-key miss, call `findTokenTypeDefault()` and return its `style` if found.
- In `resolveTokenSymbols()`: after exact-key miss, fall back to the matched default style symbols/symbolRules.
- In `getTokenTypeDisplayName()`: after exact-key miss, fall back to matched default style `displayName` if present.

### 3. Add `tokenTypeDefaults` to Texas Hold'em visual config

In `data/games/texas-holdem/visual-config.yaml`, add:
```yaml
tokenTypeDefaults:
  - match:
      idPrefixes: [card-]
    style:
      shape: card
      color: "#ffffff"
      backSymbol: diamond
```

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Card template rendering (color, symbols) — that's CARGAMVISEXP-002
- Zone layout changes — that's CARGAMVISEXP-003
- Table background or overlays — that's CARGAMVISEXP-004/005
- Hand panel UI changes — that's CARGAMVISEXP-006
- Engine/kernel changes of any kind
- FITL visual config changes
- Modifying `card-template-renderer.ts`

## Acceptance Criteria

### Tests That Must Pass

1. `visual-config-provider.test.ts` — new test: selector match by prefix returns card style for `card-2S` when `tokenTypeDefaults` has `idPrefixes: ['card-']`
2. `visual-config-provider.test.ts` — new test: selector match by exact ID works when default uses `ids`
3. `visual-config-provider.test.ts` — new test: exact `tokenTypes` entry takes priority over default selector (explicit `card-2S` entry overrides selector-matched default)
4. `visual-config-provider.test.ts` — new test: first matching selector default wins when multiple defaults match
5. `visual-config-provider.test.ts` — new test: returns global default (circle) when no exact match AND no selector match
6. `visual-config-provider.test.ts` — new test: `resolveTokenSymbols()` falls back to selector-matched default symbols/symbolRules
7. `visual-config-provider.test.ts` — new test: `getTokenTypeDisplayName()` falls back to selector-matched default displayName
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Exact-match `tokenTypes` entries always take priority over `tokenTypeDefaults` selector matches.
2. Games without `tokenTypeDefaults` in their visual config behave identically to before (no regressions).
3. The `VisualConfigSchema` remains backwards-compatible — `tokenTypeDefaults` is optional.
4. No engine/kernel/compiler code is modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts` — add describe block for selector-matched defaults: id/prefix matching, exact priority, first-match-wins, no-match fallback, resolveTokenSymbols fallback, getTokenTypeDisplayName fallback

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/config/visual-config-provider.test.ts`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- Actually changed:
  - Added `TokenTypeDefaultSchema` and optional `tokenTypeDefaults` to `VisualConfigSchema`.
  - Updated `VisualConfigProvider` to resolve token visuals, symbols, and display names via exact `tokenTypes` first, then selector-matched `tokenTypeDefaults`.
  - Added `tokenTypeDefaults` for Texas Hold'em card token IDs (`card-` prefix) to render card visuals instead of generic circles.
  - Added test coverage for selector matching by prefix and ID, precedence, first-match ordering, no-match fallback, symbol-rule fallback, and display-name fallback.
- Deviations from original plan:
  - Implemented full selector semantics (`ids` + `idPrefixes`) for defaults instead of a prefix-only helper to keep matching architecture consistent with `TokenTypeSelectors`.
- Verification:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose test/config/visual-config-provider.test.ts` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
