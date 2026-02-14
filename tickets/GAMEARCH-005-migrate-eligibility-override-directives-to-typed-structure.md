# GAMEARCH-005: Migrate Eligibility Override Directives to Typed Structure

**Status**: TODO
**Priority**: P2
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: GAMEARCH-004

## Description

Eligibility overrides still rely on string-encoded directive tokens in move params. This is inconsistent with schema-first architecture and retains hidden DSL aliasing.

### What Must Change

1. Replace string token parsing (`eligibilityOverride:*`) with typed declarative structures in `GameSpecDoc`/`GameDef` for event- or action-emitted eligibility windows.
2. Remove legacy token parsing path from runtime.
3. Extend schema/compiler/validator to support typed override declarations.
4. Update tests and fixtures to typed model only (no backwards compatibility).

## Files to Touch

- `src/kernel/types-turn-flow.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/schemas-extensions.ts`
- `src/cnl/game-spec-doc.ts`
- `src/cnl/compile-turn-flow.ts` and/or event compilation paths
- `src/cnl/validate-extensions.ts`
- `src/cnl/cross-validate.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- related helper tests currently emitting token strings

## Out of Scope

- Non-eligibility turn-flow mechanics.

## Acceptance Criteria

### Tests That Must Pass

1. Integration tests for eligibility windows use typed declarations only.
2. No test uses `eligibilityOverride:*` string directives.
3. Runtime behavior matches current semantics for equivalent typed data.
4. `npm run build` passes.
5. `npm test` passes.
6. `npm run lint` passes.

### Invariants That Must Remain True

- Turn-flow control data is explicit and strongly typed.
- No hidden string DSL in runtime-critical paths.
- Game-specific behavior remains entirely in `GameSpecDoc` data.
