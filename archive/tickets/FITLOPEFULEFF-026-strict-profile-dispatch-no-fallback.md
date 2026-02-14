# FITLOPEFULEFF-026: Strict Profile Dispatch (No Action Fallback)

**Status**: ✅ COMPLETED
**Priority**: P0
**Estimated effort**: Small-Medium (2-4 hours)
**Spec reference**: Spec 26 (faction-specific profile architecture), Agnostic Engine Rule
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-022

## Summary

Eliminate action-level fallback execution when an action has one or more `actionPipelines` but no applicable pipeline matches the current context.

Current behavior still allows fallback to `actions[].effects` when no pipeline applies. This currently happens because dispatch resolution returns the same sentinel for both:
- no pipelines configured for an action, and
- pipelines configured but none applicable.

That ambiguity leaks into legality/choice/application paths and can silently execute wrong behavior.

Target behavior:
- If an action has no pipelines: execute `actions[].effects` as today.
- If an action has pipelines and one applies: execute that pipeline.
- If an action has pipelines and none apply: treat move as illegal (no fallback path).

## Files to Touch

- `src/kernel/apply-move-pipeline.ts` — dispatch API should explicitly represent "no profile configured" vs "configured but no match"
- `src/kernel/apply-move.ts` — enforce strict illegality when profiled action has no applicable profile
- `src/kernel/legal-moves.ts` — do not emit legal/template moves for profiled actions with no applicable profile
- `src/kernel/legal-choices.ts` — do not walk fallback effects for profiled actions with no applicable profile
- `test/unit/applicability-dispatch.test.ts` — convert fallback assertions to strict illegality expectations
- `test/unit/kernel/legal-moves.test.ts` — add/adjust no-applicable-profile legality assertions
- `test/unit/kernel/legal-choices.test.ts` — add/adjust no-applicable-profile choice behavior assertions
- `test/integration/fitl-insurgent-operations.test.ts` — replace fallback assertion with strict non-legality / apply failure assertion

## Out of Scope

- Adding new FITL operation content
- Turn-flow redesign
- Game-specific special casing in kernel

## Acceptance Criteria

### Tests That Must Pass
1. Pipelined action with no applicable profile is not legal and cannot execute.
2. No code path applies `actions[].effects` for actions that define `actionPipelines`.
3. Existing non-profiled actions continue to function unchanged.
4. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- No backward-compatibility alias paths introduced.
- No game-specific branches introduced in kernel.

## Architecture Notes

- Preferred fix is to make dispatch resolution explicit and typed, rather than layering extra checks in each caller.
- This keeps kernel behavior generic, makes invariants testable, and removes hidden fallback coupling between legality, choice resolution, and apply-time execution.

## Outcome

- **Completion date**: 2026-02-14
- **What was changed**
  - Added explicit dispatch result semantics in `src/kernel/apply-move-pipeline.ts` via `resolveActionPipelineDispatch` with `noneConfigured | configuredNoMatch | matched`.
  - Strengthened choice-resolution contract in `src/kernel/types-core.ts` / `src/kernel/legal-choices.ts`:
    - `legalChoices` now returns explicit `kind: 'illegal'` for non-dispatchable profiled actions instead of overloading completion.
    - `ChoiceRequest` now uses explicit `kind` states (`pending | complete | illegal`) while preserving `complete` for deterministic loop ergonomics.
  - Enforced strict no-fallback behavior in:
    - `src/kernel/legal-moves.ts` (no legal template move when profiled action has no applicable profile),
    - `src/kernel/legal-choices.ts` (no fallback effect walking when profiled action has no applicable profile),
    - `src/kernel/apply-move.ts` (illegal move when profiled action has no applicable profile, including skip-validation execution paths).
  - Updated and strengthened tests:
    - converted fallback expectations to illegality in `test/unit/applicability-dispatch.test.ts` and `test/integration/fitl-insurgent-operations.test.ts`,
    - expanded kernel coverage in `test/unit/kernel/apply-move-pipeline.test.ts`, `test/unit/kernel/legal-moves.test.ts`, and `test/unit/kernel/legal-choices.test.ts`.
  - Updated `test/integration/fitl-card-flow-determinism.test.ts` scenario assumptions to remove `attack` from scripted "always legal at start" actions (attack requires board targets), keeping determinism intent intact under strict dispatch.
- **Deviations from original plan**
  - Added one extra integration test adjustment (`fitl-card-flow-determinism`) because strict dispatch correctly surfaced a pre-existing fallback-dependent assumption not listed in initial ticket scope.
- **Verification**
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm test` passed.
  - `npm run lint` passed.
