# 149FITLEVNUMVM-008: PreviewDriveScope skeleton + apply/undo log primitives

**Status**: DEFERRED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new modules in `packages/engine/src/agents/` and `packages/engine/src/kernel/encoded-state/`
**Deps**: `archive/tickets/149FITLEVNUMVM-005.md`, `archive/tickets/149FITLEVNUMVM-017.md`

## Problem

Phase 2 of spec 149 replaces per-step state cloning inside the preview drive with mutation + an undo log on the encoded view. This ticket lands the scope abstraction (`PreviewDriveScope`) and the underlying typed-array mutation primitives + undo log. The actual migration of the cloning path lives in ticket 009.

## Dependency Update (2026-04-29)

Ticket 006 landed the Phase 1 encoded read-path correctness slice, but the measured Phase 1 gate stayed above the 5500 ms calibration. This ticket now depends on `149FITLEVNUMVM-017` because that follow-up owns the Phase 1 measured-gate resolution and may re-spec, skip, or reorder Phase 2 under Spec 149's stop conditions. Do not start the apply/undo Phase 2 entry ticket until `017` either resolves the miss or records a user-approved corrected phase plan.

## Deferred Update (2026-04-30)

Ticket `149FITLEVNUMVM-017` recorded a user-approved corrected plan: the Phase 1 stop condition has fired, the false 5500 ms gate is superseded, and the old Phase 2 apply/undo branch is no longer the next active implementation path. Keep this ticket as a deferred planning artifact only. Reopen or rewrite it only if later bytecode/VM profiling proves preview clone/apply cost is again the next generic bottleneck.

## Outcome (2026-04-30)

Deferred and archived. The old Phase 2 apply/undo branch is no longer the active
Spec 149 path after the Phase 1 stop-condition decision. Reopen only with a new
or rewritten ticket if later VM-path profiling proves preview clone/apply cost is
again the next generic bottleneck.

## Assumption Reassessment (2026-04-28)

1. `EncodedState` from ticket 005 provides the typed-array surface to mutate.
2. The existing preview-drive cloning path is in `packages/engine/src/agents/policy-preview.ts:887` consuming `applyPublishedDecisionFromPreviewStateNoFinalHash` from `packages/engine/src/kernel/microturn/drive.ts:663` (verified during spec 149 reassessment).
3. F11's scoped-mutation exception (FOUNDATIONS.md lines 73-75) explicitly permits private working state within a synchronous effect-execution scope, with isolation enforced by regression tests. This ticket's scope satisfies that constraint.

## Architecture Check

1. `PreviewDriveScope` encapsulates mutation entirely within a single drive call; the encoded view is private to the scope. F11 scoped-mutation exception applies cleanly.
2. The undo log is an append-only typed array; rollback is O(mutated cells), not O(state size). Bounded computation per F10.
3. Outer kernel contract `(state) → newState` is unchanged — finalize() canonicalizes the mutated encoded view back to an immutable `GameState`.
4. No game-specific branches; the mutation primitives are generic over the layout.

## What to Change

### 1. `packages/engine/src/kernel/encoded-state/mutate.ts` (new)

Export typed-array mutation primitives:
- `function mutateTokenZone(state: EncodedState, log: PreviewMutationLog, tokenIndex: number, newZoneIndex: number): void`
- `function mutateTokenFlag(state: EncodedState, log: PreviewMutationLog, tokenIndex: number, flagIndex: number, newValue: boolean): void`
- `function mutateZoneOccupancy(state: EncodedState, log: PreviewMutationLog, zoneIndex: number, typeIndex: number, delta: number): void`
- `function mutatePlayerInt(state: EncodedState, log: PreviewMutationLog, playerIndex: number, slot: number, newValue: number): void`
- `function mutateZoneInt(state: EncodedState, log: PreviewMutationLog, zoneIndex: number, slot: number, newValue: number): void`
- `function mutateZoneMarker(state: EncodedState, log: PreviewMutationLog, zoneIndex: number, markerBit: number, newValue: boolean): void`
- `function mutateGlobalMarker(state: EncodedState, log: PreviewMutationLog, markerBit: number, newValue: boolean): void`
- `function mutateGlobal(state: EncodedState, log: PreviewMutationLog, slot: number, newValue: number): void`

Each primitive packs the old value into the log before writing.
If `mutateTokenZone` moves a token with duplicate occurrence metadata, it must keep
`tokenOccurrenceOffset`, `tokenOccurrenceCount`, and `tokenOccurrenceZones`
consistent with the canonical-zone rule from ticket 005.

### 2. `PreviewMutationLog` type and rollback

Define in `mutate.ts`:
- `interface PreviewMutationLog` with packed `entries: Int32Array` and `bitsetEntries: BigUint64Array` (for 64-bit values), plus a `cursor: number`.
- `function rollback(state: EncodedState, log: PreviewMutationLog, toCursor: number): void` — walks the log backwards, restoring old values.

Per spec §2.3, packed format: `(offset << 32) | oldValue` for Int32 entries; two-slot encoding for BigUint64 entries.

### 3. `packages/engine/src/agents/policy-preview-scope.ts` (new)

Export:
- `interface PreviewDriveScope` with fields `encoded: EncodedState`, `log: PreviewMutationLog`.
- `function createPreviewDriveScope(state: GameState, layout: EncodedStateLayout): PreviewDriveScope` — initializes the encoded view + empty log.
- `function applyDecision(scope: PreviewDriveScope, decision: Decision): void` — appends to the log.
- `function rollbackToCursor(scope: PreviewDriveScope, cursor: number): void` — wraps the encoded-state rollback.
- `function finalize(scope: PreviewDriveScope): GameState` — canonicalizes the mutated encoded view back to an immutable `GameState` (with canonical hash recomputed via the existing `updateHash` machinery).

### 4. Mutation isolation regression test

Add a regression test asserting: after a `PreviewDriveScope` is finalized, the original `GameState` passed to `createPreviewDriveScope` is not mutated (object identity + canonical equality preserved). This is the F11 scoped-mutation exception's required regression test.

## Files to Touch

- `packages/engine/src/kernel/encoded-state/mutate.ts` (new)
- `packages/engine/src/kernel/encoded-state/index.ts` (modify — extend barrel)
- `packages/engine/src/agents/policy-preview-scope.ts` (new)
- `packages/engine/test/unit/kernel/encoded-state-mutate.test.ts` (new)
- `packages/engine/test/unit/agents/policy-preview-scope.test.ts` (new)

## Out of Scope

- Wiring `PreviewDriveScope` into the actual preview drive (ticket 009).
- Property tests for trajectory equivalence (ticket 010).
- Bytecode VM consumption of mutated encoded state (ticket 015).

## Acceptance Criteria

### Tests That Must Pass

1. New test: each mutation primitive correctly updates the encoded view and packs the old value into the log.
2. New test: `rollback(state, log, toCursor)` restores all mutations cumulatively, byte-identical to the pre-mutation state.
3. New test: `finalize(scope)` produces a `GameState` whose canonical hash equals the cloning-path hash on the same trajectory (foreshadows ticket 009's invariant).
4. New test: F11 scoped-mutation isolation — original `GameState` is not mutated by scope operations.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. The original `GameState` passed to `createPreviewDriveScope` is never mutated.
2. Undo log entries are append-only; no in-place modification of prior entries.
3. Rollback is O(mutated cells), not O(state size).
4. F1, F8, F10, F11 (scoped exception) preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/encoded-state-mutate.test.ts` — primitive coverage, log packing, rollback correctness.
2. `packages/engine/test/unit/agents/policy-preview-scope.test.ts` — scope lifecycle, finalize canonical-hash equivalence, F11 isolation regression.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-mutate.test.js dist/test/unit/agents/policy-preview-scope.test.js`.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
