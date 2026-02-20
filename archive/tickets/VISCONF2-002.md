# VISCONF2-002: Remove Auto-Generated Labels and Add Symbol Icons

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Runner-only visual config contract change (`backSymbol` on token type visual style)
**Deps**: VISCONF2-001 (completed; archived at `archive/tickets/VISCONF2-001.md`)

## Problem

Token labels are currently auto-generated from token type IDs through `toTokenLabel()` in `packages/runner/src/canvas/renderers/token-renderer.ts`. This renders truncated text (`TRO`, `BAS`, `GUE`, etc.) over token faces. For FITL-style map pieces, token identity should be represented by shape+symbol graphics, not generated text.

The current implementation also uses `Text` nodes for token front/back identity labels (`frontLabel`, `backLabel`) in the token visual hierarchy. This creates font coupling for glyph-driven identity markers and is less robust than vector drawing at varied token sizes.

The visual config schema already supports `symbol` but does not support a separate face-down symbol (`backSymbol`).

## Assumption Reassessment (Code + Tests)

### Verified assumptions

1. `token-renderer.ts` still contains `toTokenLabel()`, `tokenLabel()`, and `tokenBackLabel()` and uses `Text` for front/back token identity.
2. `VisualConfigSchema` supports `tokenTypes.*.symbol` but not `backSymbol`.
3. FITL visual config already uses symbolic token identities (`symbol: star`) and does not require a `backSymbol` entry.

### Corrected assumptions

1. Dependency reference must point to archived completion:
   - `VISCONF2-001` is complete and archived, not an active ticket in `tickets/`.
2. Existing runner coverage is already extensive in `packages/runner/test/canvas/renderers/token-renderer.test.ts`, and many assertions currently depend on label `Text` nodes.
   - Action: refactor existing token renderer tests instead of adding a broad FITL integration harness for this change.
3. `TokenTypeVisualStyleSchema` is not directly exported.
   - Action: test `backSymbol` through `VisualConfigSchema` parsing and `VisualConfigProvider.getTokenTypeVisual()`.

## Architecture Decision

Proposed direction is better than the current architecture.

Reasons:
1. Moving token identity rendering to a dedicated symbol drawer module mirrors the existing token shape drawer pattern and keeps renderer orchestration focused on composition/lifecycle.
2. Replacing label text with graphics removes font-dependent behavior from token identity and improves visual determinism across environments.
3. Introducing `backSymbol` at the visual-config/provider layer cleanly separates front vs face-down semantics in a data-driven way without hardcoded game logic.

Non-goals:
1. No compatibility aliasing for old label behavior.
2. No game-specific symbol fallback rules in renderer code.

## Updated Scope

### 1. Remove token label text path from token renderer

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

- Remove `toTokenLabel()`, `tokenLabel()`, and `tokenBackLabel()`.
- Replace `frontLabel`/`backLabel` visual elements with `frontSymbol`/`backSymbol` `Graphics`.
- Keep `countBadge` as `Text` for stack count only.

### 2. Add dedicated token symbol drawer

**New file**: `packages/runner/src/canvas/renderers/token-symbol-drawer.ts`

- Export `drawTokenSymbol(graphics, symbolId, size, color?)`.
- Export symbol registry accessor for testability.
- Include symbol renderers for:
  - `star`
  - `diamond`
  - `cross`
  - `circle-dot`
- Treat empty/whitespace/`null`/`undefined` symbol as no-op.
- Draw centered at `(0, 0)` and scale by requested size.

### 3. Extend visual config contract with `backSymbol`

**Files**:
- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`

Changes:
- Add optional `backSymbol` to token type visual schema.
- Add `backSymbol: string | null` to `ResolvedTokenVisual`.
- Return resolved `backSymbol` in `getTokenTypeVisual()`.

### 4. Wire symbol drawing into token visual updates

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

Changes in visual updates:
- Face-up: draw `tokenVisual.symbol` on `frontSymbol`.
- Face-down: draw `tokenVisual.backSymbol` on `backSymbol`.
- If symbol is absent, draw no symbol (blank face symbol layer).

### 5. Test updates

**New test file**:
- `packages/runner/test/canvas/renderers/token-symbol-drawer.test.ts`

**Modified test files**:
- `packages/runner/test/canvas/renderers/token-renderer.test.ts`
- `packages/runner/test/config/visual-config-provider.test.ts`
- `packages/runner/test/config/visual-config-schema.test.ts`

## Invariants

1. Token visual hierarchy contains no identity-label `Text` nodes (`countBadge` remains allowed).
2. `toTokenLabel()` no longer exists in runner source.
3. Token symbol rendering uses `Graphics` operations only.
4. Missing `symbol` results in no front-face symbol.
5. Missing `backSymbol` results in no back-face symbol.
6. `backSymbol` is optional and does not break existing YAML parsing.
7. Symbol rendering remains proportional to token size.

## Verification

Run at minimum:
1. `pnpm -F @ludoforge/runner test -- token-symbol-drawer token-renderer visual-config-provider visual-config-schema`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-19
- What changed:
  - Added `packages/runner/src/canvas/renderers/token-symbol-drawer.ts` with a typed symbol registry and graphics-based symbol rendering for `star`, `diamond`, `cross`, and `circle-dot`.
  - Refactored `packages/runner/src/canvas/renderers/token-renderer.ts` to remove generated token labels and label text rendering, replacing them with `frontSymbol`/`backSymbol` graphics layers.
  - Added optional `backSymbol` to visual config schema and resolved token visuals in `packages/runner/src/config/visual-config-types.ts` and `packages/runner/src/config/visual-config-provider.ts`.
  - Added and updated runner tests to cover symbol drawing, renderer behavior, schema parsing, and provider resolution.
- Deviations from original plan:
  - Integration coverage was implemented by refactoring/extending existing renderer and config test suites instead of adding a FITL-specific integration test.
  - No FITL YAML changes were required because existing token type symbols already align with the new symbol registry.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- token-symbol-drawer token-renderer visual-config-provider visual-config-schema` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo lint` passed.
