# CARGAMVISEXP-006: Hand panel card visuals (MiniCard component)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-002 (card template schema with symbolMap/colorMap must exist for MiniCard to use)

## Problem

`PlayerHandPanel.tsx` shows tokens as plain text like `card-JH\nrank: 11, rankName: Jack, suit: 1, suitName: Hearts`. For card games, the hand panel should render visual mini cards with rank, suit symbol, and suit color — matching the canvas card appearance.

## Assumption Reassessment (2026-02-20)

1. `PlayerHandPanel.tsx` exists and renders raw text for all tokens — confirmed. Does not use `VisualConfigContext`.
2. `VisualConfigContext` is provided in `GameContainer.tsx` wrapping the UI layer — needs verification (check that the context is available to `PlayerHandPanel`).
3. `getCardTemplateForTokenType()` exists at `visual-config-provider.ts:153-162` — confirmed. Returns a card template or undefined.
4. `PlayerHandPanel.test.ts` exists — confirmed, needs updating.
5. `MiniCard.tsx` and `MiniCard.module.css` do NOT exist — confirmed, need to be created.
6. Card template schema after CARGAMVISEXP-002 will have `symbolMap`, `colorMap`, `colorFromProp`, `sourceField` fields.

## Architecture Check

1. `MiniCard` is a generic React component: it reads a `RenderToken` and an optional `CardTemplate` — any card game can use it, not poker-specific.
2. Graceful degradation: if `getCardTemplateForTokenType()` returns undefined (non-card tokens), the hand panel keeps existing text rendering.
3. The component reads token properties and template config — no game logic, purely presentational.
4. CSS modules scope styles to the component, no global style leakage.

## What to Change

### 1. Create `MiniCard.tsx`

New file in `packages/runner/src/ui/`. Props: `{ token: RenderToken, template?: CardTemplate }`.
- **Face-up rendering**: rank in top-left and bottom-right corners, suit symbol centered, colors from template's `colorMap`/`symbolMap`
- **Face-down rendering**: dark card back with pattern (when token is hidden/face-down — check `token.faceDown` or similar render model property)
- Size: 36x52px, rounded corners

### 2. Create `MiniCard.module.css`

Card styling: 36x52px dimensions, rounded corners, card-back pattern, face-up layout with rank/suit positioning.

### 3. Modify `PlayerHandPanel.tsx`

- Import `useContext` (or equivalent) to access `VisualConfigContext`
- For each token in the hand:
  - Call `provider.getCardTemplateForTokenType(token.type)`
  - If template exists: render `<MiniCard token={token} template={template} />`
  - If no template: keep existing text fallback

### 4. Create `MiniCard.test.ts`

Tests for the MiniCard component.

### 5. Update `PlayerHandPanel.test.ts`

Add tests for MiniCard rendering when card template is available, and text fallback when not.

## Files to Touch

- `packages/runner/src/ui/MiniCard.tsx` (new)
- `packages/runner/src/ui/MiniCard.module.css` (new)
- `packages/runner/src/ui/PlayerHandPanel.tsx` (modify)
- `packages/runner/test/ui/MiniCard.test.ts` (new)
- `packages/runner/test/ui/PlayerHandPanel.test.ts` (modify)

## Out of Scope

- Token type prefix matching — that's CARGAMVISEXP-001
- Card template schema changes (symbolMap, colorMap) — that's CARGAMVISEXP-002
- Zone layout or table positioning — that's CARGAMVISEXP-003
- Table background — that's CARGAMVISEXP-004
- Table overlays — that's CARGAMVISEXP-005
- Canvas-level card rendering (PixiJS) — the canvas card renderer is separate from this DOM component
- Engine/kernel changes of any kind
- FITL hand panel behavior (FITL doesn't use card templates, so text fallback applies)

## Acceptance Criteria

### Tests That Must Pass

1. `MiniCard.test.ts` — new test: renders rank text from token properties using template sourceField
2. `MiniCard.test.ts` — new test: renders suit symbol using template symbolMap
3. `MiniCard.test.ts` — new test: applies suit color using template colorMap
4. `MiniCard.test.ts` — new test: renders card-back when token is face-down
5. `MiniCard.test.ts` — new test: renders with default styling when optional template fields are missing
6. `PlayerHandPanel.test.ts` — new test: renders MiniCard when card template is available for token type
7. `PlayerHandPanel.test.ts` — new test: renders text fallback when no card template exists for token type
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Non-card tokens (e.g., FITL guerrillas, troops) continue to render as text in the hand panel.
2. `MiniCard` is purely presentational — no game state mutations or side effects.
3. The component respects the existing `VisualConfigContext` provider — no new context creation.
4. No engine/kernel/compiler code is modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/MiniCard.test.ts` (new) — face-up rendering, suit symbol, color, face-down, defaults
2. `packages/runner/test/ui/PlayerHandPanel.test.ts` — MiniCard integration, text fallback

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/ui/MiniCard.test.ts test/ui/PlayerHandPanel.test.ts`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`
