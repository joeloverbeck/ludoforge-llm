# ENGINEARCH-004: Choice Legality API Mode Split

**Status**: ✅ COMPLETED
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: ENGINEARCH-003
**Estimated complexity**: M

---

## Summary

Split pending-choice discovery and legality-evaluation into explicit engine entrypoints so callers cannot accidentally consume ambiguous legality semantics.

## Reassessed Baseline (2026-02-17)

- `probeOptionLegality` is currently still active in `packages/engine/src/kernel/legal-choices.ts` and used by runner worker in `packages/runner/src/worker/game-worker-api.ts`.
- Engine already has substantial legality-probing tests in `packages/engine/test/unit/kernel/legal-choices.test.ts` (deferred costValidation, chooseN probing, probe context reuse, overflow handling). Scope should migrate/retarget these tests to the new mode contract, not duplicate them.
- Runner render-model coverage already validates legality projection from `choicePending` in `packages/runner/test/model/derive-render-model-state.test.ts`; no behavior gap is known there, but this ticket should keep that assertion green as a regression guard.
- Public runtime exports are routed via `@ludoforge/engine/runtime` (`packages/engine/src/kernel/runtime.ts`), so type-surface changes must stay aligned there.

---

## What Needed to Change

- Replace boolean `probeOptionLegality` with explicit legality entrypoints in kernel API:
  - `legalChoicesDiscover(...)`
  - `legalChoicesEvaluate(...)`
- Remove ambiguous mode flags and defaults from public legal-choices API.
- Keep worker/runner paths on evaluated legality entrypoint; keep internal move-enumeration/probing paths on discovery entrypoint where appropriate.
- Update engine public types/docs so legality semantics are unambiguous for pending options.
- Remove deprecated/temporary aliases; no backward compatibility shims.

---

## Invariants That Should Pass

- Callers can deterministically choose between discovery and evaluated legality behavior via explicit entrypoint.
- Runner/UI paths always receive legality-enriched canonical options suitable for selection/highlighting.
- Discovery-mode callers do not pay unnecessary probe costs.
- No engine call site depends on implicit legality probing defaults or optional mode flags.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - migrate existing `probeOptionLegality` test cases to explicit entrypoint usage.
  - add/retain explicit behavior checks for `legalChoicesDiscover` vs `legalChoicesEvaluate`.
- `packages/runner/test/worker/game-worker.test.ts`
  - assert worker legal-choices path always uses evaluated legality entrypoint.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - keep legality projection assertions green to guard UI-contract continuity.
- Existing quality gates remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

---

## Outcome

- Completion date: 2026-02-17
- Actual changes:
  - Replaced `probeOptionLegality` with explicit kernel entrypoints `legalChoicesDiscover` and `legalChoicesEvaluate` in `packages/engine/src/kernel/legal-choices.ts`.
  - Removed legacy mode-flag API surface (`optionLegality` / `LegalChoicesOptions`) and retained only callback runtime options for internal budget/deferred instrumentation.
  - Updated runner worker path to call `legalChoicesEvaluate` directly and simplified worker API to `legalChoices(partialMove: Move)` in `packages/runner/src/worker/game-worker-api.ts`.
  - Migrated engine call sites/tests to `legalChoicesDiscover` (internal flows) and `legalChoicesEvaluate` (explicit evaluated legality assertions) across engine unit/integration suites.
  - Added runner worker regression coverage proving evaluated mode semantics in `packages/runner/test/worker/game-worker.test.ts`.
- Deviations from original plan:
  - Architecture moved one step beyond mode flags to split entrypoints entirely; this intentionally removed ambiguity by construction.
  - `derive-render-model-state` tests did not require new assertions because legality projection coverage already existed and remained green; scope kept as regression verification instead of duplicate test additions.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
