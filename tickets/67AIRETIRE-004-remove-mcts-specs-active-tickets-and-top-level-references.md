# 67AIRETIRE-004: Remove MCTS specs, active tickets, and top-level references

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — documentation and repository metadata cleanup
**Deps**: `67AIRETIRE-001`, `67AIRETIRE-002`, `67AIRETIRE-003`

## Problem

The repo still treats MCTS as an active architecture track through numbered specs, active tickets, reports, and top-level references. If MCTS is being dismantled rather than improved, the repository’s planning artifacts must stop advertising that workstream.

## Assumption Reassessment (2026-03-18)

1. Active MCTS specs still exist in `specs/62-mcts-search-visitor-and-incremental-decisions.md`, `specs/63-mcts-runtime-move-classification.md`, `specs/65-mcts-choosen-decision-architecture.md`, and `specs/66-mcts-competence-evaluation-framework.md`.
2. Active MCTS tickets still exist under `tickets/62MCTSSEAVIS-*`, `tickets/63MCTSRUNMOVCLA-*`, and `tickets/66MCTSCOMEVAFRA-*`.
3. Top-level repository references still mention MCTS lanes, MCTS reports, or MCTS architecture in files such as `README.md`, `specs/00-implementation-roadmap.md`, `specs/30-fitl-non-player-ai.md`, and `reports/mcts-*.md`.

## Architecture Check

1. Deleting retired planning artifacts is cleaner than marking them “inactive” in active directories because the repo should reserve `specs/` and `tickets/` for live deliverables.
2. This cleanup reinforces the intended direction: per-game bot logic belongs in game data/spec assets, while shared runtime remains generic.
3. No placeholder “MCTS is deprecated” specs or active-ticket stubs should remain once the removal work lands.

## What to Change

### 1. Delete active MCTS planning artifacts

Remove the MCTS specs from `specs/` and the active MCTS tickets from `tickets/`. Update cross-references in roadmap/spec files so there are no broken links or stale dependency references.

### 2. Remove top-level MCTS documentation and report references

Delete or rewrite top-level docs/reports that only exist for MCTS work. Keep archival history out of scope unless an archive file is still referenced from active docs; active docs must not point at removed MCTS plans.

## Files to Touch

- `specs/62-mcts-search-visitor-and-incremental-decisions.md` (delete)
- `specs/63-mcts-runtime-move-classification.md` (delete)
- `specs/65-mcts-choosen-decision-architecture.md` (delete)
- `specs/66-mcts-competence-evaluation-framework.md` (delete)
- `tickets/62MCTSSEAVIS-017-fitl-mcts-default-strong-validation.md` (delete)
- `tickets/62MCTSSEAVIS-018-texas-holdem-regression.md` (delete)
- `tickets/62MCTSSEAVIS-019-pool-sizing-tuning.md` (delete)
- `tickets/62MCTSSEAVIS-020-ci-workflow-diagnostics-upload.md` (delete)
- `tickets/62MCTSSEAVIS-021-worker-postmessage-visitor-bridge.md` (delete)
- `tickets/62MCTSSEAVIS-022-ai-thinking-store-slice.md` (delete)
- `tickets/62MCTSSEAVIS-023-action-display-names.md` (delete)
- `tickets/62MCTSSEAVIS-024-ai-turn-overlay-dashboard.md` (delete)
- `tickets/62MCTSSEAVIS-025-visual-play-verification.md` (delete)
- `tickets/63MCTSRUNMOVCLA-008-regression-suite-edge-cases.md` (delete)
- `tickets/66MCTSCOMEVAFRA-008-playbook-scenarios-and-test-runner.md` (delete)
- `tickets/66MCTSCOMEVAFRA-008b-engineered-scenarios-s11-s15.md` (delete)
- `tickets/66MCTSCOMEVAFRA-009-documentation-and-failure-protocol.md` (delete)
- `specs/00-implementation-roadmap.md` (modify)
- `specs/30-fitl-non-player-ai.md` (modify)
- `README.md` (modify if any active MCTS reference remains after ticket 003)
- `reports/mcts-fitl-performance-analysis.md` (delete or archive per final implementation decision)
- `reports/mcts-optimization-technical-context-for-external-research.md` (delete or archive per final implementation decision)

## Out of Scope

- Historical archive cleanup unless active docs still reference archived MCTS material
- Engine/runtime code removal
- Runner and CI implementation changes

## Acceptance Criteria

### Tests That Must Pass

1. `specs/` contains no active MCTS spec files.
2. `tickets/` contains no active legacy MCTS implementation tickets.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Active repo planning docs no longer describe MCTS as a supported or in-progress architecture track.
2. Cross-references in active specs/docs do not point at deleted MCTS files.

## Test Plan

### New/Modified Tests

1. No new code tests expected; validate with repository-wide reference search and existing lint/test coverage.
2. If any doc-link checker or dependency validator flags deleted ticket/spec references, update those references in the same change.

### Commands

1. `pnpm run check:ticket-deps`
2. `rg -n "MCTS|mcts" specs tickets README.md reports packages .github`
3. `pnpm turbo test`
