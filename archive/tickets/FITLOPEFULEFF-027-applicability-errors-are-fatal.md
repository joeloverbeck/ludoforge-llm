# FITLOPEFULEFF-027: Applicability Evaluation Errors Are Fatal

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (1-3 hours)
**Spec reference**: Spec 26 profile applicability, compiler/runtime diagnostics discipline
**Depends on**: FITLOPEFULEFF-026

## Summary

Remove silent swallowing of applicability-evaluation failures during profile resolution.

Current resolver catches applicability evaluation errors and treats them as `false`, which can hide malformed profile predicates and make behavior non-obvious.

Target behavior:
- Applicability expression errors surface as explicit failures with actionable diagnostics.
- Profile resolution remains deterministic and transparent.
- All entry points that resolve pipeline dispatch (`legalMoves`, `legalChoices`, `applyMove`) observe the same fatal behavior for malformed applicability.

## Reassessed Assumptions

- Verified: `src/kernel/apply-move-pipeline.ts` currently catches applicability evaluation exceptions and converts them to non-match (`configuredNoMatch`).
- Verified: Dispatch is used by `src/kernel/legal-moves.ts`, `src/kernel/legal-choices.ts`, and `src/kernel/apply-move.ts`.
- Correction: the primary behavior change belongs in the shared dispatch resolver; callsites mostly propagate that behavior automatically.
- Correction: test coverage should include dispatch resolver behavior and cross-entry-point surfacing (`legalMoves`, `legalChoices`, `applyMove`).

## Files to Touch

- `src/kernel/apply-move-pipeline.ts` — remove silent catch behavior and raise contextualized dispatch error.
- `test/unit/kernel/apply-move-pipeline.test.ts` — add malformed applicability failure coverage.
- `test/unit/applicability-dispatch.test.ts` — assert malformed applicability errors surface via `legalMoves`, `legalChoices`, and `applyMove`.

## Out of Scope

- Changing applicability DSL shape
- Game-specific validation logic
- Broader legality/costValidation error-handling policy outside applicability dispatch

## Acceptance Criteria

### Tests That Must Pass
1. Invalid applicability expression does not silently resolve to non-match.
2. Error path includes profile ID/action ID context.
3. `legalMoves`, `legalChoices`, and `applyMove` all surface malformed applicability errors.
4. Valid applicability expressions continue to dispatch correctly.
5. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- No compatibility alias behavior for invalid applicability.
- Diagnostics are deterministic and testable.

## Outcome

- Completion date: 2026-02-14
- What changed:
  - `resolveActionPipelineDispatch` now fails fast on applicability evaluation errors and throws a contextualized error including `actionId`, `profileId`, and deterministic reason metadata.
  - Added unit coverage for malformed applicability in resolver-level dispatch tests.
  - Added cross-entry-point coverage proving malformed applicability now surfaces through `legalMoves`, `legalChoices`, and `applyMove`.
- Deviations from original plan:
  - Scope was corrected to emphasize the shared resolver change plus cross-entry-point behavior checks; callsite edits in `apply-move`/`legal-choices` were unnecessary once dispatch emitted contextual fatal errors.
- Verification:
  - `npm run build`
  - `npm run typecheck`
  - `npm test`
  - `npm run lint`
