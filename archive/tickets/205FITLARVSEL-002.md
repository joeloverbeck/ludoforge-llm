# 205FITLARVSEL-002: P1 — Replace placeholder selector bodies (§§4.1–4.4, 4.7)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic selector-expression support for filtered local token counts and token-local properties
**Deps**: `archive/tickets/205FITLARVSEL-001.md`

## Problem

Five ARVN selectors carry `value: 1` placeholder components in `data/games/fire-in-the-lake/92-agents.md`: `arvn.trainSpaceForControlOrPacification:569`, `arvn.sweepToExposeSpace:637`, `arvn.raidRemovalTarget:652`, `arvn.transportOrigin:667`, `arvn.pieceRemovalPriority:741`. Per Spec 205 §§4.1-4.4, 4.7, replace these with item-local features authored using existing constructs (`zoneProp` / `lookup` / `aggregate`). This closes the selector-quality gap the trigger report identified.

## Assumption Reassessment (2026-06-01)

1. Spec 205 §§4.1-4.4, 4.7 specify the target shape using `quality.components: [{id, value, weight}]` — confirmed against existing selectors (e.g., `arvn.governPatronageSpace:570-611`, `arvn.transportOrigin:667-693`).
2. The five target selectors are at lines 569, 637, 652, 667, 741 in `data/games/fire-in-the-lake/92-agents.md` — verified by reassess-spec on 2026-06-01.
3. P0 vocabulary baseline (205FITLARVSEL-001) resolves placeholder names to concrete authoring forms; **re-read `reports/205-fitl-arvn-selector-vocabulary-baseline.md` during implementation and adjust each component's `value` expression to match the P0-resolved form** rather than copying the spec's placeholder names verbatim.
4. Existing `feature.coinControlPop` and `feature.projectedSelfMargin` refs are retained as low-weight tiebreakers per spec §9 "Adopted" framing.
5. `arvn.trainSpaceForControlOrPacification` is currently authored on one inline-flow line at line 569 — the replacement uses the multi-line `quality.components` block form for readability.

## Architecture Check

1. Uses generic selector-expression constructs. Implementation added the missing generic compiler/runtime support for filtered `zoneTokenAgg` counts and `tokenProp` after the P0 baseline showed the target selectors were not expressible with the existing surface (Foundation #1, #7).
2. Replaces `value: 1` standalone constants with item-local features — closes the quality gap (Foundation #15 Architectural Completeness).
3. Preserves all selector IDs verbatim; only component `id` / `value` / `weight` change (Foundation #14 — no aliases or shims).
4. The (d)-classified placeholder names from P0 (if any) flag as follow-up work, not silently degraded — protecting Foundation #20 preview-signal integrity by not synthesizing unavailable features into 0-contributions.

## What to Change

### 1. `arvn.trainSpaceForControlOrPacification` body (line 569)

Expand the inline single-line component shape into the multi-component block per spec §4.1. New components: `trainPopulation` (weight 4), `terrorMarkerPresent` (weight 3), `pacificationEligible` (weight 3), `cityTrainTarget` (weight 2). Drop the `controlOrPacificationOpportunity` placeholder. Resolve each value expression against the P0 vocabulary baseline.

### 2. `arvn.sweepToExposeSpace` body (line 637)

Replace `exposeUndergroundThreat` placeholder per spec §4.2. New components: `undergroundGuerrillaCount` (weight 5), `insurgentBasePresent` (weight 4); retain `highPopControlSetup` (weight 1) as tiebreaker.

### 3. `arvn.raidRemovalTarget` body (line 652)

Replace `baseOrUndergroundRemoval` placeholder per spec §4.3. New components: `removableBasePresent` (weight 6), `undergroundGuerrillaCount` (weight 4); retain `controlSwing` (weight 1) as tiebreaker.

### 4. `arvn.transportOrigin` body (line 667)

Replace `overstackedSafeOrigin` (`value: 1`, weight 3) with `arvnTroopOverstack` per spec §4.4. Retain `authoredMapSpace` (weight 5, lines 673-684) and `preserveOriginControl` (weight 1, lines 688-691) verbatim.

### 5. `arvn.pieceRemovalPriority` body (line 741)

Replace `baseAndControlThreat` placeholder per spec §4.7. New components: `removableBasePresent` (weight 5), `controlSwingFromRemoval` (weight 4), `populationWeight` (weight 3).

### 6. Resolve placeholder names against P0 baseline

For each component value expression in §§4.1-4.7, consult `reports/205-fitl-arvn-selector-vocabulary-baseline.md` and adjust the expression to the resolved form (existing `zoneProp.prop` / inline `lookup` / `aggregate` / new derived metric). If any name is classified (d) and no derived metric exists yet, file a follow-up against this ticket's namespace or surface to the user before authoring a synthetic placeholder.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify) — five selector bodies replaced/expanded
- `reports/205-fitl-arvn-selector-vocabulary-baseline.md` (consume; produced by 205FITLARVSEL-001)

## Out of Scope

- Transport postState constraint (§4.5 — owned by 205FITLARVSEL-003).
- Govern Patronage-availability term (§4.6 — owned by 205FITLARVSEL-004).
- Faction-agnostic placeholder-value-one invariant test (§7 last bullet — owned by 205FITLARVSEL-005).
- Removing the retained `feature.coinControlPop` / `feature.projectedSelfMargin` tiebreaker components.
- Renaming any selector ID.
- Any authoring against `preview.role.*` namespace (deferred to §10 follow-up spec).

## Acceptance Criteria

### Tests That Must Pass

1. All 10 existing ARVN witnesses pass under the new selector bodies (under distillation rule per spec §5 / `archive/specs/137-convergence-witness-invariant-promotion.md` if trajectory shifts).
2. `pnpm turbo build` succeeds and the GameDef compiles cleanly.
3. No `value: 1` standalone components remain in the five named selectors at their post-edit lines.
4. `pnpm turbo lint && pnpm turbo typecheck` pass.

### Invariants

1. Selector IDs unchanged (`arvn.trainSpaceForControlOrPacification`, `arvn.sweepToExposeSpace`, `arvn.raidRemovalTarget`, `arvn.transportOrigin`, `arvn.pieceRemovalPriority`).
2. Existing item-local components in `arvn.transportOrigin` (`authoredMapSpace`, `preserveOriginControl`) preserved verbatim.
3. Foundation #1 — engine changes are generic selector-expression support, not FITL-specific hardcoding.
4. Foundation #14 — no compatibility shims; the placeholder components are deleted, not aliased.

## Test Plan

### New/Modified Tests

1. None directly authored here. The faction-agnostic invariant test that scans for `value: 1` placeholders is authored in 205FITLARVSEL-005, which depends on this ticket's cleanup landing first.

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/policy-profile-quality/arvn-govern-active-support-priority.test.js`
3. `node --test dist/test/policy-profile-quality/arvn-patrol-govern-over-train-when-threatened.test.js`
4. `node --test dist/test/policy-profile-quality/arvn-precoup-posture-avoids-redeploy-undone.test.js`
5. `node --test dist/test/policy-profile-quality/arvn-seed-1000-deep-recovery.test.js`
6. `node --test dist/test/policy-profile-quality/arvn-sweep-raid-expose-before-removal.test.js`
7. `node --test dist/test/policy-profile-quality/arvn-train-govern-fallback.test.js`
8. `node --test dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`
9. `node --test dist/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.js`
10. `node --test dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js`
11. `node --test dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js`
12. `pnpm turbo test`
13. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-06-01

What changed:

- Replaced the five named ARVN selector placeholder bodies in `data/games/fire-in-the-lake/92-agents.md`.
- Added item-local selector expressions for Train, Sweep, Raid, Transport origin, and piece-removal priority.
- Added generic `zoneTokenAgg.tokenFilter` support for local filtered token counts and `tokenProp` support for token-scoped selectors, with schema/type/compiler/runtime/test coverage.
- Preserved selector IDs and the existing `arvn.transportOrigin` `authoredMapSpace` and `preserveOriginControl` components.

Deviation from original plan:

- The ticket assumed YAML-only work. The P0 baseline showed the replacement expressions needed filtered local token counts and token-local property access that did not exist in the selector-expression surface, so the implementation added generic engine support instead of reintroducing synthetic constants.

Verification:

- `pnpm -F @ludoforge/engine build`
- `node --test dist/test/unit/agents/policy-expr.test.js`
- Focused ARVN policy-profile witnesses, including the shifted/distilled ARVN Patrol+Govern and seed-1000 deep-recovery witnesses
- `pnpm turbo build`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test`
