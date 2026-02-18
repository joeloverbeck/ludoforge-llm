# REACTUI-027: Explicit Choice Input Contract (No UI Heuristics)

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI), 36 (Worker Bridge)
**Priority**: P1
**Depends on**: REACTUI-024
**Estimated complexity**: M

---

## Summary

Remove heuristic numeric/discrete inference in runner render-model derivation. Use the existing explicit, game-agnostic runtime contract (`ChoicePendingRequest.type`) as the single source of truth for `RenderChoiceUi` mapping.

---

## Assumption Reassessment (2026-02-18)

### Discrepancies Found

- The ticket assumed engine/runtime needed a new `inputKind` field. Current contract already exposes explicit input shape via `ChoicePendingRequest.type` (`chooseOne` vs `chooseN`) plus `min/max` and option legality metadata.
- Runner currently uses one heuristic branch (`options.length === 0`) to emit `choiceUi.kind: 'numeric'` for `chooseOne`. This is the actual architectural issue.
- Existing runner/UI tests already cover `numeric` as a UI variant, but those tests inject `RenderChoiceUi` directly and do not prove engine-to-render derivation for numeric.
- Engine legal-choice coverage exists primarily in `packages/engine/test/unit/kernel/legal-choices.test.ts` (not a broad `legal-choices-*` wildcard split by input mode).

### Updated Architectural Decision

- Do not add redundant `inputKind` to engine/runtime at this time.
- Make `deriveRenderModel()` mapping explicit and deterministic from current runtime contract:
  - `chooseOne` -> `discreteOne`
  - `chooseN` -> `discreteMany`
- Remove runner-side inference based on empty option arrays.
- Keep the `numeric` render variant as an existing UI type for future explicit runtime support (tracked separately), but stop deriving it heuristically from pending requests.

This yields cleaner architecture than the current heuristic path without introducing duplicate/disagreeing contract fields.

---

## What Needs to Change

- Update runner choice derivation to remove heuristic numeric-mode inference based on `options.length === 0`.
- Map pending choice requests deterministically from explicit runtime discriminator:
  - `chooseOne` -> `RenderChoiceUi.kind: 'discreteOne'`
  - `chooseN` -> `RenderChoiceUi.kind: 'discreteMany'`
- Keep `RenderChoiceUi` representation explicit/exhaustive; do not remove `numeric` type in this ticket.
- Update runner model/store tests that currently assume heuristic numeric fallback.

---

## Out of Scope

- Adding new engine/runtime choice contract fields (for example, `inputKind`) unless a later ticket introduces a true new runtime choice kind.
- Multi-select and numeric input component UX implementation (covered by REACTUI-008).
- Choice label enrichment (covered by REACTUI-025).

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - `choiceUi.kind` mapping is driven by explicit pending request `type`.
  - no heuristic fallback branch based on empty option arrays.
- `packages/runner/test/store/game-store.test.ts`
  - store->renderModel behavior remains deterministic with enriched pending requests.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - existing direct `RenderChoiceUi` numeric placeholder test remains valid (UI-only), independent of derivation.

---

## Invariants

- Choice UI derivation is explicit in runner mapping logic, not inferred from incidental shapes.
- Engine/runtime and runner mapping remain game-agnostic.
- No runner-side heuristic branch determines numeric vs discrete mode.
- Same input request always maps to same `choiceUi` variant.

---

## Outcome

- **Completed**: 2026-02-18
- **What changed**:
  - Removed runner heuristic that mapped `chooseOne` with empty options to `choiceUi.kind: 'numeric'`.
  - `deriveRenderModel()` now maps pending choices deterministically by `ChoicePendingRequest.type`:
    - `chooseOne` -> `discreteOne`
    - `chooseN` -> `discreteMany`
  - Added runner regression coverage to lock the no-heuristic mapping behavior.
- **Deviation from original plan**:
  - Original ticket proposed adding engine/runtime `inputKind` metadata.
  - After reassessment, this was unnecessary duplication of existing explicit runtime discriminator (`type`), so scope was corrected to a runner-only architectural fix.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` (pass)
  - `pnpm -F @ludoforge/runner lint` (pass)
  - `pnpm -F @ludoforge/runner typecheck` (pass)
