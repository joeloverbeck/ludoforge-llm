# STATEMOD-014: Replace Runner DecisionId Heuristics with Engine-Provided Choice Target Metadata

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: None

## Objective

Eliminate brittle `decisionId`-based target inference in runner render-model derivation by making pending choice target metadata an explicit engine contract.

## Assumption Reassessment (Current Code)

- `packages/runner/src/model/derive-render-model.ts` still derives selection target kinds by parsing `decisionId` and mapping it back to `selectedAction` param domains (`deriveDecisionNameCandidates` + `resolveChoiceTargetKinds` + `deriveTargetKindsFromDomain`).
- Engine `ChoicePendingRequest` currently does **not** expose canonical target metadata (`packages/engine/src/kernel/types-core.ts`), so runner cannot consume authoritative target semantics.
- Worker boundary is a typed pass-through (`packages/runner/src/worker/game-worker-api.ts` calling engine APIs directly). There is no separate custom serializer to update beyond type compatibility + clone-compat tests.

## What Needed to Change / Be Added

1. Extend engine pending choice contract (`ChoicePendingRequest`) with canonical target metadata (`targetKinds`) produced by the legality discovery path.
2. Populate that metadata in engine choice producers (`chooseOne` / `chooseN`) from authoritative query semantics, not from IDs or game-specific logic.
3. Update runner render-model selection targeting to consume pending-choice metadata directly; remove `decisionId` parsing and action-param/domain lookup path for this purpose.
4. Remove dead heuristic helpers in runner that only existed for `decisionId` parsing.
5. Keep behavior game-agnostic and generic: no game-specific branches, no aliasing/fallback heuristics based on ID formatting.

## Invariants

- Runner selection-target derivation does not parse `decisionId` strings for semantics.
- Selection targeting is driven by engine-provided metadata on pending choices.
- Internal `decisionId` formatting changes in compiler/kernel do not require runner changes.
- No game-specific logic is introduced in runner, worker, or engine legality flow.

## Verification

- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/runner test`
- `pnpm -F @ludoforge/runner lint`
- `pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added canonical target metadata contract: `ChoicePendingRequest.targetKinds` and `ChoiceTargetKind` in engine types.
  - Added engine-side target-kind derivation (`packages/engine/src/kernel/choice-target-kinds.ts`) and wired it into `chooseOne` / `chooseN` pending responses.
  - Replaced runner selection-target inference with direct `choicePending.targetKinds` consumption; removed `decisionId` parsing and domain-lookup heuristics from `derive-render-model.ts`.
  - Updated runner and engine tests to validate the new contract and decision-id-format independence.
- **Deviations from original plan**:
  - None functionally. The worker boundary remained a typed pass-through; no dedicated serializer refactor was required.
- **Verification results**:
  - All required engine/runner tests and runner lint/typecheck passed.
