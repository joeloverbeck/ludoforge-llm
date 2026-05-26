# 196ROLECONROUTE-004A: P4A prerequisite — allow current-role refs in multi-role constraint validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler validation alignment with already-landed runtime current-candidate constraint semantics
**Deps**: `archive/tickets/196ROLECONROUTE-003.md`

## Problem

`196ROLECONROUTE-004` needs to author constraints on the role currently being bound:

```yaml
transportDestination:
  constraints:
    - { reachable: { from: role.transportOrigin, to: role.transportDestination, via: routeClass.land } }
    - { distinctOriginDestination: { origin: role.transportOrigin, destination: role.transportDestination } }
```

The runtime evaluator already supports this shape. `zoneForRole` in `packages/engine/src/agents/plan-role-constraint-eval.ts` resolves the current candidate binding when the referenced role equals `binding.role`, and resolves prior bindings through `existing`.

The compiler validator does not match that contract. `validatePlanTemplateRoles` in `packages/engine/src/cnl/validate-agent-plan-templates.ts` currently requires every referenced role to be in `boundRoles`, so a constraint on `transportDestination` that references `role.transportDestination` fails with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND`. That makes the FITL route migration impossible as data-only, even though the runtime contract from ticket 003 can evaluate it deterministically and safely.

## Assumption Reassessment (2026-05-26)

1. A failed proof attempt while implementing `196ROLECONROUTE-004` ran:
   `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js`.
2. The build passed, but production spec validation failed on `arvn.trainTransport.roles.transportDestination.constraints.0` and `.1` with `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND`, because both constraints referenced `role.transportDestination`.
3. The runtime evaluator is not the blocker: `zoneForRole` explicitly handles the current role candidate, so the candidate binding can participate in `reachable`, `distinctOriginDestination`, `locatedIn`, and `adjacent` checks.
4. Foundations #12 requires compiler validation to validate all knowable references, but not to reject a current-role reference that runtime can evaluate during candidate binding.
5. Foundations #14 and #15 argue against working around this in FITL data, for example by inventing a separate selector/composite id or reverting to `routePairs`. The correct fix is to align the compiler validator with the runtime contract.

## Architecture Check

1. **Compiler/kernel boundary**: The compiler still rejects unknown roles and references to roles that are declared later than the constrained role. It additionally accepts the current constrained role as available because runtime evaluates constraints with the current candidate binding.
2. **No compatibility shim**: This does not add a fallback authoring shape or a legacy alias. It fixes the validator's model of the existing runtime semantics.
3. **Root-cause completeness**: `196ROLECONROUTE-004` remains a FITL data/test migration. This prerequisite owns the compiler-validation bug that prevents that migration from compiling.
4. **Tests-as-proof**: Add direct validator tests proving current-role refs are accepted for multi-role constraints, while later-role and undeclared-role refs still fail.

## What to Change

### 1. Validator role-reference availability

Update `validatePlanTemplateRoles` in `packages/engine/src/cnl/validate-agent-plan-templates.ts` so a referenced role is valid when:

- it is declared on the template, and
- it is either already present in `boundRoles` or equals the current `roleName`.

Keep the current diagnostic code and wording shape for undeclared or later-bound roles, but make the message precise enough to name the allowed current-role exception if that is clearer.

### 2. Focused CNL validation tests

Extend `packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts` or add a focused sibling test to prove:

- a `reachable` constraint on role `destination` may reference `role.destination` as `to` while referencing an earlier `role.origin` as `from`;
- a `distinctOriginDestination` constraint on role `destination` may reference `role.destination`;
- a `locatedIn` or `adjacent` current-role reference is accepted if test setup can express it without overfitting;
- a constraint referencing a later role still emits `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND`;
- a constraint referencing an undeclared role still emits `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND`.

### 3. Regression guard for FITL route migration

Do not modify FITL data in this ticket. Keep the proof focused on the generic validator contract so `196ROLECONROUTE-004` can migrate FITL after this prerequisite is archived.

## Files to Touch

- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify)
- `packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts` (modify or sibling new test)

## Out of Scope

- FITL `routeGraph` authoring and ARVN Transport template migration — owned by `196ROLECONROUTE-004`.
- Generic bounded post-state role-constraint substrate — owned by `tickets/196ROLECONROUTE-005A.md`.
- Generic control-preservation semantics and FITL migration — owned by `tickets/196ROLECONROUTE-005.md`.
- Loosening role precedence for references to later roles.
- Any selector-source changes, `routePairs` restructuring, or composite target identity migration.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler validation accepts current-role references in role constraints when all non-current referenced roles are already bound.
2. Compiler validation still rejects references to undeclared roles.
3. Compiler validation still rejects references to declared roles that are bound later than the constrained role.
4. Existing focused CNL role-constraint validation tests pass.
5. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-validation.test.js`.

### Invariants

1. Runtime semantics are unchanged.
2. No FITL data changes are included in this prerequisite.
3. The allowed exception is only the constrained role's current candidate binding, not any later role.

## Test Plan

### New/Modified Tests

1. Focused validator test for current-role references in `reachable` and `distinctOriginDestination`.
2. Existing role-precedence violation test remains and is adjusted only if necessary to prove later-role rejection distinctly from current-role acceptance.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-validation.test.js`

## Outcome

Completed: 2026-05-26.
Outcome amended: 2026-05-26.

Implemented so far:

- `packages/engine/src/cnl/validate-agent-plan-templates.ts` now treats a constraint reference as valid when the referenced role is either already bound or is the currently constrained role. Undeclared roles and later-bound roles still emit `CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND`.
- `packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts` now proves current-role references compile for `reachable`, `distinctOriginDestination`, `locatedIn`, and `adjacent`, while later-role and undeclared-role references still fail.

Deferred/out of scope:

- Runtime constraint semantics are unchanged.
- FITL `routeGraph` authoring and ARVN Transport template migration are completed in `archive/tickets/196ROLECONROUTE-004.md`.

Verification:

- `pnpm -F @ludoforge/engine build` — passed after the test was added and after the validator change.
- `node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-validation.test.js` — passed, 7 tests.
- `pnpm -F @ludoforge/engine test` — passed, `171/171 files passed`.
- `pnpm run check:ticket-deps` — passed, 3 active tickets and 2518 archived tickets checked.
- `git diff --check -- packages/engine/src/cnl/validate-agent-plan-templates.ts packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts tickets/196ROLECONROUTE-004A.md` — passed.
- Post-archive `pnpm run check:ticket-deps` — passed, 2 active tickets and 2519 archived tickets checked.
- Post-archive `git diff --check -- packages/engine/src/cnl/validate-agent-plan-templates.ts packages/engine/test/unit/cnl/plan-role-constraint-validation.test.ts archive/tickets/196ROLECONROUTE-004A.md tickets/196ROLECONROUTE-004.md specs/196-generic-role-constraints-and-authored-route-semantics.md` — passed.

Source-size ledger:

- `packages/engine/src/cnl/validate-agent-plan-templates.ts`: 668 lines after change; active growth 0 net lines; below the 800-line cap.
3. `pnpm -F @ludoforge/engine test`
