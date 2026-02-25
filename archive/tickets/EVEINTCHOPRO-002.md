# EVEINTCHOPRO-002: Reassess agent event-template completion assumptions

**Status**: ✅ COMPLETED
**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: Critical
**Depends on**: EVEINTCHOPRO-001
**Blocks**: EVEINTCHOPRO-005

## Summary

This ticket originally assumed agent completion logic still gated on a profile-template predicate and therefore skipped event templates that already had base params. That assumption is no longer true in the current codebase.

The implementation from EVEINTCHOPRO-001 already moved completion to a generic kernel path and both agents already attempt completion for every legal move candidate.

This ticket is therefore revised from "implement agent fix" to "validate architecture + harden targeted coverage + close out".

## Assumption Reassessment (Current Code)

1. **Original assumption**: `RandomAgent`/`GreedyAgent` only complete zero-param profile templates.

Reality:
- `packages/engine/src/agents/random-agent.ts` already calls `completeTemplateMove(...)` unconditionally for every legal move.
- `packages/engine/src/agents/greedy-agent.ts` already evaluates pending/completion state with `legalChoicesEvaluate(...)` and completes templates via `completeTemplateMove(...)` for all legal move candidates.

2. **Original assumption**: template completion lives in `packages/engine/src/agents/template-completion.ts`.

Reality:
- Completion is centralized in `packages/engine/src/kernel/move-completion.ts` (`completeTemplateMove`), which is architecturally better because it is action-agnostic and reused by both agents and tests.

3. **Original assumption**: dedicated new event-template agent tests are missing.

Reality:
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` already contains coverage that both `RandomAgent` and `GreedyAgent` complete event templates with base params before apply.

## Revised Scope

### In scope
- Validate that current architecture is preferable to the old proposed predicate-based approach.
- Strengthen coverage where still thin against Spec 50 Test 4 expectations (RandomAgent city distribution from event template completion).
- Run hard relevant test suites and lint checks.

### Out of scope
- Any new event-specific aliasing/path branching in agents.
- Reintroducing `isTemplateMoveForProfile`-style routing in agents.
- Kernel/legal-moves behavior changes already delivered by EVEINTCHOPRO-001.

## Architecture Decision

**Decision**: Keep current architecture; do not implement the original proposed code changes.

Why this is better than the original ticket proposal:
- Single generic completion mechanism in kernel (`completeTemplateMove`) supports pipeline templates and event templates uniformly.
- No event-specific detection predicates or aliases are needed.
- Agent code remains simple and robust: all moves follow the same completion pipeline.
- This aligns with clean/extensible architecture goals and avoids hardcoding game- or action-specific branching.

## Acceptance Criteria (Revised)

- Existing behavior remains unchanged:
  - `RandomAgent` and `GreedyAgent` return fully playable moves for event templates with pending choices.
  - Deterministic replay properties remain intact for fixed seed and inputs.
- Coverage includes an explicit RandomAgent distribution assertion for Gulf of Tonkin (Spec 50 Test 4 intent): with deterministic non-trivial seed, completed move places pieces across at least 2 cities.
- Relevant engine tests and lint pass.

## File List (Revised)

| File | Change |
|------|--------|
| `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` | Strengthen RandomAgent event-template assertion to validate multi-city distribution under deterministic seed |
| `archive/tickets/EVEINTCHOPRO-002.md` | Reassessed assumptions; revised scope and acceptance criteria |

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Reassessed and corrected the ticket to match current architecture:
    - Agent completion is already unconditional in both `RandomAgent` and `GreedyAgent`.
    - Completion logic is centralized in `packages/engine/src/kernel/move-completion.ts`.
  - Strengthened integration coverage for Spec 50 Test 4 intent:
    - `RandomAgent` Gulf of Tonkin test now verifies resulting placement spans at least 2 cities under deterministic seed.
- **Deviation from original plan**:
  - No agent source refactor was needed because the originally proposed implementation had already landed.
  - Work shifted from implementation to architectural validation and test hardening.
- **Verification**:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern \"RandomAgent completes an event template move that already has base params|GreedyAgent completes an event template move that already has base params|distributes pieces across multiple cities|Gulf of Tonkin\"`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo lint`
  - `pnpm turbo test`
