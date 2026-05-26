# 199COMAVAROO-001: P1 — Bounded compound-availability probe primitive

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel (new microturn probe primitive)
**Deps**: `specs/199-compound-availability-at-root-proposal.md`

## Problem

The plan proposer (Spec 186 / Spec 190) accepts compound metadata on plan-template roots (`CompiledPlanRoot.compound`) but does not probe at proposal time whether the compound special-activity continuation is currently grantable in the published frontier. The controller discovers unavailability one microturn later via the fallback ladder (`plan-controller.ts:28-76`); the proposal trace records intended coherence the runtime cannot honor. This ticket adds the probe primitive — the bounded, observer-safe kernel function that downstream tickets wire into the proposer (ticket 002) and validate against the controller (ticket 003).

## Assumption Reassessment (2026-05-26)

1. `CompiledPlanRoot.compound` exists inline (no standalone `CompiledPlanCompound` type) at `packages/engine/src/kernel/types-core.ts:1209` — confirmed via the Spec 199 reassessment in this session.
2. Foundation #4 (observer views) — observer scope is encoded by `seatId` + state; there is no first-class `ObserverScope` type to thread through the signature.
3. Existing decision-probe infrastructure (`probeDecisionContinuationAdmissionResult` at `packages/engine/src/kernel/microturn/continuation.ts:80`) provides the bounded error-handler pattern this probe imitates. The new probe colocates with it under `kernel/microturn/`.
4. Grant predicate semantics resolve via action IDs in `accompanyingOps` on `ActionPipelineDef` at `packages/engine/src/kernel/types-operations.ts:29`; helper `canSpecialAccompanyOperation` at `validate-agent-plan-templates.ts:393` and `collectCompoundWitnesses` at line 356 enumerate the `(operationActionId, specialTags)` pairs the probe consults.
5. No existing implementation: `packages/engine/src/kernel/microturn/compound-availability-probe.ts` is absent in the current tree (proposed-new, confirmed in Spec 199 reassessment).

## Architecture Check

1. Pure, deterministic function — same `(def, state, seatId, rootDecision, compound)` produces same `CompoundAvailability`. Foundation #8 (Determinism Is Sacred).
2. Bounded by one microturn lookahead per Foundation #10 — the probe simulates the kernel's grant predicate against the post-root state, no deeper.
3. Observer-safe — consults only seat-visible state per Foundation #4. No first-class `ObserverScope` parameter; `seatId` + state is sufficient.
4. Engine-agnostic — operates on generic `CompiledPlanRoot.compound` metadata, no game-specific identifiers per Foundation #1.
5. No backwards-compat shims (Foundation #14) — this is a net-new primitive; no existing function to alias.
6. Architectural completeness per Foundation #15 — addresses the root cause (proposal-time blindness to compound grantability) rather than patching the symptom (trace overstatement).

## What to Change

### 1. Add `CompoundAvailability` discriminated union

Define at the new module:

```ts
export type CompoundAvailability =
  | { readonly kind: 'ready' }
  | { readonly kind: 'provisional'; readonly reason: 'depth-capped' | 'partial-grant' }
  | { readonly kind: 'unavailable'; readonly reason: 'no-continuation' | 'no-grant-predicate' };
```

This extends the Foundation #20 `PreviewOptionRefStatus` 2-arm pattern (at `packages/engine/src/agents/policy-preview-inner.ts:50`) with a `'provisional'` arm for depth-capped / partial-grant outcomes; the binary ready/unavailable shape cannot express these outcomes, so a third arm is justified.

### 2. Implement `probeCompoundAvailability`

```ts
export function probeCompoundAvailability(
  def: GameDef,
  state: GameState,
  seatId: SeatId,
  rootDecision: Extract<Decision, { readonly kind: 'actionSelection' }>,
  compound: NonNullable<CompiledPlanRoot['compound']>,
): CompoundAvailability;
```

Behavior:
- `ready` — simulating the kernel's grant predicate against the post-root state confirms the next microturn's frontier will include a decision matching `compound.specialTags` + `compound.timing`. Use `canSpecialAccompanyOperation` (at `validate-agent-plan-templates.ts:393`) / `operationAllowsSpecialActivity` (at `apply-move.ts:349`) semantics: the grant predicate resolves via action IDs in `accompanyingOps` on `ActionPipelineDef`.
- `provisional` (`reason: 'depth-capped'`) — grant predicate depends on state branches the probe cannot evaluate at its bounded depth (e.g., RNG outcomes, opponent decisions not yet resolved).
- `provisional` (`reason: 'partial-grant'`) — observer-scoped state insufficient to evaluate the grant predicate fully (per Foundation #4); treated analogously to preview's `hidden` outcome.
- `unavailable` (`reason: 'no-continuation'`) — no grant predicate path exists at any reachable next microturn.
- `unavailable` (`reason: 'no-grant-predicate'`) — the action's pipeline declares no `accompanyingOps` matching the compound's tags.

Pattern after `probeDecisionContinuationAdmissionResult` at `kernel/microturn/continuation.ts:80` for the bounded error-handler shape.

### 3. Export from kernel surface

Add the new module's exports (`CompoundAvailability` type, `probeCompoundAvailability` function) to the appropriate kernel barrel index so `agents/plan-proposal.ts` (ticket 002) can import them. Verify the exact barrel path during implementation (typically `packages/engine/src/kernel/index.ts` or a subsystem-level re-export).

## Files to Touch

- `packages/engine/src/kernel/microturn/compound-availability-probe.ts` (new)
- Kernel barrel re-export point (modify — verify exact path during implementation)

## Out of Scope

- Wiring the probe into the plan proposer — owned by ticket 002.
- Tests for probe purity, predict-fallback correspondence, tiebreaker behavior, trace integrity, and the FITL convergence witness — owned by ticket 003 (the spec bundles all P3 tests in one ticket).
- Compile-time grant-vocabulary check (P4) — owned by ticket 004.
- Probing compound continuations more than one microturn deep — Spec §2 Non-Goals.

## Acceptance Criteria

### Tests That Must Pass

1. Existing engine suite passes after the probe is added: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.
2. Existing determinism corpus byte-identical: `pnpm turbo test --filter=engine`.
3. Typecheck clean: `pnpm turbo typecheck`.

### Invariants

1. `probeCompoundAvailability` is pure — same `(def, state, seatId, rootDecision, compound)` inputs produce same `CompoundAvailability` output (Foundation #8).
2. Probe consults only seat-visible state — Foundation #4. No opponent-private state leaks through the return value.
3. Probe bounded by one microturn lookahead — Foundation #10. No deeper exploration.
4. No game-specific identifier branches inside the probe — Foundation #1.

## Test Plan

### New/Modified Tests

The probe-purity test lives in ticket 003 per the spec's P3 bundling of all architectural-invariant tests. This ticket adds source only; ticket 003 adds its tests.

### Commands

1. `pnpm -F @ludoforge/engine typecheck` — confirm new type is correctly exported.
2. `pnpm -F @ludoforge/engine build` — ensure compile succeeds.
3. `pnpm turbo test --filter=engine` — full engine suite (no behavioral changes expected from this ticket alone).

## Outcome

Completed: 2026-05-26

What changed:
- Added `packages/engine/src/kernel/microturn/compound-availability-probe.ts` with the exported `CompoundAvailability` union and `probeCompoundAvailability` primitive.
- Exported the probe module from `packages/engine/src/kernel/index.ts` for downstream proposer integration in `archive/tickets/199COMAVAROO-002.md`.

Deviations from original plan:
- The runtime implementation does not import `canSpecialAccompanyOperation` from `packages/engine/src/cnl/validate-agent-plan-templates.ts` because that helper is compiler-private. The probe instead derives the same generic action/pipeline relationship from kernel-owned `GameDef.actions`, action tags/ids, and `ActionPipelineDef.accompanyingOps`.
- The literal command `pnpm turbo test --filter=engine` is stale for this workspace (`turbo` reports no package named `engine`). The proof used the repo-local package lane `pnpm -F @ludoforge/engine test`, which includes schema artifact checks and the engine default test lane.

Verification:
- `pnpm -F @ludoforge/engine typecheck` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm turbo test --filter=engine` — failed as stale command before running tests (`No package found with name 'engine'`); replaced by the package-local lane below.
- `pnpm -F @ludoforge/engine test` — passed; final summary `176/176 files passed`.

Source-size ledger:
- `packages/engine/src/kernel/microturn/compound-availability-probe.ts` is 125 lines; no source-size cap trigger.
