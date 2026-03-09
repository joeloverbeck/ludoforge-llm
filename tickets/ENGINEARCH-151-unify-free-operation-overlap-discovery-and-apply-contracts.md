# ENGINEARCH-151: Unify Free-Operation Overlap Discovery and Apply Contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal-move discovery, free-operation denial analysis, and apply-time overlap parity
**Deps**: tickets/ENGINEARCH-150-extract-shared-free-operation-overlap-classifier.md, archive/tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/src/kernel/free-operation-discovery-analysis.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts

## Problem

Ambiguous overlapping free-operation grants are now rejected when a move is applied, but discovery still evaluates grants independently and can expose those same moves as legal/free-operation-capable. That creates a contract split between legal-move generation and actual move execution.

## Assumption Reassessment (2026-03-09)

1. `applyMove` and grant consumption now use overlap-aware resolution and reject ambiguous top-ranked matches.
2. `legalMoves` / free-operation discovery still rely on per-grant checks (`doesGrantAuthorizeMove(...)` and related helpers) and do not run the new ambiguity guard.
3. Mismatch: a move can still appear legal in discovery and only fail with `RUNTIME_CONTRACT_INVALID` during application. Corrected scope: thread the same overlap contract through discovery/preflight surfaces.

## Architecture Check

1. A move should not be legal in discovery if the same engine contract will reject it during application.
2. This is a kernel contract issue, not a game-data issue. The fix belongs in shared game-agnostic turn-flow analysis.
3. No backwards-compatibility fallback should preserve the current split. Discovery and apply must converge on one authoritative answer.

## What to Change

### 1. Reuse overlap-aware resolution in discovery/preflight

Update legal-move and denial/preflight paths so ambiguous top-ranked overlaps are detected before moves are surfaced as legal free operations.

### 2. Define discovery-facing behavior for ambiguity

Choose one canonical discovery contract and apply it consistently:
- either suppress ambiguous free-operation variants entirely
- or surface a deterministic denial/preflight reason that keeps the move out of the legal set

Do not allow apply-time-only failure for a move that discovery marked legal.

### 3. Add parity regression coverage

Add tests proving dynamic/effect-issued ambiguous overlaps are handled identically in:
- legal move generation
- free-operation discovery/denial analysis
- apply-time execution

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify if shared discovery adapter belongs there)
- `packages/engine/src/kernel/free-operation-legality-policy.ts` (modify only if a new denial cause is required)
- `packages/engine/test/unit/kernel/legal-moves-turn-order.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` (modify only if denial taxonomy changes)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)

## Out of Scope

- Declarative `GameDef` validation for statically knowable event-grant overlaps
- Visual/simulator presentation behavior

## Acceptance Criteria

### Tests That Must Pass

1. Dynamic ambiguous top-ranked free-operation overlaps are not surfaced as legal free-operation moves.
2. Discovery/preflight and apply-time execution produce parity-equivalent outcomes for ambiguous overlap states.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves-turn-order.test.js`
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Legal-move generation and move application share one free-operation overlap contract.
2. No game-specific identifiers or per-title exceptions are introduced to decide overlap ambiguity.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves-turn-order.test.ts` — assert ambiguous dynamic overlaps do not produce legal free-operation variants.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — keep apply-time ambiguity/backstop coverage aligned with discovery parity.
3. `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` — add coverage if a dedicated ambiguity denial reason is introduced.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves-turn-order.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`
