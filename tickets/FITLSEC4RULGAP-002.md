# FITLSEC4RULGAP-002: Transport Ranger Flip — Unconditional and Map-Wide

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46, FITLSEC4RULGAP-001

## Problem

Rule 4.3.2: "Then flip all Rangers anywhere on the map to Underground."

The `transport-profile` `flip-rangers-underground` stage has two bugs:

1. **Conditional on capability**: Wrapped in `if: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }`. Per the rules, flipping Rangers underground is unconditional — it always happens after Transport movement regardless of Armored Cavalry state.
2. **Scoped to destination only**: Queries `zone: $transportDestination` — only Rangers at the destination are flipped. The rules say "anywhere on the map" — ALL ARVN Rangers everywhere must be flipped Underground.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~4105-4119 contain the `flip-rangers-underground` stage with the capability conditional and single-zone query.
2. The kernel supports `mapSpaces` query for iterating all map zones, as used elsewhere in the FITL spec (e.g., Patrol multi-hop).
3. Existing Transport tests in `fitl-capabilities-transport-govern-ambush-terror.test.ts` test shaded-branch Transport effects; they may assert the conditional. These must be updated.
4. FITLSEC4RULGAP-001 must land first since it fixes the piece filter in the same profile — both changes are to the same `transport-profile` block.

## Architecture Check

1. Pure YAML data correction — removes an erroneous capability gate and broadens the zone query scope.
2. Uses existing DSL primitives (`forEach` over `mapSpaces`, nested `tokensInZone` query with filter). No new kernel features needed.
3. No backwards-compatibility shim introduced.

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

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — Transport `flip-rangers-underground` stage, ~lines 4105-4119)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — add/update flip-rangers structural assertions)
- `packages/engine/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts` (modify — update any assertions that assumed flip was conditional on capability)

## Out of Scope

- Transport piece selection filter — covered by FITLSEC4RULGAP-001.
- The `cap-armored-cavalry-unshaded-assault` stage (line 4120+) — separate concern.
- Any kernel/compiler source code.
- Other profiles or special activities.

## Acceptance Criteria

### Tests That Must Pass

1. New/updated test: `flip-rangers-underground` stage has NO `if` / `when` condition referencing `cap_armoredCavalry`.
2. New/updated test: `flip-rangers-underground` iterates over `mapSpaces` (or equivalent global query), not a single zone binding.
3. Existing capability tests updated if they previously asserted the conditional flip behavior.
4. `pnpm turbo build`
5. `pnpm -F @ludoforge/engine test`

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
