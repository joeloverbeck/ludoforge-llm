# FITLOPEFULEFF-027: Applicability Evaluation Errors Are Fatal

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (1-3 hours)
**Spec reference**: Spec 26 profile applicability, compiler/runtime diagnostics discipline
**Depends on**: FITLOPEFULEFF-026

## Summary

Remove silent swallowing of applicability-evaluation failures during profile resolution.

Current resolver catches applicability evaluation errors and treats them as `false`, which can hide malformed profile predicates and make behavior non-obvious.

Target behavior:
- Applicability expression errors surface as explicit runtime/validation failures with actionable diagnostics.
- Profile resolution remains deterministic and transparent.

## Files to Touch

- `src/kernel/apply-move-pipeline.ts` — remove silent catch behavior
- `src/kernel/apply-move.ts` / `src/kernel/legal-choices.ts` — propagate/format failures consistently
- `test/unit/kernel/apply-move-pipeline.test.ts` — add malformed applicability failure coverage
- `test/unit/applicability-dispatch.test.ts` — assert error surfacing behavior

## Out of Scope

- Changing applicability DSL shape
- Game-specific validation logic

## Acceptance Criteria

### Tests That Must Pass
1. Invalid applicability expression does not silently resolve to non-match.
2. Error path includes profile ID/action ID context.
3. Valid applicability expressions continue to dispatch correctly.
4. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- No compatibility alias behavior for invalid applicability.
- Diagnostics are deterministic and testable.
