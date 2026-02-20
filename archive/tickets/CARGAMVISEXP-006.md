# CARGAMVISEXP-006: Hand panel card visuals (MiniCard component)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-002 (card template schema support), Spec 43 D6

## Problem

`PlayerHandPanel.tsx` rendered all hand tokens as plain text (`token.type` + serialized properties), which made card-game hands hard to scan compared to table/canvas card visuals.

## Assumption Reassessment (2026-02-20)

1. `PlayerHandPanel.tsx` existed and rendered text-only token rows — confirmed.
2. `VisualConfigContext` was already provided by `GameContainer.tsx` around the UI tree — confirmed.
3. `VisualConfigProvider#getCardTemplateForTokenType()` exists and returns `CardTemplate | null` (not `undefined`) — confirmed.
4. Card template schema fields `sourceField`, `symbolMap`, `colorFromProp`, `colorMap` already existed and were already covered by renderer/config tests — confirmed.
5. `RenderToken` uses `faceUp: boolean` (not `faceDown`) — confirmed.
6. `MiniCard` component/tests were missing — confirmed.

## Scope (Corrected)

- No visual-config schema changes.
- Add hand-panel card rendering driven by existing card templates.
- Preserve text fallback for non-card tokens.
- Keep behavior game-agnostic and presentational.

## Architecture Decision

The change is beneficial over the previous architecture because it replaces hand-panel debug-like text for card tokens with template-driven rendering while preserving generic behavior.

To keep the architecture robust and extensible, card field value/color mapping logic was centralized in a shared pure resolver and reused by both:
1. Canvas card text rendering (`drawCardContent`)
2. UI MiniCard rendering

This prevents drift between Pixi and React card text semantics.

## Implemented Changes

1. Added shared card-field resolver:
   - `packages/runner/src/config/card-field-resolver.ts`
2. Refactored canvas card text rendering to use shared resolver:
   - `packages/runner/src/canvas/renderers/card-template-renderer.ts`
3. Added MiniCard component and styling:
   - `packages/runner/src/ui/MiniCard.tsx`
   - `packages/runner/src/ui/MiniCard.module.css`
4. Integrated template-aware MiniCard rendering into hand panel with text fallback:
   - `packages/runner/src/ui/PlayerHandPanel.tsx`
   - `packages/runner/src/ui/PlayerHandPanel.module.css`
5. Added/updated tests:
   - `packages/runner/test/config/card-field-resolver.test.ts`
   - `packages/runner/test/ui/MiniCard.test.ts`
   - `packages/runner/test/ui/PlayerHandPanel.test.ts`

## Invariants Maintained

1. Non-card tokens still render as text in the hand panel.
2. New MiniCard/resolver code is presentational-only.
3. No engine/kernel/compiler changes were made.

## Outcome

- **Completion date**: 2026-02-20
- **What changed vs original plan**:
  - Implemented the planned MiniCard integration and fallback behavior.
  - Added a shared resolver module (`src/config/card-field-resolver.ts`) to keep card-field mapping logic DRY and consistent across canvas + UI.
- **Deviations from original plan**:
  - Resolver location is `src/config/` (not `src/ui/`) to avoid UI/canvas dependency inversion.
  - Existing `card-template-renderer` tests did not need behavioral changes after refactor.
- **Verification results**:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner test` ✅
