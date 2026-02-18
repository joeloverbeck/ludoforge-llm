# REACTUI-027: Explicit Choice Input Contract (No UI Heuristics)

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI), 36 (Worker Bridge)
**Priority**: P1
**Depends on**: REACTUI-024
**Estimated complexity**: M

---

## Summary

Remove heuristic numeric/discrete inference in runner render-model derivation. Expose an explicit, game-agnostic choice input contract from engine/runtime choice requests and map it directly to `RenderChoiceUi`.

---

## What Needs to Change

- Extend engine/runtime `ChoicePendingRequest` with explicit input-mode metadata (for example: `inputKind: 'discrete' | 'numericRange'`), keeping the contract game-agnostic.
- Populate this metadata in legal-choice discovery paths without introducing game-specific branches.
- Update runner choice derivation to use explicit metadata only:
  - remove numeric-mode inference based on `options.length === 0`.
  - map `inputKind` to `RenderChoiceUi` deterministically.
- Keep `RenderChoiceUi` representation explicit and exhaustive.
- Update fixtures/stubs in runner and engine tests to include the new metadata where required.

---

## Out of Scope

- Multi-select and numeric input component UX implementation (covered by REACTUI-008).
- Choice label enrichment (covered by REACTUI-025).

---

## Tests that Should Pass

- `packages/engine/test/unit/kernel/legal-choices-*.test.ts` (existing relevant legal-choice tests)
  - pending requests include explicit input metadata for both discrete and numeric flows.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - `choiceUi.kind` mapping is driven by explicit request metadata.
  - no heuristic fallback branch based on empty option arrays.
- `packages/runner/test/store/game-store.test.ts`
  - store->renderModel behavior remains deterministic with enriched pending requests.

---

## Invariants

- Choice input mode is explicit in runtime contract, not inferred from incidental shapes.
- Engine/runtime and runner mapping remain game-agnostic.
- No runner-side heuristic branch determines numeric vs discrete mode.
- Same input request always maps to same `choiceUi` variant.

