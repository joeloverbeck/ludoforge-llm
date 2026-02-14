# FITLOPEFULEFF-026: Strict Profile Dispatch (No Action Fallback)

**Status**: Pending
**Priority**: P0
**Estimated effort**: Small-Medium (2-4 hours)
**Spec reference**: Spec 26 (faction-specific profile architecture), Agnostic Engine Rule
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-022

## Summary

Eliminate action-level fallback execution when an action has one or more `actionPipelines` but no applicable pipeline matches the current context.

Current behavior allows fallback to `actions[].effects` when no pipeline applies. That is an implicit compatibility shim and can silently execute wrong behavior.

Target behavior:
- If an action has no pipelines: execute `actions[].effects` as today.
- If an action has pipelines and one applies: execute that pipeline.
- If an action has pipelines and none apply: treat move as illegal (no fallback path).

## Files to Touch

- `src/kernel/apply-move.ts` — validation/application flow for pipelined actions
- `src/kernel/legal-moves.ts` — legal move emission for pipelined actions
- `src/kernel/legal-choices.ts` — choice resolution behavior for non-applicable profiled actions
- `test/unit/applicability-dispatch.test.ts` — update expectations to strict behavior
- `test/integration/fitl-insurgent-operations.test.ts` — replace fallback assertions with illegal/no-move assertions

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
