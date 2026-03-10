# ENGINE-003: Centralize free-operation ambiguity deferral policy for discovery and move enumeration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — free-operation legality/discovery internals and kernel architecture guard coverage
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/legal-choices.ts`, `packages/engine/src/kernel/legal-moves-turn-order.ts`, `packages/engine/test/unit/kernel/free-operation-discovery-export-surface-guard.test.ts`, `packages/engine/test/unit/kernel/legal-moves.test.ts`, `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`

## Problem

The current fix makes `legalMoves` fall back to `legalChoicesDiscover()` to decide whether a provisional free-operation variant should survive an ambiguous-overlap denial. That works functionally, but it couples move enumeration to the public legal-choices entrypoint instead of sharing a small internal policy abstraction. The architecture would be cleaner and easier to extend if ambiguity-deferral probing lived behind one internal helper consumed by both surfaces.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/src/kernel/legal-choices.ts` now owns the concrete probing logic that distinguishes resolvable from non-resolvable free-operation ambiguity.
2. `packages/engine/src/kernel/legal-moves-turn-order.ts` now calls `legalChoicesDiscover()` when `isFreeOperationGrantedForMove()` returns false, using the public discovery API as an internal policy oracle.
3. No active ticket currently covers extracting that shared policy into a smaller internal helper with an explicit ownership boundary.

## Architecture Check

1. The cleaner design is one internal ambiguity-deferral helper that evaluates whether a denied free operation can become legal through future move decisions, with `legalChoices` and `legalMoves` both depending on it.
2. This preserves the game-agnostic boundary because the helper operates only on generic move/grant legality and decision-sequence probing, not on game-specific GameSpecDoc content or visual configuration.
3. No backwards-compatibility aliasing should be introduced. The old cross-module call pattern should be replaced, not supported in parallel.

## What to Change

### 1. Extract shared ambiguity-deferral policy

Introduce a small internal helper or module that answers the narrow question “can this ambiguous free-operation denial be deferred because later move decisions can resolve it?”

### 2. Repoint discovery and move enumeration to the shared helper

Have `legalChoices` and `legalMoves` consume the same helper rather than having `legalMoves` call the higher-level public legal-choices API.

### 3. Guard the ownership boundary with tests

Add or strengthen architecture coverage so future changes do not reintroduce a dependency from move enumeration to the public legal-choices surface for this policy.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify or extract helper)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify if callsite/behavior assertions change)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify only if behavior coverage needs adjustment)
- `packages/engine/test/unit/kernel/free-operation-discovery-export-surface-guard.test.ts` (modify or add ownership coverage)

## Out of Scope

- Changing free-operation authorization semantics.
- Any game-specific GameSpecDoc or `visual-config.yaml` changes.
- Runner/UI changes.

## Acceptance Criteria

### Tests That Must Pass

1. `legalChoices` and `legalMoves` still agree on resolvable vs non-resolvable free-operation ambiguity.
2. `legal-moves-turn-order.ts` no longer depends on the public `legalChoicesDiscover()` API for ambiguity-deferral policy.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation ambiguity deferral remains a single kernel-internal policy with one source of truth.
2. `GameDef`, simulation, and runtime remain fully game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — keep behavioral parity coverage while removing dependence on the public legal-choices entrypoint.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — retain resolvable/non-resolvable ambiguity coverage after the extraction.
3. `packages/engine/test/unit/kernel/free-operation-discovery-export-surface-guard.test.ts` — add or adjust an ownership guard so the policy boundary stays explicit.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/legal-moves.test.js dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/free-operation-discovery-export-surface-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
