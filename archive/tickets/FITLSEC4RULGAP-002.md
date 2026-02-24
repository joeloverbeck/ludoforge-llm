# FITLSEC4RULGAP-002: Transport Ranger Flip — Unconditional and Map-Wide

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46

## Problem

Rule 4.3.2: "Then flip all Rangers anywhere on the map to Underground."

The `transport-profile` `flip-rangers-underground` stage has two bugs:

1. **Conditional on capability**: Wrapped in `if: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }`. Per the rules, flipping Rangers underground is unconditional — it always happens after Transport movement regardless of Armored Cavalry state.
2. **Scoped to destination only**: Queries `zone: $transportDestination` — only Rangers at the destination are flipped. The rules say "anywhere on the map" — ALL ARVN Rangers everywhere must be flipped Underground.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~4105-4119 contain the `flip-rangers-underground` stage with the capability conditional and single-zone query.
2. The kernel supports `mapSpaces` query for iterating all map zones, as used elsewhere in the FITL spec (e.g., Patrol multi-hop).
3. Existing Transport tests in `fitl-capabilities-transport-govern-ambush-terror.test.ts` and `fitl-us-arvn-special-activities.test.ts` currently assert shaded-only or destination-only Ranger flip behavior and must be updated.
4. `FITLSEC4RULGAP-001` is no longer an active ticket in `tickets/`, and the movement eligibility fix is already present in production data via `ARVNTransportEligibleTypes`; this ticket can proceed independently.

## Architecture Check

1. Pure YAML data correction — removes an erroneous capability gate and broadens the zone query scope.
2. Uses existing DSL primitives (`forEach` over `mapSpaces`, nested `tokensInZone` query with filter). No new kernel features needed.
3. Preferred architecture is rule-accurate and capability-decoupled: Transport's Ranger flip must be modeled as unconditional SA resolution, not as a capability side-effect.
4. No backwards-compatibility shim introduced.

## What to Change

### 1. Remove capability conditional from flip stage

In `data/games/fire-in-the-lake/30-rules-actions.md`, `transport-profile`, `flip-rangers-underground` stage:

Remove the `if` wrapper so the flip is unconditional.

### 2. Broaden zone scope to all map spaces

Replace the `tokensInZone` query targeting `$transportDestination` with a `forEach` over `mapSpaces` containing a nested `tokensInZone` query:

```yaml
- stage: flip-rangers-underground
  effects:
    - forEach:
        bind: $space
        over: { query: mapSpaces }
        effects:
          - forEach:
              bind: $ranger
              over:
                query: tokensInZone
                zone: $space
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: guerrilla }
              effects:
                - setTokenProp: { token: $ranger, prop: activity, value: underground }
```

The implementer should verify the exact query syntax available. If a global token query exists (e.g., `allTokens` with filter), prefer that for simplicity.

### 3. Update tests

Update or add tests asserting:
- The flip stage has no capability conditional.
- The flip stage queries all map spaces (not just `$transportDestination`).
- Runtime behavior flips Rangers map-wide regardless of `cap_armoredCavalry` marker side.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — Transport `flip-rangers-underground` stage, ~lines 4105-4119)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — add/update flip-rangers structural assertions)
- `packages/engine/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts` (modify — update any assertions that assumed flip was conditional on capability)

## Out of Scope

- Transport piece selection filter — covered by FITLSEC4RULGAP-001.
- The `cap-armored-cavalry-unshaded-assault` stage (line 4120+) — separate concern.
- Any kernel/compiler source code.
- Other profiles or special activities.

Note: The first out-of-scope item is already implemented in production data through `ARVNTransportEligibleTypes`; no new work is needed for that here.

## Acceptance Criteria

### Tests That Must Pass

1. New/updated test: `flip-rangers-underground` stage has NO `if` / `when` condition referencing `cap_armoredCavalry`.
2. New/updated test: `flip-rangers-underground` iterates over `mapSpaces` (or equivalent global query), not a single zone binding.
3. Existing capability tests updated if they previously asserted conditional or shaded-only flip behavior.
4. Existing ARVN SA integration tests updated if they previously asserted destination-only flip behavior.
5. `pnpm turbo build`
6. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. Rangers already Underground remain Underground (no-op, no error).
3. The `cap-armored-cavalry-unshaded-assault` stage still functions correctly.
4. Texas Hold'em compilation tests still pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` — assert flip stage is unconditional and map-wide.
2. `packages/engine/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts` — update any assertions that assumed conditional flip.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-capabilities-transport-govern-ambush-terror.test.ts`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Updated `transport-profile` `flip-rangers-underground` to remove `cap_armoredCavalry` conditional gating.
  - Changed flip scope from `$transportDestination` only to a `forEach` over `mapSpaces` with per-space Ranger flips.
  - Updated integration tests to assert unconditional/map-wide flip behavior and removed shaded-only Transport flip assumptions.
- **Deviations from original plan**:
  - Reassessment found dependency on `FITLSEC4RULGAP-001` was stale; this ticket was completed independently because `ARVNTransportEligibleTypes` was already in place.
  - Targeted execution used direct `node --test` against built files after `pnpm turbo build` for deterministic filtering.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed (270/270).
  - `pnpm turbo test` passed (engine + runner).
  - `pnpm turbo lint` passed.
