# ENGINEARCH-002: Canonical Pending Choice Option Contract

**Status**: ✅ COMPLETED
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: None
**Estimated complexity**: M

---

## Summary

Remove dual-source pending choice option data (`options` + `optionLegality`) and replace it with one canonical option-entry structure to eliminate divergence risk between engine and runner.

Current-state reassessment:
- Engine currently emits `ChoicePendingRequest.options: MoveParamValue[]` and optionally `optionLegality`.
- Runner currently applies fallback behavior when `optionLegality` is missing by deriving `unknown` entries from `options`.
- Worker currently requests legality via `includeOptionLegality: true`, but the kernel type shape still permits dual-source divergence.
- Multiple engine and runner helpers/tests consume `pending.options` directly and must be migrated to canonical option entries.

---

## What Needs to Fix

- Refactor kernel pending-choice types so pending request `options` is a canonical option-entry list:
  - `value`
  - `legality`
  - `illegalReason` (nullable)
- Remove `optionLegality` from pending request types and payloads.
- Remove fallback paths in runner that assume missing legality implies legal.
- Replace legacy `includeOptionLegality` with `probeOptionLegality` and keep pending option legality metadata embedded in canonical `options[]` entries.
- Ensure non-UI legality surfaces can keep probe behavior explicit while runner/UI paths request probed legality.
- Update worker boundary contracts and clone-compat assumptions to match the canonical structure.
- Migrate all engine/runner choice-consumer helpers and tests from scalar `pending.options` assumptions to canonical option entries.
- Remove temporary compatibility paths and aliasing; fix all call sites directly.

---

## Invariants That Must Pass

- Pending-choice option legality has a single source of truth.
- Runner selectable/highlighted targets are derived from the same canonical option list rendered to users.
- Engine/runner boundary payloads remain structured-clone compatible.
- `ChoicePendingRequest.options` is always fully populated with legality metadata (no optional legality channel).
- No backward-compat aliases remain for legacy `options`-only choice payloads.

---

## Tests That Should Pass

- `packages/engine/test/unit/effects-choice.test.ts`
  - assert discovery pending choice emits canonical `options[]` entries with legality metadata.
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - assert legality probing writes into canonical `options[]` entries only.
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
  - update chooser/test helpers to select from canonical option entries (`option.value`).
- `packages/engine/test/helpers/*.ts` choice helpers
  - remove scalar `request.options` assumptions and use canonical option entries.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - assert rendered `currentChoiceOptions` map directly from canonical option entries without fallback.
- `packages/runner/test/model/derive-render-model-zones.test.ts`
  - assert selectability uses canonical legality state only.
- `packages/runner/test/store/game-store.test.ts`
  - update choice submission paths that currently read scalar values from `pending.options`.
- `packages/runner/test/store/store-types.test.ts`
  - assert store typing uses canonical pending option entry shape.
- `packages/runner/test/worker/clone-compat.test.ts`
  - assert updated pending-choice shape remains clone-safe.
- Existing suites remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

---

## Outcome

- Completion date: 2026-02-17
- What changed:
  - `ChoicePendingRequest.options` is now canonical option entries (`value`, `legality`, `illegalReason`) and `optionLegality` was removed.
  - Runner derivation/selectability now reads canonical entries directly with no fallback.
  - Worker boundary clone-contract tests and store/model tests were migrated to canonical entries.
  - Engine/runner helpers and decision utilities were migrated from scalar options to option-entry values.
  - `includeOptionLegality` was removed; `probeOptionLegality` now controls legality probing explicitly where needed.
- Deviations from original plan:
  - Legality probing was not made unconditional in all `legalChoices` calls; probing remains explicit to avoid non-UI regressions and to preserve deterministic, scalable decision sequencing outside UI-facing paths.
  - Discovery-time `effects-choice` pending options now default to `unknown` legality until explicitly probed.
- Verification:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`
