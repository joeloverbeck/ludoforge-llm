# 205FITLARVSEL-003: P2 — Transport postState origin-control constraint (§4.5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — YAML game-data only
**Deps**: `specs/205-fitl-arvn-selector-cleanup.md`

## Problem

Per spec §4.5, the `arvn.trainTransport.transportOrigin` role at `data/games/fire-in-the-lake/92-agents.md:1982` currently has no constraints (single-line shape `{ selector: arvn.transportOrigin, required: true }`). Origin-control loss is currently enforced only by the score-side `arvn.doNotLoseOriginControlByTransport` guardrail. Add an inline `postState.predicate.condition` constraint that filters candidates whose post-Transport state would lose origin-Control at constraint time, before scoring. This makes the guardrail defense-in-depth instead of the sole enforcement path.

## Assumption Reassessment (2026-06-01)

1. The shipped `postState` constraint shape is `predicate: { condition: { bindings, when } }` — inline conditions, NOT named predicates. Verified at `data/games/fire-in-the-lake/92-agents.md:1990-2019` (`arvn.trainTransport.transportDestination` constraint) and against `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` outcome ("uses generic `postState.predicate.condition` semantics over authored role bindings and token-count predicates").
2. The plan template is `arvn.trainTransport` (not `arvn.transportControl`) at `92-agents.md:1976`.
3. The `transportOrigin` role at `92-agents.md:1982` is authored on one inline-flow line and has no constraints currently.
4. `archive/specs/196-...md` is COMPLETED and shipped the generic `postState.predicate.condition` semantics — no further engine work required for this ticket.
5. `aggregate.op:count.query.tokensInZone` with `zone: { zoneExpr: { ref: binding, name: <name> } }` is the binding-scope authoring shape exercised at lines 2001-2019; this ticket reuses it byte-for-byte.

## Architecture Check

1. Uses only the existing inline-condition surface shipped by Spec 196 — no engine changes, no new authoring construct (Foundation #1, #14, #15).
2. Constraint-time filtering removes the candidate before scoring; the existing `arvn.doNotLoseOriginControlByTransport` guardrail remains as defense-in-depth, preserving spec §2 Non-Goal "No removal of ARVN doctrine."
3. Bounded computation preserved via `maxSteps: 8` matching the existing destination-constraint shape (Foundation #10).
4. The new witness asserts constraint-time filtering, a distinct property from the existing `arvn-transport-refuses-origin-control-loss.test.ts` which exercises the score-side guardrail (Foundation #16 Testing as Proof).

## What to Change

### 1. Add inline postState constraint to `arvn.trainTransport.transportOrigin`

In `data/games/fire-in-the-lake/92-agents.md` at line 1982, expand the inline shape from:

```yaml
transportOrigin: { selector: arvn.transportOrigin, required: true }
```

to the multi-line constraint-bearing form:

```yaml
transportOrigin:
  selector: arvn.transportOrigin
  required: true
  constraints:
    - postState:
        step: transport-destination
        role: role.transportOrigin
        maxSteps: 8
        predicate:
          condition:
            bindings:
              origin: role.transportOrigin
            when:
              op: '>='
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: binding, name: origin } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: binding, name: origin } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
```

Preserve all other fields of `arvn.trainTransport` (lines 1976–2024) verbatim, including the existing `transportDestination` constraints.

### 2. Author the new constraint-time witness

Create `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` with `// @test-class: architectural-invariant`. Witness shape:
- Set up a state where Transport from a marginally-controlled origin would lose origin-Control in the post-state.
- Assert the candidate is rejected at constraint time (visible in the Spec 196 constraint trace event).
- Assert the candidate does not reach scoring (the existing guardrail penalty path is not invoked for this candidate).

Use existing test helpers in `packages/engine/test/policy-profile-quality/arvn-plan-witness-helpers.ts` for state setup.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify) — expand `transportOrigin` role with `constraints` block at line 1982
- `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` (new)

## Out of Scope

- Selector body replacements (§§4.1–4.4, 4.7 — owned by 205FITLARVSEL-002).
- Govern Patronage-availability term (§4.6 — owned by 205FITLARVSEL-004).
- Removing or renaming `arvn.doNotLoseOriginControlByTransport` guardrail.
- Modifying the existing `transportDestination` constraint at lines 1986-2019.
- Any authoring against `preview.role.*` namespace.

## Acceptance Criteria

### Tests That Must Pass

1. New witness `arvn-transport-postState-origin-control-constraint-time.test.ts` asserts constraint-time filtering and passes.
2. Existing `arvn-transport-refuses-origin-control-loss.test.ts` (`@test-class: architectural-invariant`) still passes — the guardrail remains; the constraint pre-filters, the guardrail backs up.
3. All 10 existing ARVN witnesses pass (under distillation rule if trajectory shifts).
4. `pnpm turbo build` succeeds; full engine test suite passes.

### Invariants

1. The `arvn.doNotLoseOriginControlByTransport` guardrail is preserved verbatim (per spec §2 Non-Goals).
2. `maxSteps: 8` matches the destination-constraint bound (Foundation #10).
3. The `predicate.condition` shape is inline; no named-predicate registry assumed (per spec §3 and §4.5 framing).
4. Existing `transportDestination` constraints at 92-agents.md:1986-2019 are unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` (new, `@test-class: architectural-invariant`) — proves constraint-time filtering happens before scoring; cites Spec 196 constraint-trace event observability.

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.js`
3. `node --test dist/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.js`
4. `node --test dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js`
5. `pnpm turbo test`
6. `pnpm turbo lint && pnpm turbo typecheck`
