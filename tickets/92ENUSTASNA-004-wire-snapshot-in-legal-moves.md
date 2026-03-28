# 92ENUSTASNA-004: Wire snapshot creation in enumerateRawLegalMoves

**Status**: DEFERRED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — legal-moves.ts snapshot creation and threading
**Deps**: archive/tickets/92ENUSTASNA/92ENUSTASNA-003-thread-snapshot-through-pipeline-policy.md

## Problem

The snapshot module exists (001), compiled predicates accept it (002), and the pipeline policy threads it (003). The final wiring step: create the snapshot at the top of `enumerateRawLegalMoves` and pass it to every `evaluateDiscoveryPipelinePredicateStatus` call site within that function.

## Assumption Reassessment (2026-03-28)

1. `enumerateRawLegalMoves` is defined at line ~1150 of `legal-moves.ts` — confirmed. Signature: `(def, state, options?, runtime?) => RawLegalMoveEnumerationResult`.
2. There are 4 call sites of `evaluateDiscoveryPipelinePredicateStatus` in `legal-moves.ts` — confirmed (lines ~476, ~892, ~982, ~1307).
3. The core wiring described here has already been delivered as part of the implementation for archived ticket `92ENUSTASNA-003`: `enumerateRawLegalMoves` now creates a snapshot once and threads it through the relevant `legal-moves.ts` discovery call sites.
4. Because that work is already landed, implementing this ticket as originally written would duplicate already-delivered architecture, violating the ticket authoring contract.
5. The remaining architectural gap is not "wire the snapshot into legal moves" but "generalize snapshot player access so enumeration-time compiled predicates can use snapshot data safely even when evaluation runs under a non-`state.activePlayer` executor context." That follow-up belongs in a separate ticket.

## Architecture Check

1. No standalone implementation remains here. The intended architecture for legal-move wiring already exists in production code.
2. Keeping this ticket active as a code-change ticket would be misleading and would duplicate architecture already delivered elsewhere.
3. Any future ticket that touches this area should address the deeper player-context design gap, not re-land the already-completed snapshot transport.

## What to Change

### 1. Do not re-implement the legal-moves wiring

No production code changes should be made under this ticket as currently written.

### 2. Treat this ticket as superseded by the archived 003 delivery

If further work is needed in this area, it should start from the current code and from the follow-up player-generalization ticket rather than from this original wiring plan.

## Files to Touch

- None

## Out of Scope

- Re-landing wiring already completed by archived ticket `92ENUSTASNA-003`
- The player-generalization architecture follow-up
- Performance benchmarking (ticket 006)
- Any new compiled aggregate consumer of `snapshot.zoneTotals`; that follow-up belongs in `92ENUSTASNA-007`

## Acceptance Criteria

### Tests That Must Pass

1. No implementation should proceed from this ticket as currently written.
2. Follow-up work should be tracked in the updated active tickets instead of duplicating delivered wiring.

### Invariants

1. The active ticket set should not duplicate already-delivered architecture.
2. Any future implementation in this area must start from the current codebase, not from the stale assumptions in this original ticket.

## Test Plan

### New/Modified Tests

1. None. Superseded by completed work and by the active equivalence/benchmark/player-generalization tickets.

### Commands

1. None
