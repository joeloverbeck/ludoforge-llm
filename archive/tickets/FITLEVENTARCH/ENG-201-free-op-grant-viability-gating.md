# ENG-201: Free-Operation Grant Viability Gating

**Status**: COMPLETED (2026-03-08)
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn-flow legality/event execution surfaces
**Deps**: specs/29-fitl-event-card-encoding.md, packages/engine/src/kernel/event-execution.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/legal-moves-turn-order.ts

## Problem

Event sides can enqueue free-operation grants that are structurally valid but unusable in the current state (for example due to `zoneFilter` or unresolved move feasibility). This weakens event playability semantics and creates brittle downstream behavior for mandatory chains.

## Assumption Reassessment (2026-03-08)

1. Current event execution unconditionally collects grants from side/branch (`collectFreeOperationGrants`) and emits them into pending runtime state.
2. Current grant authorization is checked only when a free operation is attempted (`doesGrantAuthorizeMove`/`analyzeFreeOperationGrantMatch`), not before event-side selection.
3. Current legal move discovery does probe free-operation viability for already-pending grants, but event-side playability never uses that signal before grant emission.
4. Verified discrepancy in existing coverage: `fitl-events-ia-drang.test.ts` contains a test titled "emits no free-operation grants" while asserting `grants.length === 3`. The title/assertion pair is stale and must be aligned when viability policy is introduced.
5. Mismatch: cards that need “usable free grant availability” at event-play time cannot be expressed cleanly. Correction: add explicit viability policy to grant emission/playability rather than relying on post-hoc denials.

## Architecture Check

1. A declarative viability policy on grant definitions is cleaner than game-specific event-side preconditions because it centralizes grant semantics in the generic turn-flow layer.
2. Policy remains game-agnostic: FITL and future games can opt in through `GameSpecDoc` grant metadata; no game-specific branch in kernel.
3. No backwards-compatibility aliasing/shims: add one canonical policy field and validate it strictly.
4. Reuse existing grant-match/discovery primitives where possible (no parallel "second" viability engine) to keep behavior coherent across issuance, legal-move discovery, and final move validation.

## What to Change

### 1. Add grant viability policy in schema/types

Add a grant-level field (for example `viabilityPolicy`) with explicit modes such as:
- `emitAlways` (current behavior)
- `requireUsableAtIssue` (grant only emitted if at least one legal free move exists)
- `requireUsableForEventPlay` (event side/branch is illegal if the grant cannot be issued as usable)

### 2. Implement generic viability probe

At event play/discovery time, evaluate candidate grants against current state and seat context using generic move probing with zone-filter-safe policy. Prefer reusing existing grant analysis/discovery paths over bespoke game/card logic.

### 3. Wire legal-moves event filtering

When side/branch includes grants with strict viability policy, suppress event side from legal moves if policy fails.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify only if required to expose/reuse existing probe helper)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify only if additional semantic diagnostics are needed beyond schema validation)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)

## Out of Scope

- Binding one grant step to a specific space selected by an earlier step.
- Per-action “must affect board state” semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Event side with `requireUsableForEventPlay` grant is absent from legal moves when no usable free move exists.
2. Event side with `requireUsableAtIssue` emits only usable grants and skips unusable ones deterministically.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Viability policy behavior is fully data-driven from `GameSpecDoc` and does not branch by game id/card id in kernel.
2. Grant viability probing does not throw unresolved-binding errors during legal-move discovery.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add policy-mode coverage for playability/issuance.
2. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` — align stale test title/assertions with viability-policy behavior (no contradictory "emits no grants" naming vs assertion).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`

## Outcome

Implemented:
1. Added canonical `viabilityPolicy` on event-card `freeOperationGrants` (`emitAlways`, `requireUsableAtIssue`, `requireUsableForEventPlay`) in kernel types + schema surfaces.
2. Added generic grant-viability probing in turn-flow eligibility using existing free-operation discovery/decision-sequence logic (no game-specific branching).
3. Enforced policy at both layers:
   - Event playability filtering (`requireUsableForEventPlay` suppresses unusable event moves in legal discovery).
   - Grant emission (`requireUsableAtIssue` drops unusable grants deterministically at issuance time).
4. Updated integration coverage in:
   - `fitl-event-free-operation-grants.test.ts` (new policy-mode tests).
   - `fitl-events-ia-drang.test.ts` (replaced stale contradictory assertion with strict viability-policy expectation).

Changed from original plan:
1. `packages/engine/src/kernel/legal-moves.ts` was not modified; policy enforcement was cleanly contained in `legal-moves-turn-order.ts` + `turn-flow-eligibility.ts`.
2. `packages/engine/src/kernel/event-execution.ts` and `packages/engine/src/kernel/validate-gamedef-behavior.ts` were not modified; schema/type + turn-flow wiring covered the required behavior without adding duplicate validation paths.
