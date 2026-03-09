# FITLCAPMOMRVNLEA-012: Rework PT-76 to Use Stage-Bound Validation Instead of Selector Caps

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No — use the already-landed generic stage-level predicate support from `archive/tickets/ENGINEARCH-006-stage-level-pipeline-predicates.md`; only FITL data/test updates are required here
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `archive/tickets/ENGINEARCH-006-stage-level-pipeline-predicates.md`, `archive/tickets/FITLCAPMOMRVNLEA-004-capability-branches-march-attack-bombard.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts`


## Problem

PT-76 is implemented correctly for card text, removal timing, and shaded behavior, but the unshaded multi-space Attack selector still uses a global `paidMaxExpr` cap as a legacy workaround. That workaround cannot validate the exact chosen subset, so some illegal NVA Attack selections remain legal when troop-paying spaces exist outside the subset. PT-76 should be reworked to use the exact declarative rule the engine now supports.

## Assumption Reassessment (2026-03-09)

1. [archive/tickets/ENGINEARCH-006-stage-level-pipeline-predicates.md](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENGINEARCH-006-stage-level-pipeline-predicates.md) is already completed, and the runtime/compiler/test surfaces for stage-level `legality` / `costValidation` are present in the engine today. This ticket does not need new engine capability.
2. [data/games/fire-in-the-lake/30-rules-actions.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md) currently implements PT-76 unshaded by:
   - broadening `insurgent-attack-select-spaces`,
   - setting `paidMaxExpr = nvaResources + count(eligible troop-paying spaces)`,
   - then charging each chosen space in `cost-per-space` by troop removal when possible, else by resource spend.
3. That data is still only an approximation, not an exact rule encoding. A concrete remaining illegal case is: `nvaResources = 1`, one eligible troop-paying attack space exists elsewhere, and the move selects two no-troop attack spaces. The current selector cap allows the move even though the chosen subset can only legally fund one no-troop space.
4. The runtime already supports binding-array queries such as `{ query: binding, name: $targetSpaces }`, so PT-76 can now be expressed exactly in GameSpecDoc without any FITL-specific engine hooks.

## Architecture Check

1. Reworking PT-76 onto the existing stage-bound predicate surface is cleaner than further tightening selector heuristics. The rule belongs in GameSpecDoc as an exact subset-aware affordability condition, not as a growing series of special-case cardinality caps.
2. This preserves the agnostic engine rule: the engine supplies only generic stage-bound predicate timing, while PT-76 remains encoded entirely in FITL data/macros/tests.
3. No backwards-compatibility shim should preserve the current workaround. Replace it outright now that the generic stage-bound predicate surface exists.

## What to Change

### 1. Remove the PT-76 selector workaround from `attack-nva-profile`

Keep the shared selector macro generic. Replace the PT-76-specific `paidMaxExpr` approximation in `attack-nva-profile` with a stage-bound exact affordability check instead of widening shared helpers unnecessarily.

### 2. Encode exact unshaded affordability with stage-bound predicates in `cost-per-space`

After the selection stage binds `$targetSpaces`, add a stage-level predicate that validates:
- each selected troop-containing attack space can self-fund by losing one NVA Troop,
- the count of selected spaces without an available troop-payment path does not exceed `nvaResources`.

### 3. Add regression coverage for the formerly over-permitted case

Lock in the exact illegal combination that the workaround currently misses, plus a neighboring legal case where the selected subset really is fundable.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` (modify)

## Out of Scope

- Any change to PT-76 shaded behavior beyond keeping existing exact semantics intact
- Unrelated NVA Attack refactors not required by removing the workaround
- Shared selector-macro rewrites unless the implementation proves they are necessary

## Acceptance Criteria

### Tests That Must Pass

1. PT-76 unshaded rejects a selected subset whose no-troop spaces exceed currently available `nvaResources`, even if other eligible troop-paying spaces exist outside the subset.
2. PT-76 unshaded still allows multi-space Attack when every selected space either contains an NVA Troop to remove or is covered by actual `nvaResources`.
3. Existing suite: `pnpm turbo test`

### Invariants

1. PT-76 exact legality is encoded in FITL GameSpecDoc data, not in engine FITL branches.
2. The card no longer depends on the PT-76-specific heuristic selector cap now that stage-bound validation is available.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` — add the exact mixed-payment subset regression and the adjacent legal case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`
3. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-09
- What changed: removed the PT-76-specific `paidMaxExpr = nvaResources + eligible troop-paying spaces` approximation from `attack-nva-profile` and replaced it with an exact `cost-per-space` stage `costValidation` that sums only the selected no-troop spaces in `$targetSpaces`.
- What changed: kept the shared `insurgent-attack-select-spaces` macro unchanged so the fix stays localized to PT-76 data instead of widening shared selector behavior.
- What changed: added two integration regressions covering the formerly over-permitted illegal subset and the adjacent legal mixed-payment subset.
- Deviations from original plan: no `20-macros.md` change was needed because the cleanest implementation was a localized `attack-nva-profile` data update, not a shared macro rewrite.
- Deviations from original plan: `fitl-insurgent-operations.test.ts` did not need changes because the shared selector contract remained intact.
- Verification results: `pnpm -F @ludoforge/engine build`, `node packages/engine/dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`, `pnpm turbo test`, and `pnpm turbo lint` all passed.
