# CROGAMPRIELE-011: FITL spec migration to template/primitive patterns

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — game spec data files only
**Deps**: CROGAMPRIELE-002, CROGAMPRIELE-003, CROGAMPRIELE-004, CROGAMPRIELE-006, CROGAMPRIELE-007, CROGAMPRIELE-008

## Problem

FITL's game spec uses verbose repetitive patterns now expressible as first-order compiler templates and kernel primitives. This ticket rewrites the spec to use: `batch:` for capability markers and operation counters/momentum flags, zone templates for per-faction available zones, and deck `behavior` for the event deck.

## Assumption Reassessment (2026-03-03)

1. FITL spec files are in `data/games/fire-in-the-lake/`.
2. The spec defines **19** capability markers (identical 3-state: inactive/unshaded/shaded), **19** operation counters with max:20 (identical int), **2** faction operation counters with max:50 (usOpCount, arvnOpCount), **15** momentum flags (identical boolean with `mom_` prefix), **6** per-faction zones (4 available-{seat}, 2 out-of-play — US/ARVN only), and no shared eligibility/bookkeeping patterns across operations (stubs only).
3. Compilation is via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`.
4. Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`) are separate from production spec and are NOT migrated here.

### Corrected Data Inventory

**19 capability marker IDs**: cap_topGun, cap_arcLight, cap_abrams, cap_cobras, cap_m48Patton, cap_caps, cap_cords, cap_lgbs, cap_searchAndDestroy, cap_aaa, cap_longRangeGuns, cap_migs, cap_sa2s, cap_pt76, cap_armoredCavalry, cap_mandateOfHeaven, cap_boobyTraps, cap_mainForceBns, cap_cadres

**19 operation counter IDs (max:20)**: trainCount, patrolCount, sweepCount, assaultCount, rallyCount, marchCount, attackCount, adviseCount, airLiftCount, airStrikeCount, governCount, transportCount, raidCount, infiltrateCount, bombardCount, nvaAmbushCount, taxCount, subvertCount, vcAmbushCount

**2 faction operation counter IDs (max:50)**: usOpCount, arvnOpCount

**15 momentum flag IDs**: mom_wildWeasels, mom_adsid, mom_rollingThunder, mom_medevacUnshaded, mom_medevacShaded, mom_blowtorchKomer, mom_claymores, mom_daNang, mom_mcnamaraLine, mom_oriskany, mom_bombingPause, mom_559thTransportGrp, mom_bodyCount, mom_generalLansdale, mom_typhoonKate

**Per-faction zones**: available-US, available-ARVN, available-NVA, available-VC, out-of-play-US, out-of-play-ARVN, casualties-US — zone template NOT applicable because seat catalog IDs are lowercase (us, arvn, nva, vc) while zone IDs use uppercase (available-US, available-ARVN, etc.), causing casing mismatches with all setup effect zone references

## Architecture Check

1. This is a game spec data change only — no engine code changes.
2. The migrated spec must compile to a functionally equivalent GameDef.
3. The migration exercises batch markers (A2), batch vars (A3), zone templates (A4), and deck behavior (B2), validating their real-world utility.

## What to Change

### 1. Capability markers: 19 individual -> `batch:`

Replace 19 individual `globalMarkerLattices` entries (all sharing `states: [inactive, unshaded, shaded]`, `defaultState: inactive`) with a single `batch:` block. Keep `activeLeader` and `leaderFlipped` as individual declarations (different states/defaults).

### 2. Operation counters (max:20): 19 individual -> `batch:`

Replace 19 individual `globalVars` int entries (all sharing `type: int`, `init: 0`, `min: 0`, `max: 20`) with a single `batch:` block.

### 3. Faction operation counters (max:50): 2 individual -> `batch:`

Replace 2 individual `globalVars` int entries (usOpCount, arvnOpCount — sharing `type: int`, `init: 0`, `min: 0`, `max: 50`) with a single `batch:` block.

### 4. Momentum flags: 15 individual -> `batch:`

Replace 15 individual `globalVars` boolean entries (all sharing `type: boolean`, `init: false`) with a single `batch:` block.

### ~~5. Available zones: template~~ (REMOVED from scope)

Zone template NOT applicable: seat catalog IDs are lowercase (us, arvn, nva, vc) but FITL zone IDs use uppercase (available-US, available-ARVN, etc.). Template expansion would produce `available-us` which breaks all setup effect zone references. Fixing the casing throughout the entire spec is out of scope for this migration ticket.

### 6. Event deck zone: `behavior: { type: deck, drawFrom: top }`

Add deck behavior to the event deck zone. FITL does not reshuffle — empty deck triggers coup resolution.

### ~~7. actionDefaults.pre~~ (REMOVED from scope)

All main phase operation actions have `pre: null` and `effects: []` — they are stubs. No shared eligibility checks exist to factor out.

### ~~8. actionDefaults.afterEffects~~ (REMOVED from scope)

All main phase operation actions have `effects: []` — no post-operation macros to factor out.

### ~~9. Coup sub-phase templates~~ (REMOVED from scope)

Coup phases are defined as minimal entries (just IDs). No template benefit.

## Files to Touch

- `data/games/fire-in-the-lake/10-vocabulary.md` (modify — markers, vars, zones)

## Out of Scope

- Texas Hold'em spec migration (CROGAMPRIELE-010)
- Engine code changes — all changes are in game spec data files
- Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`)
- Combinatorial piece generation (A1) — FITL pieces have per-faction property differences
- Phase templates for coup sub-phases — evaluated, no benefit
- actionDefaults.pre — operations are stubs with no shared eligibility
- actionDefaults.afterEffects — operations are stubs with no shared post-effects

## Acceptance Criteria

### Tests That Must Pass

1. Migrated spec compiles successfully via `compileProductionSpec()`.
2. Compiled GameDef has the same number of marker lattices (19 capability + activeLeader + leaderFlipped = 21 total global), variables, zones, actions, and phases as the original.
3. `ZoneDef.behavior` is present on the event deck zone in the compiled GameDef.
4. Same-seed simulation produces deterministic results.
5. No `batch:` or `template:` artifacts remain in the compiled GameDef.
6. Existing suite: `pnpm turbo test`

### Invariants

1. Game behavior is functionally equivalent — same legal moves, same state transitions for the same seed and move sequence.
2. Spec authoring patterns are idiomatic — no mixed old/new patterns.
3. Foundation fixtures are unchanged — only production spec files are migrated.
4. No Texas Hold'em-specific logic is introduced (engine-agnosticism preserved).

## Test Plan

### New/Modified Tests

1. Verify `compileProductionSpec()` for FITL succeeds.
2. Run existing FITL game-rule tests against migrated spec.
3. Verify compiled GameDef entity counts match pre-migration counts.
4. Verify deck zone has behavior field.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test --force`
3. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

**Completion date**: 2026-03-03

### What actually changed

**Game spec data file** (`data/games/fire-in-the-lake/10-vocabulary.md`):
- 19 individual `cap_*` capability markers replaced with 1 `batch:` block (states: inactive/unshaded/shaded, defaultState: inactive)
- 19 individual operation counters (max:20) replaced with 1 `batch:` block (type: int, init: 0, min: 0, max: 20)
- 2 individual faction operation counters (max:50) replaced with 1 `batch:` block (type: int, init: 0, min: 0, max: 50)
- 15 individual momentum flags replaced with 1 `batch:` block (type: boolean, init: false)
- Deck zone gained `behavior: { type: deck, drawFrom: top }`
- Individual vars (coinResources, usResources, airLiftRemaining, airStrikeRemaining, fitl_acesAirStrikeWindow, linebacker11Allowed, linebacker11SupportAvailable) and markers (activeLeader, leaderFlipped) kept as-is

**Engine validator fix** (`packages/engine/src/cnl/validate-zones.ts`):
- `extractGlobalMarkerLattices` now understands `batch:` entries with `batch.ids` and `batch.states`
- `extractGlobalVarDefs` now understands `batch:` entries with `batch.names`, `batch.type`, `batch.min`, `batch.max`
- Without this fix, the validator could not find marker/var IDs referenced by scenario initializations when those IDs came from batch entries

**Tests strengthened** (`packages/engine/test/integration/fitl-production-data-compilation.test.ts`):
- Assert total global marker lattice count = 21 (19 capability + activeLeader + leaderFlipped)
- Assert leaderFlipped marker lattice shape
- Assert all 19 operation counter names exist in compiled globalVars
- Assert usOpCount and arvnOpCount exist in compiled globalVars
- Assert all 15 momentum flag names exist in compiled globalVars
- Assert deck zone has `behavior: { type: deck, drawFrom: top }`
- Assert no `"batch"` or `"template"` artifacts remain in compiled GameDef JSON

### Deviations from original plan

1. **Zone template (item 5) removed**: Seat catalog IDs are lowercase (`us`, `arvn`, `nva`, `vc`) but FITL zone IDs use uppercase (`available-US`, `available-ARVN`, etc.). Template expansion would produce `available-us` which breaks all setup effect zone references. Not worth a spec-wide casing migration.
2. **actionDefaults.pre (item 7) removed**: All main phase operation actions have `pre: null` and `effects: []` — stubs with no shared eligibility logic.
3. **actionDefaults.afterEffects (item 8) removed**: All main phase operation actions have `effects: []` — stubs with no shared post-operation macros.
4. **Coup phase templates (item 9) removed**: Coup phases are minimal entries (just IDs). No template benefit.
5. **Validator fix added**: The validator's `extractGlobalMarkerLattices` and `extractGlobalVarDefs` didn't handle `batch:` entries — a pre-existing gap from when batch expansion was implemented. Fixed as part of this migration.

### Verification results

- `pnpm turbo build` — success
- `pnpm turbo test --force` — 3456 tests pass, 0 fail
- `pnpm turbo typecheck` — clean
- `pnpm turbo lint` — clean
