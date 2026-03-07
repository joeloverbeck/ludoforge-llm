# LEGACTTOO-010: FITL Verbalization Authoring

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data only
**Deps**: LEGACTTOO-002, LEGACTTOO-007

## Problem

The FITL game spec has a starter verbalization block (from LEGACTTOO-002) but needs comprehensive authoring: all faction labels, zone labels, token types, marker names, stage descriptions for operations and special activities, macro summaries, sentence plans for common patterns, and suppress patterns for FITL telemetry variables. Without this, FITL tooltips fall back entirely to auto-humanized identifiers.

## Assumption Reassessment (2026-03-06)

1. FITL game spec files live at `data/games/fire-in-the-lake/` with files `00-metadata.md` through `91-victory-standings.md` plus `visual-config.yaml`.
2. LEGACTTOO-002 will create `data/games/fire-in-the-lake/05-verbalization.md` with a starter block.
3. FITL has 4 factions (US, ARVN, NVA, VC), multiple token types (troops, guerrillas, bases, irregulars, rangers, tunnels), 40+ named zones, multiple markers (support/opposition, control, etc.), and ~12 operations/special activities.

## Architecture Check

1. Pure game data authoring — no engine code changes.
2. All content lives in `data/games/fire-in-the-lake/05-verbalization.md` YAML block.
3. Follows the VerbalizationDef schema from LEGACTTOO-001.

## What to Change

### 1. Complete `data/games/fire-in-the-lake/05-verbalization.md`

**Labels section** — comprehensive identifier-to-display-name mappings:
- Faction names: `us` → "US", `arvn` → "ARVN", `nva` → "NVA", `vc` → "VC"
- Token types (kebab-case piece IDs): `us-troops` → {singular: "US Troop", plural: "US Troops"}, `nva-guerrillas` → {singular: "NVA Guerrilla", plural: "NVA Guerrillas"}, etc. for all ~12 piece types
- Zone names (with `:none` suffix): `saigon:none` → "Saigon", `hue:none` → "Hue", `da-nang:none` → "Da Nang", etc. for all cities, provinces, LoCs
- Supply zones: `available-US:none` → "US Available Forces", `available-ARVN:none` → "ARVN Available Forces", etc.
- Casualty zones: `casualties-US:none` → "US Casualties"
- Variables: `aid` → "Aid", `totalEcon` → "Total Econ", `patronage` → "Patronage", `trail` → "Trail"
- Markers: `support` → "Support", `opposition` → "Opposition", `control` → "Control"

**Stages section** — step headers for all operations and special activities:
- `selectSpaces` → "Select target spaces"
- `placeForces` → "Place forces"
- `activateGuerrillas` → "Activate guerrillas"
- etc. for all pipeline stages in FITL actions

**Macros section** — summary for each compiled macro:
- `trainUs` → { class: "operation", summary: "Place US forces and build support" }
- `sweepUs` → { class: "operation", summary: "Move troops and activate guerrillas" }
- etc. for all FITL macros

**Sentence plans section** — pre-authored sentences for common patterns:
- `shiftMarker.supportOpposition` → {"+1": "Shift 1 level toward Active Support", "-1": "Shift 1 level toward Active Opposition"}
- `addVar.aid` → {"+3": "Add 3 Aid", "-3": "Remove 3 Aid"}
- etc. for common variable and marker patterns

**Suppress patterns section**:
- FITL-specific telemetry: `*Count`, `*Tracker`, `__*`, `temp*`, plus any FITL-specific internal variables

### 2. Validate with golden tests

Verify all FITL actions produce readable English with the completed verbalization. Update golden test expectations from LEGACTTOO-007 if needed.

## Files to Touch

- `data/games/fire-in-the-lake/05-verbalization.md` (modify — complete verbalization content)
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify — update FITL golden expectations)

## Out of Scope

- Texas Hold'em verbalization (LEGACTTOO-011)
- Engine code changes (all engine work is in prior tickets)
- Runner UI changes (LEGACTTOO-009)
- Adding new FITL actions or macros

## Acceptance Criteria

### Tests That Must Pass

1. FITL game spec compiles successfully with complete verbalization block.
2. Golden test: Train(US) → synopsis and steps match expected English.
3. Golden test: Sweep(US) → synopsis and steps match expected English.
4. Golden test: Rally(NVA) → synopsis and steps match expected English.
5. No auto-humanized fallback labels appear in FITL tooltips for known identifiers (all covered by verbalization labels).
6. All FITL telemetry variables suppressed — no `*Count`, `*Tracker`, or `__*` in tooltip output.
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No engine code changes in this ticket.
2. FITL game spec remains valid and compilable.
3. Verbalization content uses only identifiers that exist in the FITL game spec.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — update FITL golden test expectations with complete verbalization content. Add golden tests for additional FITL actions (Patrol, March, Attack, etc.) as coverage allows.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Expanded FITL verbalization authoring in `data/games/fire-in-the-lake/05-verbalization.md` with comprehensive labels, stage text, macro summaries, sentence plans, and suppress patterns.
  - Added FITL-focused tooltip integration coverage in `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` for Train/Sweep/Rally verbalized synopses, label coverage, suppress pattern checks, and label-resolution behavior.
- Deviations from original plan:
  - Golden expectations were validated and added in `tooltip-pipeline-integration.test.ts` rather than a separate `tooltip-golden.test.ts` file.
  - Additional suppress patterns (`mom_*`, `fitl_*`) were included alongside the baseline wildcard patterns.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/tooltip-pipeline-integration.test.js` passed (12/12 tests).
