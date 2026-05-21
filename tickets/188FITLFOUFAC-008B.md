# 188FITLFOUFAC-008B: Generic strategy-module profile isolation prerequisite exposed by US skeleton authoring

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic agent planner / compiler ownership only
**Deps**: `archive/tickets/188FITLFOUFAC-008A.md`

## Problem

Ticket 008's US skeleton authoring exposed a second generic planner/profile isolation gap. US `strategyModules` can be authored in YAML, but the compiled/profile proposal path still exposes library modules across profiles and does not provide a reliable profile/seat-local activation boundary for doctrine carriers during `proposeAdvisoryTurnPlan`.

The live 008 probe added US doctrine modules and templates in `data/games/fire-in-the-lake/92-agents.md`. The new US witnesses could be made locally green, but `pnpm -F @ludoforge/engine test:all` then failed `dist/test/unit/policy-guided-fitl-canary.golden.test.js`: the ARVN golden canary no longer found its differentiating policy-guided preview decision. Attempting to gate the US modules with `seat.self == us` did not activate them for US in plan proposal, which proves the active ticket cannot truthfully remain YAML-only until the generic strategy-module isolation contract is fixed.

## Assumption Reassessment (2026-05-21)

1. `docs/FOUNDATIONS.md` #1 and #2 forbid FITL-specific engine branches, but permit generic planner/compiler fixes that make authored GameSpecDoc policy data execute correctly.
2. `archive/tickets/188FITLFOUFAC-008A.md` fixed profile/template isolation for `use.planTemplates`; it did not fully isolate or seat-scope `strategyModules` used as doctrine carriers.
3. A YAML scoring workaround in ticket 008 would hide a generic architecture defect and conflict with Foundation #15's root-cause requirement.
4. The abandoned 008 probe was removed before this prerequisite handoff; this ticket owns the generic fix needed before US/NVA/VC skeleton authoring resumes.

## Architecture Check

1. Fix the generic strategy-module profile/seat contract rather than adding faction-specific runtime logic.
2. Keep GameSpecDoc as the policy-authoritative authoring surface: faction doctrine remains authored data, while the engine/compiler enforces generic profile isolation.
3. Do not introduce compatibility aliases or legacy fallback paths.

## What to Change

### 1. Isolate strategy modules to the active profile/seat

Ensure `proposeAdvisoryTurnPlan` and related compiled profile metadata only consider strategy modules that are valid for the effective profile and seat. The solution must not inspect FITL faction ids or action names.

### 2. Support authored seat/profile gating for doctrine carriers

If authored modules use generic seat/profile refs such as `seat.self`, ensure module activation evaluates those refs correctly in plan proposal. The fix should make a profile-authored doctrine carrier active for its own seat and inactive for unrelated seats without FITL-specific branching.

### 3. Add regression coverage

Add a generic unit or architecture test proving that another profile's strategy module cannot change the active profile's plan proposal. Preserve or add a FITL regression witness covering the discovered shape: adding US doctrine carriers must not change ARVN's policy-guided FITL canary or ARVN plan witnesses, while US modules can still activate for US.

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify, if runtime proposal owns the filter/activation)
- `packages/engine/src/cnl/compile-agents.ts` (modify, if compiled profile module ownership metadata is needed)
- `packages/engine/src/kernel/types-core.ts` / schema mirrors (modify only if a compiled contract field is added)
- `packages/engine/test/unit/agents/plan-proposal.test.ts` or an architecture equivalent (modify)
- `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` (modify only if needed to preserve the regression witness)

## Out of Scope

- Authoring the US skeleton itself; that returns to `tickets/188FITLFOUFAC-008.md`.
- NVA/VC skeleton authoring (`tickets/188FITLFOUFAC-009.md`, `tickets/188FITLFOUFAC-010.md`).
- FITL-specific planner branches, faction-id allowlists, or YAML priority workarounds.

## Acceptance Criteria

### Tests That Must Pass

1. A focused generic planner/compiler test proves cross-profile strategy modules cannot affect the active profile's proposal.
2. A focused proof shows authored seat/profile gating works for a profile's own strategy modules and stays inactive for other seats.
3. `node --test packages/engine/dist/test/unit/policy-guided-fitl-canary.golden.test.js` passes after the generic fix.
4. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No FITL-specific identifiers appear in engine/compiler implementation logic.
2. Strategy-module isolation is generic and deterministic.
3. US/NVA/VC skeleton tickets can remain Tier-1 YAML authoring after this prerequisite lands.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-proposal.test.ts` or equivalent — cross-profile strategy-module isolation and seat/profile-gated activation.
2. `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` — existing ARVN canary remains green with unrelated profile doctrine modules present.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <focused compiled strategy-module isolation test> packages/engine/dist/test/unit/policy-guided-fitl-canary.golden.test.js`
2. `pnpm -F @ludoforge/engine test:all`
