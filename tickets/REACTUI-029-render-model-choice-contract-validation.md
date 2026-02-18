# REACTUI-029: RenderModel Choice Contract Boundary Validation

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-024, REACTUI-028
**Estimated complexity**: S

---

## Summary

Introduce a runtime/dev validation boundary for RenderModel choice contract invariants so malformed projections fail fast and deterministically instead of leaking ambiguous UI behavior.

---

## What Needs to Change

- Add a runner-side RenderModel choice-contract validator module (for example: `packages/runner/src/model/validate-choice-ui-contract.ts`).
- Validate structural invariants for `choiceUi` projection (shape, required fields, bounds sanity, legal variant combinations).
- Integrate validator at render-model derivation boundary in development/test paths (or always-on with deterministic error mapping if preferred).
- Ensure validation failures map to stable, structured runner errors suitable for tests.
- Keep validator generic and independent of any specific game schema/content.

---

## Out of Scope

- Full RenderModel schema validation beyond choice contract.
- Engine-level GameDef validation changes (already covered by REACTUI-021).

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - valid contracts pass unchanged.
  - invalid contracts trigger deterministic validation failures/fallback.
- `packages/runner/test/model/choice-ui-contract-validation.test.ts` (new)
  - table-driven positive/negative cases for all `choiceUi` variants.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - invalid contract branch does not expose actionable controls.

---

## Invariants

- Choice contract violations are detected at a single boundary, not piecemeal in UI components.
- Validation behavior is deterministic and game-agnostic.
- Invalid projections cannot silently produce interactive ambiguity.
- Contract checks remain minimal and maintainable (no per-game rules).

