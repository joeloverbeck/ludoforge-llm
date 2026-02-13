# ARCDECANDGEN-018: Merge terminal semantics into `GameDef.terminal`

**Status**: ✅ COMPLETED
**Phase**: 6A (Unified Terminal Evaluation)
**Priority**: P1
**Complexity**: L
**Dependencies**: ARCDECANDGEN-001, ARCDECANDGEN-002, ARCDECANDGEN-005, ARCDECANDGEN-006
**Reference**: `specs/32-architecture-decomposition-and-generalization.md` (Phase 6A)

## Goal (Corrected)

Replace the three top-level terminal-related fields on `GameDef` (`endConditions`, `victory`, `scoring`) with one unified field:

```typescript
interface TerminalEvaluationDef {
  readonly conditions: readonly EndCondition[];
  readonly checkpoints?: readonly VictoryCheckpointDef[];
  readonly margins?: readonly VictoryMarginDef[];
  readonly ranking?: VictoryRankingDef;
  readonly scoring?: ScoringDef;
}

interface GameDef {
  readonly terminal: TerminalEvaluationDef;
}
```

## Reassessed Assumptions vs Current Code

1. `GameDef` is still split across top-level `endConditions`/`victory`/`scoring`.
- Confirmed in `src/kernel/types-core.ts`.

2. Runtime terminal evaluation is still split.
- Confirmed in `src/kernel/terminal.ts` (`evaluateVictory` first, then `endConditions`; scoring is executed only when a matching condition has `result.type: 'score'`).

3. `GameSpecDoc` does **not** currently have a `scoring` section.
- Confirmed in `src/cnl/game-spec-doc.ts`.
- Original ticket assumption "keep separate YAML sections `endConditions`, `victory`, `scoring`" was inaccurate.

4. Existing compiler section model is already structured and currently stores `victory` + `endConditions` separately.
- Confirmed in `src/cnl/compiler-core.ts` (`CompileSectionResults`).
- Scope must include converting compile section outputs to `terminal`, not introducing structured sections from scratch.

5. Type naming in current code is `EndCondition` (not `EndConditionDef`).
- Ticket updated to match real type names.

## Architecture Reassessment

Is the proposed unified terminal model better than the current architecture? **Yes**.

Benefits over current split fields:
- Removes one more "optional extension bucket" pattern from `GameDef` top-level.
- Encapsulates all terminal semantics in one data contract, improving discoverability and reducing validation/schema drift.
- Simplifies compiler and cross-validation contracts (`sections.terminal` instead of parallel `sections.victory` + `sections.endConditions` + implicit scoring behavior).
- Aligns with Spec 32 principles: composition, cleaner boundaries, and explicit subsystem ownership.

Critical correction to original proposal:
- "Scoring fallback when no condition matches" should **not** be introduced in this ticket. Current behavior requires an explicit score end-condition trigger. Changing semantics should be a separate behavior-change ticket.

## Updated Scope

### In Scope

1. Add `TerminalEvaluationDef` and replace top-level terminal fields with `GameDef.terminal`.
2. Refactor `terminalResult` to read only from `def.terminal` while preserving current behavior.
3. Update GameDef validation and schemas to validate `terminal` as a single subsystem.
4. Update compiler outputs to assemble `gameDef.terminal`.
5. Update cross-validation paths from `victory.*` to `terminal.checkpoints|margins|ranking.*`.
6. Update tests to assert the unified `terminal` shape.

### Out of Scope

1. Changing terminal semantics (no new precedence or fallback behavior).
2. Adding new terminal features.
3. Agent/sim redesign unrelated to terminal data shape.

## Corrected Implementation Targets

- `src/kernel/types-core.ts`
- `src/kernel/types-victory.ts`
- `src/kernel/terminal.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- `src/kernel/validate-gamedef-extensions.ts`
- `src/kernel/schemas-core.ts`
- `src/kernel/schemas-extensions.ts`
- `src/cnl/game-spec-doc.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-extensions.ts`
- `src/cnl/compiler-core.ts`
- `src/cnl/compile-lowering.ts`
- `src/cnl/compile-victory.ts`
- `src/cnl/cross-validate.ts`
- relevant terminal/compiler/schema/validation tests under `test/unit` and FITL victory integration tests under `test/integration`

## Corrected Invariants

1. `terminal.conditions` behaves identically to old `endConditions`.
2. `terminal.checkpoints`/`margins`/`ranking` behave identically to old `victory`.
3. `terminal.scoring` behaves identically to old `scoring`.
4. Evaluation order remains:
- checkpoints first
- then condition scan in declaration order
- score ranking only when a matched condition requests score result
5. FITL coup victory behavior remains unchanged.

## Acceptance Criteria (Corrected)

1. `npm test` passes.
2. `npm run typecheck` passes.
3. `npm run lint` passes.
4. No references remain to removed top-level GameDef fields (`endConditions`, `victory`, `scoring`) outside migration tests.
5. Compiler structured output and cross-validation align with unified terminal paths.

## Tests To Update (Corrected)

1. `test/unit/terminal.test.ts`
- Migrate fixtures/assertions to `def.terminal.*`.
- Keep existing behavioral assertions intact.

2. `test/unit/compiler-structured-results.test.ts`
- Replace `sections.victory`/`sections.endConditions` expectations with `sections.terminal` expectations.

3. `test/unit/cross-validate.test.ts`
- Update diagnostic path expectations from `doc.victory...` to `doc.terminal...` (or mapped source path as implemented).

4. `test/unit/validate-gamedef.test.ts`, `test/unit/schemas-top-level.test.ts`, `test/unit/json-schema.test.ts`
- Ensure validation/schema contracts enforce unified terminal shape.

5. `test/integration/fitl-coup-victory.test.ts`, `test/integration/compile-pipeline.test.ts`
- Keep FITL coup behavior assertions; update field access to unified terminal.

## Outcome

**Completed on**: 2026-02-13

What was changed vs originally planned:
- Corrected inaccurate assumptions in ticket scope (notably missing `GameSpecDoc.scoring`, existing structured compiler output, and current scoring semantics).
- Re-scoped acceptance criteria and test targets to preserve behavior while modernizing architecture.
- Clarified that behavior changes (for example scoring fallback semantics) are explicitly out of scope for this ticket.
- Follow-up architectural hardening was implemented: CNL authoring is now unified under a single `terminal` section (legacy top-level `endConditions`/`victory`/`scoring` authoring sections removed), matching the unified runtime/compiler contract.

Verification:
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run lint` passed.
