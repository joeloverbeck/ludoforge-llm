# 196ROLECONROUTE-003: P3 — Runtime constraint evaluation and constraintsSatisfied contract restructure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/plan-proposal.ts` fail-closed registered-kind branches replaced with per-kind runtime branches for `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`
**Deps**: `archive/tickets/196ROLECONROUTE-002.md`

## Problem

Tickets 001 and 002 land the compile-time surface for the four new/restructured role-constraint kinds and the `routeGraph` data asset that `reachable`/`adjacent` depend on. Ticket 001 also made the minimal `agents/plan-proposal.ts` type-fallout change needed after widening the compiled union: role ordering no longer assumes every constraint has a single `role` field, and registered but runtime-unimplemented kinds fail closed if they reach evaluation. The runtime evaluator still admits only `notEqual` semantics — any constraint reaching it with kind `locatedIn`, `distinctOriginDestination`, `reachable`, or `adjacent` throws until this ticket replaces the fail-closed branches with real semantics.

This ticket implements the runtime evaluator branches and preserves the P1 type-fallout cleanup: each new-kind branch resolves its own role refs independently rather than relying on a notEqual-shaped `constraint.role` contract.

## Assumption Reassessment (2026-05-26)

1. `constraintsSatisfied` now keeps the `existing[constraint.role]` lookup inside the `notEqual` branch and throws for registered but runtime-unimplemented kinds. This is the P1 type-fallout guard; the ticket still owns replacing those throws with real per-kind evaluators.
2. Role precedence (Spec 191 P1) already guarantees that every role referenced by a constraint is bound before evaluation, so the new branches can directly access `existing[<roleRef>]` without revalidating boundness.
3. The runtime needs access to the `RouteGraphProvider` (from ticket 002) for `reachable` and `adjacent`. The provider is constructed at GameDef-compile time and must be available to `constraintsSatisfied` — either via the `ProposeAdvisoryTurnPlanInput` (which already carries `profile`, `state`, etc.) or via the compiled `GameDef` accessible at this call site. The implementation chooses the route already used to expose other GameDef-derived providers to plan proposal (verify at implementation time and document in the assumption reassessment if the route differs from this assumption).
4. `locatedIn` with `container: zone.X` needs `state.tokenPositions[<role-binding-target>]` to read the bound role's current zone and compare against the literal zone ref. `locatedIn` with `container: role.Y` needs to read the zone of role Y's binding and compare. Both reads are observer-safe state available to the proposer.
5. `distinctOriginDestination` compares the zones (not the selectedIds) of two bound role bindings — the spec wording is "origin.zone ≠ destination.zone" (§4.1). For role targets that *are* zones, this is the binding id directly; for non-zone targets (e.g., tokens with positions), the zone is derived from `state.tokenPositions[<binding-target>]`.
6. All evaluators must be pure functions of `(state, roleBindings, constraint)` — no side effects, no hidden-state reads (spec §4.3).

## Architecture Check

1. **Single source of truth via registry remains intact**: The new branches dispatch on `constraint.kind`; the trailing unsupported-kind throw and `_exhaustive: never` exhaustiveness assertion are preserved. Adding a future kind without a runtime branch still fails compilation (the `never` assertion) and runtime (the throw) — Foundation 14.
2. **Contract change is internal, signature stable**: `constraintsSatisfied(binding, constraints, existing) -> boolean` is unchanged externally until this ticket threads the state and route-graph provider inputs required by runtime semantics. The notEqual-specific early-return has already been isolated by P1; each new-kind branch must now handle its own role-ref resolution.
3. **Pure functions, no side effects (Foundation 11)**: Each branch reads `state`, `roleBindings`, and `constraint`; returns a boolean. No mutation of state or bindings.
4. **Observer-safe state reads (Foundation 4)**: `locatedIn` reads `state.tokenPositions` and zone bindings — both already accessible to the proposer at its observer scope. `reachable`/`adjacent` consult the `RouteGraphProvider`, which is GameDef-derived public data (private route graphs are explicitly out of scope per spec §11).
5. **Hop-bounded reachable (Foundation 10)**: `reachable` defers to `RouteGraphProvider.reachable(from, to, via, maxHops)`, which is hop-bounded by either the constraint's `maxHops` or the provider's `defaultMaxHops`. No unbounded BFS surface here.
6. **Determinism preserved (Foundation 8)**: All branches are pure boolean reductions over deterministic state and deterministic provider queries.

## What to Change

### 1. Restructure `constraintsSatisfied` (`packages/engine/src/agents/plan-proposal.ts:426-444`)

Replace the current fail-closed registered-kind path with per-kind dispatch:

```ts
function constraintsSatisfied(
  binding: PlanRoleBinding,
  constraints: CompiledPlanTemplate['roles'][string]['constraints'],
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
  routeGraph: RouteGraphProvider | null,
): boolean {
  return constraints.every((constraint) => {
    switch (constraint.kind) {
      case 'notEqual': {
        const other = existing[constraint.role];
        if (other === undefined) {
          return true;
        }
        return binding.selectedId !== other.selectedId;
      }
      case 'locatedIn': {
        return evaluateLocatedIn(binding, constraint, existing, state);
      }
      case 'distinctOriginDestination': {
        return evaluateDistinctOriginDestination(constraint, existing, state);
      }
      case 'reachable': {
        if (routeGraph === null) {
          throw new Error('reachable constraint reached runtime evaluation without a compiled RouteGraphProvider.');
        }
        return evaluateReachable(constraint, existing, state, routeGraph);
      }
      case 'adjacent': {
        if (routeGraph === null) {
          throw new Error('adjacent constraint reached runtime evaluation without a compiled RouteGraphProvider.');
        }
        return evaluateAdjacent(constraint, existing, state, routeGraph);
      }
      default: {
        if (!isSupportedPlanRoleConstraintKind((constraint as { kind: string }).kind)) {
          throw new Error(`Unsupported plan role constraint kind "${(constraint as { kind: string }).kind}" reached runtime evaluation.`);
        }
        const _exhaustive: never = constraint;
        return _exhaustive;
      }
    }
  });
}
```

Update the call site (existing `selectRoleBinding` caller at `plan-proposal.ts:333` per the reassessment) to pass `state` and the GameDef-resident `RouteGraphProvider` (or `null` if the GameDef has no `routeGraph` data asset — the compile-time validator from ticket 002 already rejects `reachable`/`adjacent` constraints without a routeGraph, so a `null` provider is unreachable for those kinds but defensive). Preserve the P1 `orderedPlanRoles` behavior unless the new runtime semantics require a narrower helper.

### 2. Per-kind evaluator helpers

Define `evaluateLocatedIn`, `evaluateDistinctOriginDestination`, `evaluateReachable`, and `evaluateAdjacent` as private functions in `plan-proposal.ts` (or extract to a sibling module if `plan-proposal.ts` grows beyond comfortable size; choose at implementation time based on existing file length):

- **`evaluateLocatedIn(binding, constraint, existing, state)`**: Read the bound target's zone from `state.tokenPositions[<binding-target-id>]` (or the binding's `selectedId` if the role target is itself a zone). If `constraint.container` is `zone.<id>` (literal zone), compare against that zone id. If `constraint.container` is `role.<otherRole>`, read the zone of `existing[<otherRole>]` similarly and compare.
- **`evaluateDistinctOriginDestination(constraint, existing, state)`**: Read zones of `existing[constraint.origin]` and `existing[constraint.destination]` (via the same zone-derivation logic as `locatedIn`). Return `origin.zone !== destination.zone`.
- **`evaluateReachable(constraint, existing, state, routeGraph)`**: Read zones of `existing[constraint.from]` and `existing[constraint.to]`. Call `routeGraph.reachable(fromZone, toZone, constraint.via, constraint.maxHops)`.
- **`evaluateAdjacent(constraint, existing, state, routeGraph)`**: Read zones of `existing[constraint.a]` and `existing[constraint.b]`. Call `routeGraph.adjacent(aZone, bZone)`. (Optional `via` is not part of the `adjacent` kind's payload per ticket 001's compiled shape — verify and only add if the union variant includes it.)

Factor the zone-derivation helper (binding → zone) once; it is used by every new-kind evaluator.

### 3. Tests

New architectural-invariant tests covering each new kind: each constraint, when violated, removes the candidate from the role-binding result set; when satisfied, includes it. Use existing plan-proposal fixture infrastructure to build minimal `(profile, state, existing-bindings)` configurations per kind.

Specifically:

- `notEqual` already covered by ticket 001's compile tests + existing runtime; this ticket's tests must not regress the `notEqual` path.
- `locatedIn` (literal zone container): bound target in matching zone → admitted; in other zone → rejected.
- `locatedIn` (role container): bound target's zone matches other-role's zone → admitted; differs → rejected.
- `distinctOriginDestination`: origin zone ≠ destination zone → admitted; equal → rejected.
- `reachable`: route exists within `maxHops` → admitted; route exceeds hop cap or absent → rejected.
- `adjacent`: zones adjacent in graph → admitted; not adjacent → rejected.

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify) — `constraintsSatisfied` restructure (`:426-444`); per-kind helper definitions; call-site update at `:333` to thread `state` + `RouteGraphProvider`
- `packages/engine/test/unit/agents/plan-role-constraint-runtime.test.ts` (new) — per-kind admit/reject tests
- (Optional) `packages/engine/src/agents/plan-role-constraint-eval.ts` (new) — extract helpers if `plan-proposal.ts` grows beyond comfortable file size at implementation time

## Out of Scope

- **FITL profile migration** — owned by ticket 004. This ticket exercises the new kinds against synthetic fixtures only; real-game authoring is the next phase.
- **Compile-time changes** — owned by tickets 001 and 002. The validator and lowering are already complete by the time this ticket runs.
- **`RouteGraphProvider` implementation** — owned by ticket 002. This ticket only consumes the provider.
- **Plan-trace golden replay across the new kinds** — verified at this ticket via existing replay-identity infrastructure (no new golden traces authored here); FITL convergence witness lands in ticket 004.

## Acceptance Criteria

### Tests That Must Pass

1. Each of the four new-kind runtime evaluators returns the correct boolean (admit / reject) across a fixture matrix of `(state, existing-bindings, constraint payload)` cases, per the test list above.
2. A constraint with `kind: 'notEqual'` still returns the existing semantics — `notEqual` regression is the canary.
3. A constraint with `kind: 'reachable'` or `kind: 'adjacent'` reaching `constraintsSatisfied` with `routeGraph === null` throws (defensive — compile-time validator from ticket 002 makes this unreachable in well-formed GameDefs, but the runtime contract enforces it).
4. Plan-trace replay byte-identical across two runs with the same GameDef + seed + actions (Foundation 8 + 16).
5. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. `constraintsSatisfied` remains a pure function of `(binding, constraints, existing, state, routeGraph)` — no side effects, no hidden-state reads (Foundation 11).
2. Exhaustiveness: the `_exhaustive: never` assertion at the dispatch tail still type-errors if a future kind is added to `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` (and the union) without a runtime branch — this guarantees registry/runtime drift fails compilation.
3. Determinism: identical inputs produce identical boolean outputs across runs (Foundation 8).
4. `reachable` BFS depth is bounded by the constraint's `maxHops` or the provider's `defaultMaxHops` — never unbounded (Foundation 10).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-role-constraint-runtime.test.ts` (new) — architectural-invariant. Per-kind admit/reject matrix, regression of `notEqual`, defensive `reachable`-without-routeGraph throw.

Existing plan-proposal tests continue to pass.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/plan-role-constraint-runtime.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/plan-proposal.test.js` — regression for existing plan-proposal tests
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
