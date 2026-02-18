# REACTUI-025: Choice Target Labeling and Generic Target Rendering

**Status**: ✅ COMPLETED
**Spec**: 35-00 (Frontend Implementation Roadmap), 39 (React DOM UI)
**Priority**: P2
**Depends on**: REACTUI-024
**Estimated complexity**: M

---

## Summary

Improve choice-option presentation so labels and rendering hints are derived generically from RenderModel data (`zone`, `token`, scalar), not from string formatting heuristics.

---

## Assumptions Reassessment (2026-02-18)

- `RenderModel` already uses a discriminated `choiceUi` contract from REACTUI-024; this ticket extends that contract and does not reintroduce parallel choice fields.
- Choice option labels are currently projected only through `formatChoiceValueFallback(...)` in `derive-render-model.ts`, with no structured target metadata per option.
- `ChoicePanel` already consumes projected `RenderChoiceOption.displayName`; the missing behavior is richer model-level resolution, not UI-side lookup logic.
- Engine `ChoicePendingRequest.targetKinds` currently supports only `zone | token` in `packages/engine/src/kernel/types-core.ts`; `player` target resolution is out of scope unless engine contracts change.
- Existing tests validate fallback formatting and discrete option rendering, but not entity-aware label resolution metadata.

These corrections replace stale assumptions in the original ticket text.

---

## What Needs to Change

- Extend choice render projection to include normalized, game-agnostic target metadata per option (`zone`/`token`/`scalar`) plus resolved label source.
- Use `targetKinds` and RenderModel entity projections to resolve display labels where possible:
  - zones -> `RenderZone.displayName`
  - tokens -> token label strategy (type/id/owner-derived generic formatter)
  - scalar fallback -> deterministic generic formatter
- Keep `ChoicePanel` rendering driven by projected option payload (no UI-side ID inference/lookup branches).
- Preserve strict agnostic engine rule: no game-specific identifiers or branches.

## Architecture Reassessment

- The proposed model-level resolution is stronger than the current fallback-only architecture because it centralizes semantics in one projection layer and keeps UI components dumb and deterministic.
- Per-option target metadata is an extensibility point for future generic affordances (icons/tooltips/highlight linkage) without introducing game-specific branches.
- No backward-compatibility aliases should be added; `choiceUi` remains the single source of truth.

---

## Out of Scope

- Game-specific theming or per-game UX customization (Spec 42).
- Canvas highlighting of selectable targets (Spec 38 interaction layer).

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - validates resolved labels for zone/token/scalar options.
  - validates projected target metadata and deterministic fallback when resolution target is missing.
- `packages/runner/test/model/render-model-types.test.ts`
  - validates updated `RenderChoiceOption` metadata contract.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - validates rendered option labels come from model-projected display payload.
- `packages/runner/test/utils/format-display-name.test.ts`
  - baseline formatter behavior remains intact for fallback paths.

### Invariants

- Choice option labeling is deterministic and game-agnostic.
- No UI dependence on game-specific IDs/strings.
- `targetKinds` influences generic rendering semantics without hardcoded game rules.
- Missing entity references degrade gracefully to safe fallback labels.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added structured `RenderChoiceOption.target` metadata (`kind`, `entityId`, `displaySource`) to the render-model contract.
  - Implemented model-level target-aware choice labeling in `deriveRenderModel()` using `targetKinds` plus projected zones/tokens.
  - Added generic token label resolution (`type` + `id` + optional owner display) with deterministic scalar fallback.
  - Kept `ChoicePanel` as a pure consumer of projected display payload (no UI-side target lookup).
  - Strengthened tests across model and UI type fixtures to enforce the new contract and zone/token/scalar resolution behavior.
- **Deviations from original plan**:
  - Removed `player` target resolution from scope because engine `ChoicePendingRequest.targetKinds` currently supports only `zone | token`.
  - Extended acceptance coverage to include `render-model-types` because this ticket changes the `RenderChoiceOption` contract shape.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
