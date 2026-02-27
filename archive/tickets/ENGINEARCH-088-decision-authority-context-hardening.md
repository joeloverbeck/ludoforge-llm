# ENGINEARCH-088: Decision Authority Context Hardening for Choice Resolution

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel legality/apply APIs, decision sequence plumbing, runtime validation surfaces
**Deps**: archive/tickets/ENGINEARCH-087-compiler-owned-binding-namespace-and-distribute-runtime-parity.md

## Problem

Choice ownership (`chooser`) is now enforceable, but authority input is caller-provided (`decisionPlayer`) and can be spoofed by untrusted callers. This weakens the architectural contract for cross-seat decisions.

## Assumption Reassessment (2026-02-27)

1. Current legality/apply surfaces still accept optional caller-provided `decisionPlayer` and thread it into effect runtime ownership checks.
2. Ownership checks already exist in runtime (`effects-choice.ts`) and tests (`legal-choices.test.ts`, `apply-move.test.ts`), but they depend on a caller override channel.
3. Several ticket references were stale:
- Active ticket file is `tickets/ENGINEARCH-088-decision-authority-context-hardening.md`.
- Dependency ticket is archived, not active.
- The primary apply-path ownership test currently lives at `packages/engine/test/unit/apply-move.test.ts`.
4. Corrected scope for this ticket: remove caller authority override surfaces and replace them with engine-owned authority context threading. Cross-seat replay/identity binding remains follow-up work in ENGINEARCH-089.

## Architecture Reassessment

1. Removing externally supplied scalar authority from public runtime APIs is architecturally better than keeping a spoofable override.
2. Engine-owned authority context is a cleaner long-term foundation for deterministic policy hardening and later binding-token integration.
3. This change intentionally breaks legacy override usage (`decisionPlayer` in public options); no backwards-compat alias path.

## What to Change

### 1. Replace scalar override path with engine-owned authority context

Introduce and thread a typed authority context through choice-resolution internals, sourced from runtime execution state only.

### 2. Remove caller authority override API surfaces

Remove `decisionPlayer` from externally callable options contracts and update all call sites/tests.

### 3. Preserve chooser metadata while hardening enforcement path

Continue surfacing chooser ownership metadata on pending requests, but enforce resolution only against engine-owned authority context for this ticket.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add)

## Out of Scope

- Runner/UI authentication concerns.
- Pending-choice replay binding tokens (`decisionContextId`) and stale request protection (ENGINEARCH-089).
- Game-specific choice rules or selector semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Caller-provided `decisionPlayer` override path is removed from public apply/legal/discovery/decision-sequence APIs.
2. Chooser ownership checks no longer depend on caller-injected authority scalars.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Authority provenance is engine-owned and game-agnostic.
2. GameDef/runtime do not gain game-specific branches or compatibility aliases.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — verifies no override API, pending chooser metadata remains, and non-engine authority override path is gone.
2. `packages/engine/test/unit/apply-move.test.ts` — verifies chooser-ownership behavior after removing caller override channel.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — verifies decision-sequence API no longer accepts/threads caller authority override.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/unit/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Removed caller-provided authority override from public runtime options (`ExecutionOptions`, legal-choices runtime options, decision-sequence options).
  - Introduced engine-owned authority context threading (`DecisionAuthorityContext`) into effect runtime context.
  - Updated choice ownership enforcement to use engine-owned authority context only.
  - Updated legality/apply/decision-sequence tests to reflect the hardened no-override contract.
- **Deviation from original plan**:
  - Instead of retaining a caller override escape hatch, this implementation removes it entirely and makes cross-seat resolution without engine-owned authority fail deterministically.
  - Replay/identity binding tokens remain deferred to ENGINEARCH-089 as planned.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` ✅
  - `node --test packages/engine/dist/test/unit/apply-move.test.js` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (307 passed, 0 failed)
