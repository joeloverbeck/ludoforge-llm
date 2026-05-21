# 188FITLFOUFAC-007A: ARVN witnessable selector/posture semantics prerequisite

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None - Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`, `archive/tickets/188FITLFOUFAC-004.md`, `archive/tickets/188FITLFOUFAC-005.md`, `archive/tickets/188FITLFOUFAC-006.md`

## Problem

Ticket 007 is test-only and must prove the ARVN Phase 1 behavior witnesses from Spec 188. Live reassessment on 2026-05-21 showed at least one named behavior is not yet authored as a behavior-selective YAML surface: `arvn.governPatronageSpace` still scores every zone with a constant `patronageOpportunity: 1`, so 007 cannot truthfully prove "Govern prefers high-pop Active Support before low-pop Passive Support except emergency" without weakening the witness into a structural smoke test.

This ticket owns the missing Tier-1 YAML authoring prerequisite. It makes the ARVN selectors/posture hooks witnessable enough for ticket 007 to remain pure profile-quality proof.

## Assumption Reassessment (2026-05-21)

1. `data/games/fire-in-the-lake/92-agents.md` already contains the ARVN plan templates, guardrails, posture evaluator, relationship wiring, and the `arvn-evolved` binding from tickets 003-006.
2. Live inventory found `arvn.governPatronageSpace` still uses a constant quality component, which cannot prove the high-pop Active Support ordering named by Spec 188 §5 and ticket 007.
3. The fix must stay in GameSpecDoc YAML. Adding FITL-specific engine, compiler, kernel, or test-helper behavior would violate Foundations #1 and #2.
4. Ticket 007 remains the owner of profile-quality witnesses. This ticket owns only the authored semantics needed to make those witnesses meaningful.

## Architecture Check

1. Foundation #2: rule- and policy-relevant faction behavior is authored in `GameSpecDoc`, not inferred by tests or hardcoded in engine code.
2. Foundation #15: the root cause is an incomplete authored personality surface, so the fix should complete that YAML surface instead of masking it with weaker tests.
3. Foundation #16: automated witnesses in 007 must prove real behavior; this prerequisite prevents 007 from passing on construct presence alone.
4. Foundation #1: all FITL-specific identifiers remain in `data/games/fire-in-the-lake/92-agents.md`; shared runtime code stays game-agnostic.

## What to Change

### 1. Make ARVN Govern target quality behavior-selective

Update `arvn.governPatronageSpace` so its quality components distinguish high-pop Active Support Govern opportunities from lower-value alternatives, with any emergency exception expressed through existing generic selector/posture/feature surfaces rather than engine code.

### 2. Inventory the other 007 witness surfaces for constant placeholders

Reassess the YAML surfaces that 007 must witness:
- US rival-risk flip when US near win.
- Patrol+Govern beats Train+Govern when LoCs/Econ are threatened.
- Sweep+Raid exposes before removal.
- Transport refuses origin-control loss.
- Pre-Coup posture avoids redeploy-undone Troop placement.

Patch only missing or placeholder authored semantics required for those witnesses. If a surface is already behavior-selective enough, record it as verified-no-edit in this ticket's outcome rather than changing it.

### 3. Keep the prerequisite YAML-only

Do not add engine/compiler/kernel changes. Do not add the six 007 profile-quality witness files here unless live implementation proves a tiny focused YAML regression is necessary to protect this prerequisite before 007 runs.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `tickets/188FITLFOUFAC-007.md` (modify only if implementation discovers additional dependency wording needed before returning to 007)

## Out of Scope

- The six ARVN profile-quality witness files named by 007.
- Re-authoring `arvn-train-govern-separation.test.ts`.
- US/NVA/VC skeleton work.
- Engine, compiler, kernel, schema, or shared runtime changes.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the updated ARVN YAML and no diagnostics.
2. The authored ARVN selector/posture surfaces needed by ticket 007 are no longer constant placeholders where ticket 007 requires behavior-specific ordering or demotion.
3. Existing ARVN Train+Govern separation still passes.
4. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No engine/compiler/kernel diff is introduced.
2. All FITL-specific behavior remains authored in `data/games/fire-in-the-lake/92-agents.md`.
3. Ticket 007 remains the owner of the profile-quality witnesses and depends on this prerequisite.

## Test Plan

### New/Modified Tests

1. None required by default; this is a YAML authoring prerequisite. If implementation adds a focused regression, it must be narrow and must not replace ticket 007's profile-quality witnesses.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`
3. `pnpm -F @ludoforge/engine test:all`
