# FITLCAPMOMRVNLEA-012: Rework PT-76 to Use Stage-Bound Validation Instead of Selector Caps

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — depends on stage-level pipeline predicates from ENGINEARCH-006, plus FITL data/test updates
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `tickets/ENGINEARCH-006-stage-level-pipeline-predicates.md`, `archive/tickets/FITLCAPMOMRVNLEA-004-capability-branches-march-attack-bombard.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts`

## Problem

PT-76 is implemented correctly for card text, removal timing, and shaded behavior, but the unshaded multi-space Attack selector still uses a global `paidMaxExpr` cap as a workaround for a missing engine capability. That workaround cannot validate the exact chosen subset, so some illegal NVA Attack selections remain legal when troop-paying spaces exist outside the subset. PT-76 should be reworked to use an exact declarative rule once the engine can validate bound stage selections.

## Assumption Reassessment (2026-03-09)

1. [data/games/fire-in-the-lake/30-rules-actions.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md) currently implements PT-76 unshaded by:
   - broadening `insurgent-attack-select-spaces`,
   - setting `paidMaxExpr = nvaResources + count(eligible troop-paying spaces)`,
   - then charging each chosen space in `cost-per-space` by troop removal when possible, else by resource spend.
2. That data is a deliberate approximation, not an exact rule encoding. A concrete remaining illegal case is: `nvaResources = 1`, one eligible troop-paying attack space exists elsewhere, and the move selects two no-troop attack spaces. The current selector cap allows the move even though the chosen subset can only legally fund one no-troop space.
3. The runtime already supports binding-array queries such as `{ query: binding, name: $targetSpaces }`, so once ENGINEARCH-006 lands, PT-76 can be expressed exactly in GameSpecDoc without any FITL-specific engine hooks.

## Architecture Check

1. Reworking PT-76 after ENGINEARCH-006 is cleaner than further tightening selector heuristics. The rule belongs in GameSpecDoc as an exact subset-aware affordability condition, not as a growing series of special-case cardinality caps.
2. This preserves the agnostic engine rule: the engine supplies only generic stage-bound predicate timing, while PT-76 remains encoded entirely in FITL data/macros/tests.
3. No backwards-compatibility shim should preserve the current workaround. Replace it outright once the engine feature exists.

## What to Change

### 1. Remove the PT-76 selector workaround

Simplify `attack-nva-profile` and any shared helper macros so they no longer rely on the `paidMaxExpr` global cap to approximate mixed troop/resource affordability for PT-76.

### 2. Encode exact unshaded affordability with stage-bound predicates

After the selection stage binds `$targetSpaces`, add a stage-level predicate that validates:
- each selected troop-containing attack space can self-fund by losing one NVA Troop,
- the count of selected spaces without an available troop-payment path does not exceed `nvaResources`.

### 3. Add regression coverage for the formerly over-permitted case

Lock in the exact illegal combination that the workaround currently misses, plus a neighboring legal case where the selected subset really is fundable.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify if shared selector semantics need baseline updates)

## Out of Scope

- Any change to PT-76 shaded behavior beyond keeping existing exact semantics intact
- Unrelated NVA Attack refactors not required by removing the workaround
- New engine capabilities beyond those specified in ENGINEARCH-006

## Acceptance Criteria

### Tests That Must Pass

1. PT-76 unshaded rejects a selected subset whose no-troop spaces exceed currently available `nvaResources`, even if other eligible troop-paying spaces exist outside the subset.
2. PT-76 unshaded still allows multi-space Attack when every selected space either contains an NVA Troop to remove or is covered by actual `nvaResources`.
3. Existing suite: `pnpm turbo test`

### Invariants

1. PT-76 exact legality is encoded in FITL GameSpecDoc data, not in engine FITL branches.
2. The card no longer depends on heuristic selector caps once stage-bound validation is available.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` — add the exact mixed-payment subset regression and the adjacent legal case.
2. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — update only if shared attack selector behavior needs cross-profile coverage after removing the workaround.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`
3. `node packages/engine/dist/test/integration/fitl-insurgent-operations.test.js`
4. `pnpm turbo test`
