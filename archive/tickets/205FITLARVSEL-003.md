# 205FITLARVSEL-003: P2 — Transport postState origin-control constraint (§4.5)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test/spec-ticket only; YAML game-data preserved
**Deps**: `specs/205-fitl-arvn-selector-cleanup.md`

## Problem

Per spec §4.5, Transport origin-Control loss must be rejected at role-constraint time, before selector scoring, while preserving the score-side `arvn.doNotLoseOriginControlByTransport` guardrail as defense-in-depth. Live reassessment found the original ticket/spec placement was wrong: attaching a `postState` constraint to `arvn.trainTransport.transportOrigin` while observing `step: transport-destination` cannot work with the shipped Spec 196 observer model. The observed step's role is `transportDestination`, so the existing `arvn.trainTransport.transportDestination` constraint is the Foundation-aligned authoring seam.

## Assumption Reassessment (2026-06-01)

1. The shipped `postState` constraint shape is `predicate: { condition: { bindings, when } }` — inline conditions, NOT named predicates. Verified at `data/games/fire-in-the-lake/92-agents.md:2323-2347` (`arvn.trainTransport.transportDestination` constraint) and against `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` outcome ("uses generic `postState.predicate.condition` semantics over authored role bindings and token-count predicates").
2. The plan template is `arvn.trainTransport` (not `arvn.transportControl`) at `92-agents.md:1976`.
3. The `transportOrigin` role at `92-agents.md:2318` is authored on one inline-flow line and has no constraints currently.
4. `archive/specs/196-...md` is COMPLETED and shipped the generic `postState.predicate.condition` semantics — no further engine work required for this ticket.
5. `aggregate.op:count.query.tokensInZone` with `zone: { zoneExpr: { ref: binding, name: <name> } }` is the binding-scope authoring shape exercised at lines 2333-2347; this ticket preserves it byte-for-byte.

## Foundation-Aligned Boundary Reset (2026-06-02)

User-approved option 2 retargets this ticket from the stale `transportOrigin` authoring shape to the live `transportDestination` `postState` constraint.

1. Spec 196's compiled `postState` observer requires the observed step label and constrained role to match. A literal `transportOrigin` constraint using `step: transport-destination` and `role: role.transportOrigin` would reject candidates as `postStateObserverInsufficient`, not enforce origin-Control.
2. Changing the origin role to observe `role.transportDestination` would introduce role-ordering/cyclic-binding pressure and is not necessary for the invariant.
3. The live destination-side constraint already observes the Transport destination step, binds `origin: role.transportOrigin`, and evaluates the post-Transport COIN-vs-insurgent token count at the origin before candidate scoring.
4. COIN Control in the existing FITL witnesses is strict COIN token majority over insurgent tokens, so the live predicate uses `op: '>'`. The draft `>=` example must not be copied.
5. The active scope is therefore: correct this ticket/spec wording, preserve the existing destination-side YAML constraint, and add a focused witness proving constraint-time origin-Control rejection.

## Architecture Check

1. Uses only the existing inline-condition surface shipped by Spec 196 — no engine changes, no new authoring construct (Foundation #1, #14, #15).
2. Constraint-time filtering removes the candidate before scoring; the existing `arvn.doNotLoseOriginControlByTransport` guardrail remains as defense-in-depth, preserving spec §2 Non-Goal "No removal of ARVN doctrine."
3. Bounded computation preserved via `maxSteps: 8` matching the existing destination-constraint shape (Foundation #10).
4. The new witness asserts constraint-time filtering through the role-constraint evaluator, a distinct property from the existing `arvn-transport-refuses-origin-control-loss.test.ts` structural guardrail/backstop witness (Foundation #16 Testing as Proof).

## What to Change

### 1. Preserve and document the destination-side postState constraint

In `data/games/fire-in-the-lake/92-agents.md`, leave `transportOrigin` as the selector-only role:

```yaml
transportOrigin: { selector: arvn.transportOrigin, required: true }
```

Preserve the existing `arvn.trainTransport.transportDestination` constraints, including:

- `reachable`
- `distinctOriginDestination`
- `notEqual: role.trainSpace`
- `postState` with `step: transport-destination`, `role: role.transportDestination`, `maxSteps: 8`, `bindings.origin: role.transportOrigin`, and strict `op: '>'` COIN-vs-insurgent origin token comparison.

This placement is required by the generic observer semantics: the constraint observes the destination step, then evaluates the post-Transport origin binding.

### 2. Author the new constraint-time witness

Create `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` with `// @test-class: architectural-invariant`. Witness shape:
- Set up a state where Transport from a marginally-controlled origin would lose origin-Control in the post-state.
- Assert the candidate is rejected by the destination role's `postState` constraint with `postStatePredicateFailed`.
- Assert a preserving origin/destination binding passes the same `postState` constraint.
- Assert the origin role has no `postState` constraints, preventing regression to the invalid observer shape.

Use existing production spec helpers and the ARVN action-distribution fixture row already used by the Spec 196 integration witness.

## Files to Touch

- `tickets/205FITLARVSEL-003.md` (modify) — record this Foundation-aligned boundary reset and final proof
- `specs/205-fitl-arvn-selector-cleanup.md` (modify) — correct §4.5 and the ticket list to the destination-side constraint
- `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` (new)

## Out of Scope

- Selector body replacements (§§4.1–4.4, 4.7 — owned by 205FITLARVSEL-002).
- Govern Patronage-availability term (§4.6 — owned by 205FITLARVSEL-004).
- Removing or renaming `arvn.doNotLoseOriginControlByTransport` guardrail.
- Modifying the existing `transportDestination` constraint at lines 2323-2347, except for proof-driven repairs if the witness proves live drift.
- Any authoring against `preview.role.*` namespace.

## Acceptance Criteria

### Tests That Must Pass

1. New witness `arvn-transport-postState-origin-control-constraint-time.test.ts` asserts constraint-time filtering and passes.
2. Existing `arvn-transport-refuses-origin-control-loss.test.ts` (`@test-class: architectural-invariant`) still passes — the guardrail remains; the constraint pre-filters, the guardrail backs up.
3. Existing ARVN policy-profile witnesses pass (under distillation rule if trajectory shifts).
4. `pnpm turbo build` succeeds; full engine test suite passes.

### Invariants

1. The `arvn.doNotLoseOriginControlByTransport` guardrail is preserved verbatim (per spec §2 Non-Goals).
2. `maxSteps: 8` matches the destination-constraint bound (Foundation #10).
3. The `predicate.condition` shape is inline; no named-predicate registry assumed (per spec §3 and §4.5 framing).
4. Existing `transportDestination` constraints at 92-agents.md:2323-2347 are preserved as the authoritative constraint-time enforcement seam.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` (new, `@test-class: architectural-invariant`) — proves constraint-time filtering happens before scoring through the destination role's `postState` role-constraint evaluator.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.js`
3. `node --test packages/engine/dist/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.js`
4. `node --test packages/engine/dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js`
5. `pnpm turbo test`
6. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-06-02.

Retargeted the ticket and spec §4.5 from the invalid origin-role `postState` placement to the live destination-side `arvn.trainTransport.transportDestination` constraint. No `data/games/fire-in-the-lake/92-agents.md` edit was needed: the existing constraint already observes `step: transport-destination`, constrains `role: role.transportDestination`, binds `origin: role.transportOrigin`, preserves `maxSteps: 8`, and uses strict `op: '>'` for COIN Control.

Added `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts`, an architectural invariant that:

1. confirms `transportOrigin` has no `postState` constraint, preventing regression to the invalid observer shape;
2. confirms the destination-side `postState` constraint rejects a Hue origin-Control-losing Transport binding with `postStatePredicateFailed`;
3. confirms a Da Nang preserving binding passes the same `postState` predicate.

Deviation from the original draft: the ticket did not add a `transportOrigin` constraint and did not copy the draft `>=` predicate. That draft shape conflicts with Spec 196 observer semantics and FITL strict COIN-Control semantics, so the Foundation-aligned closeout preserves/proves the existing destination-side constraint instead.

Proof:

1. `pnpm turbo build` — 3 successful tasks.
2. `node --test packages/engine/dist/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.js packages/engine/dist/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.js packages/engine/dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js` — 8 tests passed.
3. `node --test packages/engine/dist/test/policy-profile-quality/*arvn*.test.js packages/engine/dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js packages/engine/dist/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.js` — 31 tests passed across 27 suites.
4. `pnpm turbo lint` — 2 successful tasks.
5. `pnpm turbo typecheck` — 3 successful tasks.
6. `pnpm turbo test` — 5 successful tasks; engine default lane reported `summary 189/189 files passed`.
