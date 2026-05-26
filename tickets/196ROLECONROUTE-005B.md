# 196ROLECONROUTE-005B: Prerequisite — Generic compound post-state role-constraint probe materialization

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic production post-state probe materialization for compound action and chooseN decision params
**Deps**: `archive/tickets/196ROLECONROUTE-005A.md`

## Problem

`tickets/196ROLECONROUTE-005.md` needs FITL Train+Transport origin-control preservation to be enforced by role-constraint admissibility. A 2026-05-26 Foundations reassessment found that the generic `postState` substrate from `archive/tickets/196ROLECONROUTE-005A.md` can apply a simple role-bound decision, but it cannot yet materialize the full production move shape for an operation plus compound special activity when earlier steps include `chooseNStep` operation params and later steps include special-activity params.

Without that generic probe materialization, a post-state predicate can reject origin-control-losing Transport candidates, but it cannot prove that preserving Train+Transport candidates remain admitted and executable. Importing test-helper normalization into production would be an architectural shortcut; this ticket adds the production substrate explicitly.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/src/agents/plan-role-constraint-eval.ts` currently probes `postState` by binding one step into a root move and calling `applyMove`.
2. FITL `arvn.trainTransport` is a compound template: Train owns an operation `chooseNStep` param and Transport owns compound special-activity params (`$transportOrigin`, `$transportDestination`).
3. `packages/engine/test/helpers/decision-param-helpers.ts` has test-only normalization helpers for concrete move execution, but production role-constraint evaluation must not depend on test helpers.
4. The missing substrate is generic decision-param materialization for post-state probes, not FITL-specific control logic. The implementation must not add ARVN/FITL branches.

## Architecture Check

1. **Generic probe materialization**: The implementation should derive a candidate move from compiled plan steps, action tags, decision kinds, and role bindings. It must remain game-agnostic and work for any authored compound template with the same generic shape.
2. **One rules protocol**: The materialized probe must use the same `applyMove` validation path as normal execution; it must not construct a separate legality evaluator.
3. **Bounded evaluation**: Probe materialization must stay bounded by the existing `postState.maxSteps` and compiled plan metadata.
4. **No test-helper dependency**: Shared logic can be extracted if appropriate, but production code cannot import from `packages/engine/test`.

## What to Change

### 1. Generic post-state probe move materialization

Extend the production post-state role-constraint probe path so it can materialize all role-bound params needed up to the constrained step, including:

- operation `chooseNStep` params as bounded selected arrays;
- direct `chooseOne` params;
- compound special-activity params;
- compound timing metadata from the compiled plan root.

### 2. Runtime integration

Thread any needed plan-root/action-decision metadata into `PostStateConstraintContext` from `plan-proposal.ts` without introducing game-specific branches.

### 3. Focused tests

Add or extend runtime tests that prove:

- a compound post-state probe materializes operation and special-activity params generically;
- invalid or incomplete materialization fails closed;
- the probe remains deterministic for repeated identical inputs.

## Files to Touch

- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify)
- `packages/engine/src/agents/plan-proposal.ts` (modify)
- `packages/engine/test/unit/agents/<focused-post-state-compound-probe-test>.test.ts` (new or modify)
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (modify or extend only if needed to prove the generic substrate with production FITL data)

## Out of Scope

- Adding the concrete FITL origin-control-preservation predicate to `92-agents.md`; that remains with `tickets/196ROLECONROUTE-005.md`.
- Adding FITL-specific control, ARVN, or Transport branches to engine/compiler code.
- Changing routeGraph, routePairs identity, or weighted route costs.

## Acceptance Criteria

### Tests That Must Pass

1. Runtime post-state probes can materialize a generic operation plus compound special-activity move from role-bound plan steps.
2. Incomplete or invalid probe materialization fails closed without publishing legal-but-bad role bindings.
3. A FITL Train+Transport preserving candidate can be probed without relying on test-only decision-param helpers.
4. Existing focused post-state runtime tests still pass.
5. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific identifier or branch enters engine/compiler code.
2. Probe materialization uses the same `applyMove` path as normal execution.
3. Probe execution remains bounded and deterministic.

## Test Plan

### New/Modified Tests

1. Focused runtime tests for compound post-state probe materialization.
2. Focused FITL integration witness if needed to prove the production data path can materialize Train+Transport.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <focused dist test paths>`
2. `pnpm -F @ludoforge/engine test`
