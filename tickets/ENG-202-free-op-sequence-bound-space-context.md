# ENG-202: Free-Operation Sequence Bound Space Context

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — turn-flow runtime grant sequencing and zone-filter evaluation
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/free-operation-zone-filter-probe.ts

## Problem

Current free-operation chains enforce step order but cannot bind a later step to the concrete space selected in an earlier step. This prevents exact encoding of “then Sweep and Assault there” semantics in a generic, declarative way.

## Assumption Reassessment (2026-03-08)

1. Current sequence support (`sequence.chain`/`sequence.step`) only controls ordering and does not persist contextual selections.
2. Current `zoneFilter` evaluation can rebind aliases to candidate zones but has no persisted sequence context from earlier consumed grants.
3. Mismatch: cards needing “same location as prior step” constraints cannot be modeled exactly. Correction: introduce explicit sequence context capture and reuse.

## Architecture Check

1. A generic sequence-context mechanism is cleaner than card-specific special-case runtime hooks.
2. Captured context is runtime state keyed by grant sequence/batch and referenced declaratively by grant metadata, preserving engine agnosticism.
3. No compatibility shims: add one canonical context model and strict validation.

## What to Change

### 1. Add sequence context capture/reference fields

Extend `EventFreeOperationGrantDef` with fields like:
- capture selected zone from consumed move (for example from resolved action zone candidates)
- require later grants to match captured zone(s)

### 2. Persist context in turn-flow runtime

Store sequence context alongside pending grants (for example keyed by `sequenceBatchId`) and clear when chain completes/expires.

### 3. Enforce context in grant authorization

Augment `doesGrantAuthorizeMove`/zone-filter probe so later grants are legal only when move zone selection matches captured context.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Action-level non-noop/effectful requirements.
- Event side playability gating beyond grant viability policies.

## Acceptance Criteria

### Tests That Must Pass

1. A chained grant can capture selected zone from step N and requires step N+1 move zone to match.
2. Cross-zone free move for later step is denied with explicit grant/block reason.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Sequence context is generic and does not encode FITL-specific ids or zone names.
2. Context lifecycle is deterministic and fully cleared when sequence completes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add sequence-context capture/reuse/clear tests.
2. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` — validate Sweep/Assault constrained to Air Lift context space.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
