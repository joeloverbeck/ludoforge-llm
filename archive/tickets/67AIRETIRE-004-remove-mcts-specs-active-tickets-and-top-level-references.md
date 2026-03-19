# 67AIRETIRE-004: Remove MCTS specs, active tickets, and top-level references

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — planning artifact archival and active-doc cleanup
**Deps**: `67AIRETIRE-001`, `67AIRETIRE-002`, `67AIRETIRE-003`

## Problem

The repo still treats MCTS as an active architecture track through numbered specs, active tickets, reports, and top-level references. If MCTS is being dismantled rather than improved, the repository’s planning artifacts must stop advertising that workstream.

## Assumption Reassessment (2026-03-18)

1. At ticket start, active MCTS specs existed in `specs/62-mcts-search-visitor-and-incremental-decisions.md`, `specs/63-mcts-runtime-move-classification.md`, `specs/65-mcts-choosen-decision-architecture.md`, and `specs/66-mcts-competence-evaluation-framework.md`. They are now archived under `archive/specs/`.
2. At ticket start, active MCTS tickets still existed under `tickets/62MCTSSEAVIS-*`, `tickets/63MCTSRUNMOVCLA-*`, and `tickets/66MCTSCOMEVAFRA-*`. They are now archived under `archive/tickets/`.
3. Active repository metadata advertised MCTS work in `CLAUDE.md`, while active product/architecture guidance still mentioned MCTS in `specs/30-fitl-non-player-ai.md`. Those active-surface references have been removed.
4. `README.md` and `specs/00-implementation-roadmap.md` did not contain MCTS references and were correctly left untouched.
5. The repo has an explicit archival workflow in `docs/archival-workflow.md`; archiving the retired planning artifacts was cleaner and more durable than deleting them.
6. `pnpm run check:ticket-deps` is the canonical integrity check for ticket/reference drift after moving planning files.

## Architecture Check

1. Archiving retired planning artifacts is cleaner than leaving them in active directories because the repo should reserve `specs/`, `tickets/`, and top-level `reports/` for live deliverables while preserving historical record.
2. This cleanup is architecturally stronger than leaving partial tombstones or "deprecated" placeholders in active directories. Clean separation between active planning and archive scales better and avoids future dependency drift.
3. Active docs should describe the current durable architecture: generic engine/runtime contracts plus non-MCTS agent paths already supported by the codebase. MCTS should remain historical context only.
4. No active-doc aliases, compatibility notes, or "MCTS is retired" stubs should remain once the archival work lands.

## What to Change

### 1. Archive active MCTS planning artifacts

Move the active MCTS specs out of `specs/` and the active MCTS tickets out of `tickets/` into the appropriate `archive/` folders using the repository archival workflow. Update active references so there are no broken links or stale dependency references.

### 2. Remove top-level MCTS documentation and report references

Move top-level reports that only exist for MCTS work into `archive/reports/`, and rewrite active docs/metadata that still advertise MCTS as active architecture. Active docs must not point at archived MCTS plans unless they are explicitly discussing historical context.

## Files to Touch

- `archive/specs/62-mcts-search-visitor-and-incremental-decisions.md` (archive)
- `archive/specs/63-mcts-runtime-move-classification.md` (archive)
- `archive/specs/65-mcts-choosen-decision-architecture.md` (archive)
- `archive/specs/66-mcts-competence-evaluation-framework.md` (archive)
- `archive/tickets/62MCTSSEAVIS-017-fitl-mcts-default-strong-validation.md` (archive)
- `archive/tickets/62MCTSSEAVIS-018-texas-holdem-regression.md` (archive)
- `archive/tickets/62MCTSSEAVIS-019-pool-sizing-tuning.md` (archive)
- `archive/tickets/62MCTSSEAVIS-020-ci-workflow-diagnostics-upload.md` (archive)
- `archive/tickets/62MCTSSEAVIS-021-worker-postmessage-visitor-bridge.md` (archive)
- `archive/tickets/62MCTSSEAVIS-022-ai-thinking-store-slice.md` (archive)
- `archive/tickets/62MCTSSEAVIS-023-action-display-names.md` (archive)
- `archive/tickets/62MCTSSEAVIS-024-ai-turn-overlay-dashboard.md` (archive)
- `archive/tickets/62MCTSSEAVIS-025-visual-play-verification.md` (archive)
- `archive/tickets/63MCTSRUNMOVCLA-008-regression-suite-edge-cases.md` (archive)
- `archive/tickets/66MCTSCOMEVAFRA/66MCTSCOMEVAFRA-008-playbook-scenarios-and-test-runner.md` (archive into `archive/tickets/66MCTSCOMEVAFRA/`)
- `archive/tickets/66MCTSCOMEVAFRA/66MCTSCOMEVAFRA-008b-engineered-scenarios-s11-s15.md` (archive into `archive/tickets/66MCTSCOMEVAFRA/`)
- `archive/tickets/66MCTSCOMEVAFRA/66MCTSCOMEVAFRA-009-documentation-and-failure-protocol.md` (archive into `archive/tickets/66MCTSCOMEVAFRA/`)
- `CLAUDE.md` (modify)
- `specs/30-fitl-non-player-ai.md` (modify)
- `archive/reports/mcts-fitl-performance-analysis.md` (archive)
- `archive/reports/mcts-optimization-technical-context-for-external-research.md` (archive)

## Out of Scope

- Historical archive content rewrites beyond status/outcome updates required by the archival policy
- Engine/runtime code removal
- Runner and CI implementation changes

## Acceptance Criteria

### Tests That Must Pass

1. `specs/` contains no active MCTS spec files.
2. `tickets/` contains no active legacy MCTS implementation tickets.
3. Top-level `reports/` contains no active MCTS-only reports.
4. Existing suites and integrity checks:
   - `pnpm run check:ticket-deps`
   - `node --test scripts/check-ticket-deps.test.mjs scripts/archive-ticket.test.mjs`
   - `pnpm turbo test`

### Invariants

1. Active repo planning docs and metadata no longer describe MCTS as a supported or in-progress architecture track.
2. Cross-references in active specs/docs do not point at the archived MCTS files as if they were active work items.
3. Archival moves preserve ticket/spec/report history instead of deleting it.

## Test Plan

### New/Modified Tests

1. No production code tests are expected to change unless the archival workflow or dependency integrity tooling needs strengthening.
2. Run repository-wide reference search after the moves and update any active-doc or active-ticket references in the same change.
3. If archival or dependency tooling fails to catch a moved-reference edge case encountered during implementation, add or strengthen script tests in the same change.

### Commands

1. `pnpm run check:ticket-deps`
2. `rg -n "MCTS|mcts" specs tickets reports docs CLAUDE.md --glob '!archive/**'`
3. `node --test scripts/check-ticket-deps.test.mjs scripts/archive-ticket.test.mjs`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-18
- What changed: Archived the remaining active MCTS specs, active MCTS tickets, and top-level MCTS-only reports; removed the live MCTS references from `CLAUDE.md`; and rewrote the remaining active mention in `specs/30-fitl-non-player-ai.md` to stay architecture-neutral.
- Deviations from original plan: The initial ticket proposed deletion and named `README.md` plus `specs/00-implementation-roadmap.md` as likely touchpoints. The implementation used the repo's archival workflow instead of deletion and left those untouched because they contained no active MCTS references.
- Verification results: `pnpm run check:ticket-deps`; `node --test scripts/check-ticket-deps.test.mjs scripts/archive-ticket.test.mjs`; `pnpm turbo test`; and a final `rg -n "MCTS|mcts" specs tickets reports docs CLAUDE.md --glob '!archive/**'` check confirmed no remaining active-surface MCTS references beyond this ticket before archival.
