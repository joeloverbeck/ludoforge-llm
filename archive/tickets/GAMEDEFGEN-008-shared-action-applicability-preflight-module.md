# GAMEDEFGEN-008: Consolidate Action Applicability Preflight Across Entry Points

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## Corrected Assumptions (Reassessed Against Current Code)

1. `src/kernel/apply-move-pipeline.ts` already centralizes pipeline-profile applicability dispatch (`resolveActionPipelineDispatch`), so this ticket is an extension/consolidation effort, not a greenfield module.
2. Entry-point applicability checks are still partially duplicated and not fully aligned:
   - `legalMoves` performs phase/actor/executor/limits checks before move enumeration.
   - `legalChoices` resolves actor/executor and pipeline dispatch, but does not consistently gate on phase/limits.
   - `applyMove` performs actor/executor checks and legality checks via `legalMoves`/decision validation, but duplicates applicability-related resolution steps.
3. The architecture goal is a single generic preflight contract used by all three entry points, without game-specific branching.

## Why This Change Is Architecturally Better

1. A shared preflight contract removes semantic drift risk between `legalMoves`, `legalChoices`, and `applyMove`.
2. It creates one canonical place to evolve applicability invariants (phase/actor/executor/limits/pipeline applicability) as the engine grows.
3. It keeps the kernel generic and data-driven by evaluating selectors and predicates from `GameDef` only.

## 1) What Needs To Change / Be Added

1. Add a reusable action applicability preflight module in `src/kernel/` that evaluates:
   - phase compatibility,
   - actor applicability,
   - executor applicability (or free-operation execution path where applicable),
   - action usage limits,
   - action-pipeline applicability dispatchability (reusing `resolveActionPipelineDispatch`).
2. Define a typed preflight result contract shared by `legalMoves`, `legalChoices`, and `applyMove` (applicable vs specific inapplicable reasons vs invalid selector contract errors).
3. Refactor `legalMoves`, `legalChoices`, and `applyMove` to consume this contract and remove duplicated gate logic while preserving existing behavior for valid specs.
4. Preserve engine genericity: no game-specific identifiers, hooks, or branches in preflight logic.

## 2) Invariants That Should Pass

1. For equivalent state/action inputs, applicability outcomes are aligned across `legalMoves`, `legalChoices`, and `applyMove`.
2. Preflight outcomes are deterministic and independent of callsite-specific plumbing.
3. Existing valid-game behavior is preserved (no semantic regressions outside corrected inconsistency).
4. Invalid selector/spec outcomes remain explicit and surfaced with existing runtime-contract error semantics.

## 3) Tests That Should Pass

1. Unit: new preflight module returns expected typed outcomes for phase/actor/executor/limits/pipeline-no-match cases.
2. Unit: parity coverage verifies `legalMoves`/`legalChoices`/`applyMove` agreement for representative applicability scenarios.
3. Regression unit: existing applicability dispatch tests continue passing unchanged.
4. Integration: relevant kernel integration suites continue passing.

## Non-Goals

1. No game-specific rules or schemas.
2. No broad refactors outside applicability gating paths.
3. No backward-compatibility aliases; consumers are updated directly to the new shared contract.

## Outcome

- Completion date: 2026-02-15
- What was changed:
  - Added shared preflight module `src/kernel/action-applicability-preflight.ts` with typed applicability outcomes for phase, actor, executor, action limits, and pipeline applicability dispatch.
  - Refactored `legalMoves`, `legalChoices`, and `applyMove` to consume the shared preflight contract and remove duplicated applicability gate logic.
  - Extended choice-illegal reason typing to include `phaseMismatch` and `actionLimitExceeded` for explicit applicability reporting in `legalChoices`.
  - Added focused unit tests for preflight behavior and parity-relevant legal-choices gaps.
- Deviations from original plan:
  - The ticket was corrected first because a shared dispatch module (`apply-move-pipeline`) already existed; work became consolidation/extension rather than introducing dispatch preflight from scratch.
  - Kept pipeline legality/cost predicate evaluation where it already belongs (`legalMoves`/`legalChoices`/`applyMove`) and scoped the shared module to applicability gates only.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test:all` passed (206 tests, 0 failures).
