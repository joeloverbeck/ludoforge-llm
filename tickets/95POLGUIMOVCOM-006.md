# 95POLGUIMOVCOM-006: Compile `completionScoreTerms` and `completionGuidance` from YAML

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — cnl compile-agents, agents policy-expr
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md, archive/tickets/95POLGUIMOVCOM-003.md

## Problem

This ticket's original scope was already consumed by ticket `002`. To keep the authored-to-compiled policy surface coherent, ticket `002` had to implement:

- compilation of `library.completionScoreTerms`
- lowering of `profile.use.completionScoreTerms`
- lowering of `profile.completionGuidance`
- `decision.*` / `option.*` ref lowering into compiled completion refs

Leaving this ticket active with the original scope would duplicate already-delivered compiler work and create ticket drift.

## Assumption Reassessment (2026-03-30)

1. `compile-agents.ts` now compiles `library.completionScoreTerms`, `profile.use.completionScoreTerms`, and `profile.completionGuidance`. Confirmed in the current code.
2. `compile-agents.ts` already lowers `decision.type`, `decision.name`, `decision.targetKind`, `decision.optionCount`, and `option.value` into compiled completion refs. Confirmed.
3. Ticket `002` also had to add the related schema and validator synchronization to keep the pipeline architecturally complete. Confirmed.
4. Mismatch: the work described by this ticket is no longer pending. This ticket should be treated as superseded rather than reimplemented.

## Architecture Check

1. Cleanest approach is not to duplicate finished compiler work in a second ticket. Keeping superseded scope active invites contradictory edits and weakens ticket fidelity.
2. Engine agnosticism remains preserved by the implementation already landed in ticket `002`; no new game-specific logic is needed here.
3. Any future compiler cleanup should target a different problem statement than the one originally captured in this ticket.

## What to Change

No further implementation should happen under this ticket. The intended compiler work was already delivered in ticket `002`.

## Files to Touch

None. Superseded by ticket `002`.

## Out of Scope

- Re-implementing compiler work already finished in ticket `002`
- Runtime evaluation of compiled `completionScoreTerms` (ticket 007)
- `zoneTokenAgg` dynamic zone compilation (ticket 004 — separate concern)
- Policy contract centralization across types/schema/validator/compiler (tracked separately)

## Acceptance Criteria

### Tests That Must Pass

1. Ticket `002` remains the authoritative completed implementation for this compiler scope.
2. Downstream tickets must depend on `archive/tickets/95POLGUIMOVCOM-002.md`, not on this ticket, for completion-guidance compilation behavior.

### Invariants

1. Active tickets must not claim already-delivered work as pending.
2. Compiler ownership for the completion-guidance surface stays with archived ticket `002`.

## Test Plan

### New/Modified Tests

None. Superseded by ticket `002`.

### Commands

None.
