# Spec 45: FITL Section 3 Rules Gaps

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 26 (operations), Spec 27 (SAs)
**Estimated effort**: 2-3 days
**Source sections**: Rules Section 3 gap analysis (`reports/fire-in-the-lake-rules-section-3.md`)

## Overview

Gap analysis of FITL Rules Section 3 against the current game data (`data/games/fire-in-the-lake/`) identified 3 potential gaps. One (stacking constraints) is already implemented. This spec addresses the remaining 2 gaps across 3 tickets.

All changes are **data-only YAML** in GameSpecDoc files under `data/games/fire-in-the-lake/`. No engine or kernel code changes.

## Gap Analysis Summary

| # | Gap | Rule | Status | Action |
|---|-----|------|--------|--------|
| 1 | Patrol multi-hop cube movement | 3.2.2 | Missing | FITLSEC3-001 |
| 2 | ARVN multi-space affordability gating | 3.0 | Missing | FITLSEC3-002 |
| 3 | NVA/VC multi-space affordability gating | 3.0 | Missing | FITLSEC3-003 |
| 4 | Stacking constraints via kernel | 1.4.2 | Already done | None |

**Gap 4 is resolved**: `40-content-data-assets.md:861-887` already encodes `stackingConstraints` with `max-2-bases-per-space`, `no-bases-on-locs`, and `north-vietnam-insurgent-only`.

## Scope

### In Scope

- Patrol multi-hop cube sourcing for US and ARVN profiles
- Resource-based `chooseN.max` clamping for ARVN Sweep and Assault
- Resource-based `chooseN.max` clamping for NVA/VC Rally, March, Attack, Terror (where applicable)

### Out of Scope

- Kernel source code changes (all DSL primitives already exist)
- Compiler source code changes
- Turn flow changes
- Capability/momentum interactions (already handled by existing macros)

---

## FITLSEC3-001: Patrol Multi-Hop Cube Sourcing

**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Rule reference**: 3.2.2
**Depends on**: None

### Summary

Rule 3.2.2: "Each cube may move into any adjacent LoC or City and may keep entering adjacent LoCs or Cities until the player chooses to stop moving it or it enters a space with any NVA or VC piece."

Currently, `patrol-us-profile` (line 1751) and `patrol-arvn-profile` (line 1880) in `30-rules-actions.md` use `tokensInAdjacentZones` — cubes are only sourced from zones directly adjacent to the target LoC. There is no multi-hop chaining through intermediate LoCs/Cities.

### Current Behavior

```yaml
# patrol-us-profile, stage: move-cubes (line 1757-1766)
- chooseN:
    bind: $movingCubes
    options:
      query: tokensInAdjacentZones
      zone: $loc
      filter:
        - { prop: faction, eq: 'US' }
        - { prop: type, op: in, value: ['troops', 'police'] }
    min: 0
    max: 99
```

Only cubes in spaces directly adjacent to `$loc` are offered as choices. A cube 2+ hops away through a chain of LoCs/Cities cannot be selected.

### Required Behavior

For each target LoC, source cubes from:
1. **Direct adjacency** (existing `tokensInAdjacentZones`) — cubes in any adjacent zone, regardless of NVA/VC presence. These cubes can move 1 hop and stop.
2. **Multi-hop reachability** (`connectedZones` query) — cubes in zones reachable from the target LoC through a chain of LoC/City spaces that are free of NVA/VC pieces.

**Why both sources are needed**: The kernel's `connectedZones` via-condition gates traversal AND discovery (`spatial.ts:267`). A neighbor with NVA/VC fails the via-check and is excluded from `connectedZones` results. But cubes in directly-adjacent NVA/VC spaces CAN move to the target (they enter and stop upon encountering enemy pieces). So direct adjacency covers the 1-hop case, and `connectedZones` covers the 2+ hop case.

### Kernel DSL Used

- `connectedZones { zone, via, includeStart, maxDepth }` — BFS from target LoC (`types-ast.ts:192-197`)
- Via condition binds `$zone` to each neighbor during traversal (`eval-query.ts`)
- Via condition: `(category == 'loc' OR category == 'city') AND count(NVA/VC tokens) == 0`
- `maxDepth: 30` (effectively unbounded for FITL's ~50 spaces)
- `includeStart: false` (we want source zones, not the target itself)

### Implementation

Restructure the `move-cubes` stage for both `patrol-us-profile` and `patrol-arvn-profile`:

1. Compute reachable zones via `connectedZones` (multi-hop through clear LoC/City chain)
2. Merge reachable zones with directly-adjacent zones (union covers both 1-hop and multi-hop)
3. First `chooseN` selects source zones from the merged set
4. Second `chooseN` per source zone selects cubes of the faction's type
5. `moveToken` teleports each cube from source to target LoC

**Sketch for US variant** (ARVN is identical but filters on `faction: 'ARVN'`):

```yaml
- stage: move-cubes
  effects:
    - forEach:
        bind: $loc
        over: { query: binding, name: targetLoCs }
        effects:
          # Multi-hop reachable zones (2+ hops through clear LoC/City chain)
          - let:
              bind: $reachableZones
              value:
                query: connectedZones
                zone: $loc
                via:
                  op: and
                  args:
                    - op: or
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                    - op: '=='
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                      right: 0
                includeStart: false
                maxDepth: 30
              in:
                # Source cubes from both adjacent zones AND multi-hop reachable zones
                - chooseN:
                    bind: $movingCubes
                    options:
                      op: union
                      args:
                        - query: tokensInAdjacentZones
                          zone: $loc
                          filter:
                            - { prop: faction, eq: 'US' }
                            - { prop: type, op: in, value: ['troops', 'police'] }
                        - query: tokensInZones
                          zones: { ref: binding, name: $reachableZones }
                          filter:
                            - { prop: faction, eq: 'US' }
                            - { prop: type, op: in, value: ['troops', 'police'] }
                    min: 0
                    max: 99
                - forEach:
                    bind: $cube
                    over: { query: binding, name: $movingCubes }
                    effects:
                      - moveToken:
                          token: $cube
                          from: { zoneExpr: { ref: tokenZone, token: $cube } }
                          to: $loc
                - macro: cap-patrol-m48-shaded-moved-cube-penalty
                  args:
                    movedCubes: $movingCubes
                    loc: $loc
```

**Note**: The exact YAML structure depends on whether the kernel supports a `union` query combinator or whether `tokensInZones` (plural) exists as a query type. If neither is available, an alternative approach is to use two sequential `chooseN` blocks — one for adjacent cubes and one for multi-hop reachable cubes — then merge the results. The implementer must verify available query combinators before encoding.

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `patrol-us-profile` move-cubes stage (line ~1751) and `patrol-arvn-profile` move-cubes stage (line ~1880)

### Acceptance Criteria

1. US cubes in a space 2+ LoC/City hops from the target LoC (through a clear chain) can be selected and moved
2. US cubes in a directly-adjacent space with NVA/VC can still be selected (1-hop case)
3. US cubes are NOT sourced through intermediate spaces that contain NVA/VC pieces (multi-hop chain broken)
4. ARVN patrol has identical multi-hop sourcing behavior (using ARVN faction filter)
5. Existing patrol tests continue to pass (single-hop case unchanged)
6. No kernel source files modified
7. Build passes (`pnpm turbo build`)
8. Typecheck passes (`pnpm turbo typecheck`)

---

## FITLSEC3-002: ARVN Operation Affordability Clamping

**Priority**: P2
**Estimated effort**: Small (1-2 hours)
**Rule reference**: 3.0
**Depends on**: None

### Summary

Rule 3.0: "The paying Faction must have enough Resources to pay for the Operation, including in each selected space."

ARVN operations cost 3 Resources per space (Sweep, Assault). Currently, the `legality` condition checks that ARVN has at least 3 Resources (sufficient for 1 space), but the `chooseN.max` for space selection is `99` (or `2` for capability-limited cases). This allows the player to select more spaces than they can afford.

### Current Behavior

**`sweep-arvn-profile`** (line 2114):
- `legality: { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }` — checks for 1 space
- `chooseN.max: 99` (non-LimOp, non-capability case, line 2173) — no affordability cap

**`assault-arvn-profile`** (line 2373):
- `legality` checks `mom_bodyCount` OR `arvnResources >= 3`
- `chooseN.max: 99` (non-LimOp, non-capability case, line 2443) — no affordability cap
- When `mom_bodyCount` is active, Assault is free — no clamping needed

### Required Behavior

Clamp `chooseN.max` to `floorDiv(arvnResources, 3)` so players cannot select more spaces than they can pay for. The kernel's `floorDiv` operator is confirmed available (`types-ast.ts`, `eval-value.ts`).

### Implementation

**`sweep-arvn-profile`** — change the non-LimOp `max: 99` to:

```yaml
max: { op: floorDiv, left: { ref: gvar, var: arvnResources }, right: 3 }
```

This applies to:
- Line 2173: the default non-LimOp, non-capability path (`max: 99` → `max: floorDiv(arvnResources, 3)`)
- Line 2158: the `cap_caps` shaded path (`max: 2` → `max: { op: min, args: [2, floorDiv(arvnResources, 3)] }`) — whichever is smaller

**`assault-arvn-profile`** — change the non-LimOp `max: 99` to:

```yaml
max:
  if:
    when: { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
    then: 99
    else: { op: floorDiv, left: { ref: gvar, var: arvnResources }, right: 3 }
```

This applies to:
- Line 2443: the default non-LimOp, non-capability path
- Line 2427: the `cap_abrams` shaded path (`max: 2` needs similar `min` clamping with affordability)

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `sweep-arvn-profile` (line ~2114) and `assault-arvn-profile` (line ~2373)

### Acceptance Criteria

1. ARVN Sweep with 6 Resources allows max 2 spaces (`floorDiv(6, 3) = 2`)
2. ARVN Sweep with 3 Resources allows max 1 space
3. ARVN Sweep with 9 Resources allows max 3 spaces
4. ARVN Assault with `mom_bodyCount` active has no cap (free)
5. ARVN Assault without `mom_bodyCount` clamps to `floorDiv(arvnResources, 3)`
6. Capability-limited paths (`cap_caps` for Sweep, `cap_abrams` for Assault) take the minimum of the capability limit and the affordability limit
7. LimOp paths remain `max: 1` (unaffected)
8. Per-space cost deduction in `resolve-per-space` still applies correctly
9. No kernel source files modified
10. Build passes (`pnpm turbo build`)

---

## FITLSEC3-003: NVA/VC Operation Affordability Clamping

**Priority**: P2
**Estimated effort**: Small (2-3 hours)
**Rule reference**: 3.0
**Depends on**: None

### Summary

NVA/VC operations cost 1 Resource per space (Rally, Attack, Terror in Provinces/Cities) or 0 for LoCs (March, Terror on LoCs). The `chooseN.max` for space selection is `99` in the non-LimOp path, with no resource-based upper bound.

### Current Behavior

All insurgent profiles use `legality: true` and `costEffects: []` at the profile level, deferring cost deduction to `resolve-per-space` (1 Resource per space via `addVar: { scope: global, var: nvaResources/vcResources, delta: -1 }`). The non-LimOp `chooseN.max` is `99` in all macros:

- `insurgent-attack-select-spaces` (line 697): `max: 99`
- `insurgent-terror-select-spaces` (line 748+): `max: 99`
- `insurgent-march-select-destinations` (line 1076+): `max: 99`
- `rally-nva-profile` (line 2548): `max: 99`
- `rally-vc-profile` (line 2734): `max: 99`

### Required Behavior

Clamp `chooseN.max` to the faction's current Resources so players cannot select more spaces than they can pay for. Since cost is 1/space for Provinces/Cities and 0 for LoCs, using the total resource count as the cap is a safe over-estimate — per-space deduction in `resolve-per-space` still enforces exact affordability.

### Implementation

**Rally** profiles (directly in profile YAML, not macros):
- `rally-nva-profile` (line 2548): `max: 99` → `max: { ref: gvar, var: nvaResources }`
- `rally-vc-profile` (line 2734): `max: 99` → `max: { ref: gvar, var: vcResources }`

**Attack/March/Terror** macros — These use shared macros (`insurgent-attack-select-spaces`, `insurgent-march-select-destinations`, `insurgent-terror-select-spaces`) which are parameterized by `faction` but not by the resource variable name. Two approaches:

**Option A**: Add a `resourceVar` parameter to each macro and use it in `max`:
```yaml
- id: insurgent-attack-select-spaces
  params:
    - { name: faction, type: { kind: enum, values: [NVA, VC] } }
    - { name: resourceVar, type: value }  # NEW
  # ...
  max: { ref: gvar, var: { param: resourceVar } }
```

**Option B**: Inline the space selection into each profile (duplicating the macro content but with the correct resource variable). This avoids changing the macro interface but increases YAML duplication.

**Recommendation**: Option A if the compiler supports `{ param: resourceVar }` as a dynamic variable reference in `ref: gvar`. If not, Option B.

**Free operations**: When `__freeOperation` is true, cost is 0, so the resource cap should not apply. The `max` expression should conditionally bypass clamping:
```yaml
max:
  if:
    when: { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
    then: 99
    else: { ref: gvar, var: nvaResources }
```

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `rally-nva-profile` (line ~2505) and `rally-vc-profile` (line ~2691)
- `data/games/fire-in-the-lake/20-macros.md` — Modify `insurgent-attack-select-spaces` (line ~659), `insurgent-march-select-destinations` (line ~1021), `insurgent-terror-select-spaces` (line ~704)

### Acceptance Criteria

1. NVA Rally with 3 Resources allows max 3 spaces
2. NVA Rally with 0 Resources allows 0 spaces (triggers legality failure or empty selection)
3. VC Attack with 5 Resources allows max 5 spaces
4. March with 0 Resources: LoC-only destinations still selectable (cost 0), Province/City destinations blocked
5. Free operations bypass the resource cap entirely
6. LimOp paths remain `max: 1` (unaffected)
7. Macro parameter changes don't break existing callers
8. No kernel source files modified
9. Build passes (`pnpm turbo build`)
10. Typecheck passes (`pnpm turbo typecheck`)

---

## Overall Test Plan

### Compilation Tests

All existing FITL compilation tests must continue to pass after YAML changes:
- `pnpm -F @ludoforge/engine test` — full engine test suite
- `pnpm -F @ludoforge/engine test:e2e` — E2E pipeline tests

### Manual Verification

1. **FITLSEC3-001**: Create a test scenario with US cubes 2 hops from a target LoC through clear LoCs. Verify they appear in legal moves for Patrol.
2. **FITLSEC3-002**: Create a test scenario with ARVN at 6 Resources. Verify Sweep offers max 2 spaces. Then set to 3 — verify max 1 space.
3. **FITLSEC3-003**: Create a test scenario with NVA at 2 Resources. Verify Rally offers max 2 spaces. Set to 0 — verify Rally is blocked.

### Regression

- Texas Hold'em compilation tests must still pass (engine-agnosticism check)
- No new kernel or compiler source files created or modified
