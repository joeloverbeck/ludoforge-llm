# Spec 48: FITL Section 5 Rules Gaps

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 26 (operations), Spec 27 (SAs), Spec 29 (event card encoding)
**Estimated effort**: 3-5 days
**Source sections**: FITL Rules Section 5 (Events) gap analysis

## Overview

Gap analysis of FITL Rules Section 5 (Events — execution semantics, overrides, capabilities, momentum, free operations) against the FITL implementation (`data/games/fire-in-the-lake/`) and the engine kernel (`packages/engine/src/kernel/`).

Final implemented state: Section 5 is fully implemented, including Rule 5.1.2.

Implementation followed a data-first architecture:
- encode Rule 5.1.2 precedence via FITL legality predicates guarded by `__freeOperation`
- add/strengthen integration coverage in existing FITL test suites
- keep the shared kernel generic (no FITL-specific fallback enumeration path)

Legacy planning sections below are retained for historical traceability but are superseded by the completion outcome.

## Gap Analysis Summary

| # | Gap | Rule | Status | Action |
|---|-----|------|--------|--------|
| 1 | Free operations blocked by momentum | 5.1.2 | COMPLETED | FITLSEC5RULGAP-001 + FITLSEC5RULGAP-002 (archived) |

## Verified Correct (No Changes Needed)

| Rule | Section | Status |
|------|---------|--------|
| 5.1 | Literal, ordered execution | Correct — effects as ordered YAML arrays; kernel processes sequentially |
| 5.1.1.a | Stacking limits | Correct — engine runtime `enforceStacking()` on every moveToken/createToken/moveAll |
| 5.1.1.b | Piece availability | Correct — `place-from-available-or-map` macro throughout |
| 5.1.1.c | Tunneled base protection | Correct — removal filters exclude tunneled by default |
| 5.1.1.d | Resource cap 75 | Correct — engine auto-clamps via variable min/max |
| 5.1.3 | Mandatory partial execution | Correct — kernel sequential processing; transferVar "do what you can" semantics |
| 5.1.4 | Pivotal events | Correct — playCondition, interrupt precedence, monsoon block, coup restriction |
| 5.2 | Dual-use (faction-agnostic) | Correct — sideMode: dual with no faction gate |
| 5.3 | Capabilities (permanent) | Correct — 19 tri-state markers, NOT reset at coup |
| 5.4 | Momentum (until Coup Reset) | Correct — 15 boolean flags, lastingEffects + belt-and-suspenders coup-reset-markers |
| 5.5 | Free ops cost/eligibility | Correct — `__freeOperation` binding bypasses action-level costs |
| 5.5 | Pac/Trail/Agit still cost | Correct — costs embedded in effects (not cost array), fire unconditionally |

## Scope

### In Scope

- Engine kernel change: independent enumeration fallback in `applyPendingFreeOperationVariants`
- Skipping pipeline `legality:` and `costValidation:` blocks for free operation independent enumeration
- FITL integration tests for momentum + free operation scenarios
- Leveraging existing `skipPipelineDispatch` option in `actionApplicabilityPreflight`

### Out of Scope

- FITL game data YAML changes (all data is correct)
- Compiler source changes
- Capability or momentum variable changes
- Changes to how `__freeOperation` binding works at execution time
- Changes to the 4 hard exceptions (stacking, resource cap, piece availability, tunneled bases) — these are already enforced outside pipeline blocks

---

## FITLSEC5RULGAP-001: Engine — Free Operation Independent Enumeration

**Priority**: P1
**Estimated effort**: Medium-Large (2-3 days)
**Rule reference**: 5.1.2
**Depends on**: None

### Summary

Rule 5.1.2: *"If two Events contradict each other, the currently played Event takes precedence."* Example: *"US could Air Lift with MACV even with Typhoon Kate in effect."*

Currently, `applyPendingFreeOperationVariants` in `legal-moves-turn-order.ts` creates free operation variants by iterating over existing legal moves plus bare `{ actionId, params: {} }` stubs from pending grants. Each candidate is checked via `isFreeOperationApplicableForMove` and `resolveMoveDecisionSequence`. However, when momentum restrictions in pipeline `legality:` blocks reject the action entirely (e.g., Typhoon Kate blocks Air Lift), the action's preflight returns `notApplicable` with reason `pipelineNotApplicable`, and no free variants can be created — the grant is silently dropped.

### Root Cause (Architectural)

1. `__freeOperation` is a **runtime execution-time binding** only available during `applyMove` — NOT during legal move enumeration
2. Free operation variants are created by `applyPendingFreeOperationVariants` which iterates existing legal moves + bare action stubs from grants
3. Momentum restrictions live in pipeline `legality:` blocks (evaluated during enumeration preflight)
4. The existing `skipPipelineDispatch` option in `actionApplicabilityPreflight` can skip pipeline dispatch entirely, but it is not used for free operation enumeration
5. If momentum blocks ALL base moves for an action, no free variants survive — the grant is silently dropped

### Affected Momentum-Operation Pairs

| Operation/SA | Blocking Momentum | legality: Location |
|---|---|---|
| Air Lift | `mom_medevacShaded`, `mom_typhoonKate` | `30-rules-actions.md` air-lift-profile legality |
| Air Strike | `mom_rollingThunder`, `mom_daNang`, `mom_bombingPause` | `30-rules-actions.md` air-strike-profile legality |
| US Assault | `mom_generalLansdale` | `30-rules-actions.md` assault-us-profile legality |
| Transport | `mom_typhoonKate` | `30-rules-actions.md` transport-profile legality |
| Bombard | `mom_typhoonKate` | `30-rules-actions.md` bombard-profile legality |
| Infiltrate | `mom_mcnamaraLine` | `30-rules-actions.md` infiltrate-profile legality |
| NVA Ambush | `mom_claymores` | `30-rules-actions.md` nva-ambush-profile legality |
| VC Ambush | `mom_claymores` | `30-rules-actions.md` vc-ambush-profile legality |

**Note**: Space-limit momentum effects (Typhoon Kate reducing SA spaces, 559th Transport Group) are in `chooseN` constraints within effects, where `__freeOperation` IS available at runtime. Those are NOT affected.

### Real Gameplay Scenarios

- MACV (card-69) grants US any free SA → blocked by Typhoon Kate/Medevac/Rolling Thunder
- Gulf of Tonkin (card-1) grants US free Air Strike → blocked by Rolling Thunder/Da Nang/Bombing Pause
- Operation Attleboro (card-23) grants US free Air Lift+Sweep+Assault chain → Air Lift blocked by Typhoon Kate
- Any event granting free March/Attack Ambush → blocked by Claymores
- Any event granting free Infiltrate → blocked by McNamara Line

### Change Description

In `applyPendingFreeOperationVariants` (`packages/engine/src/kernel/legal-moves-turn-order.ts`), add a **fallback independent enumeration path** for free operation grants that produced no matching legal moves:

1. After the current enumeration loop, check which pending grants have zero matching free variants
2. For each unmatched grant, independently enumerate moves for the granted action IDs with:
   - `pre:` conditions on the action: **still checked** (fundamental game rules)
   - Pipeline `legality:` and `costValidation:`: **skipped** (via existing `skipPipelineDispatch: true` on preflight)
   - Grant's `zoneFilter`: **still applied**
   - Grant's `actionIds`: **filter to only granted actions**
   - Result moves: marked `freeOperation: true`

### Why Skipping Pipeline Dispatch Is Safe

The 4 hard exceptions from Rule 5.1.1 are enforced OUTSIDE pipeline legality/costValidation:
- **Stacking** → `enforceStacking()` in `effects-token.ts` (runtime, every token operation)
- **Resource cap** → `clamp()` in `effects-var.ts` (runtime, every variable mutation)
- **Piece availability** → zone queries in effects + `place-from-available-or-map` macro
- **Tunneled bases** → removal filters in effects (`tunnel != tunneled` guards)

None of these live in `legality:` blocks. The `legality:` blocks contain only momentum restrictions and cost validation — both of which Rule 5.1.2 overrides for free operations.

### Key Implementation Detail

The existing `skipPipelineDispatch` option on `actionApplicabilityPreflight` already provides the mechanism needed. The free operation independent enumeration path should pass `skipPipelineDispatch: true` when calling the preflight for unmatched grants. This avoids inventing new options — it reuses infrastructure that already exists but is currently unused for free operation enumeration.

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/legal-moves-turn-order.ts` | `applyPendingFreeOperationVariants`: add fallback enumeration for unmatched grants using `skipPipelineDispatch: true` |
| `packages/engine/src/kernel/legal-moves.ts` | May need to expose an enumeration helper that accepts `skipPipelineDispatch` passthrough |
| `packages/engine/src/kernel/action-applicability-preflight.ts` | No changes expected — `skipPipelineDispatch` already exists |
| `packages/engine/src/kernel/types-operations.ts` | (if needed) Add enumeration options type |

### Tests

- Unit test: free operation grant with no matching base moves triggers independent enumeration
- Unit test: independent enumeration skips pipeline dispatch but respects `pre:` conditions
- Unit test: grant's `zoneFilter` still applied during independent enumeration
- Unit test: `actionIds` filter works correctly
- Unit test: existing behavior (grant WITH matching base moves) is unchanged

---

## FITLSEC5RULGAP-002: FITL Tests — Momentum + Free Operation Verification

**Priority**: P1
**Estimated effort**: Medium (1-2 days)
**Rule reference**: 5.1.2
**Depends on**: FITLSEC5RULGAP-001

### Summary

Add FITL-specific integration tests confirming Rule 5.1.2 behavior: free operations from the currently played event override momentum restrictions from prior events.

### Test Scenarios

1. **MACV + Typhoon Kate**: Set `mom_typhoonKate = true`, execute MACV event granting free SA to US. Verify Air Lift appears as a legal move despite Typhoon Kate blocking normal Air Lift.
2. **Gulf of Tonkin + Rolling Thunder**: Set `mom_rollingThunder = true`, execute Gulf of Tonkin granting free Air Strike. Verify Air Strike appears as a legal move.
3. **Free Ambush + Claymores**: Set `mom_claymores = true`, execute an event granting free Ambush. Verify Ambush appears as a legal move.
4. **Free Infiltrate + McNamara Line**: Set `mom_mcnamaraLine = true`, execute an event granting free Infiltrate. Verify Infiltrate appears as a legal move.
5. **Negative test**: Verify that NON-free operations are still correctly blocked by momentum (e.g., normal Air Lift blocked by Typhoon Kate when no free grant is active).

### Files

| File | Change |
|------|--------|
| `packages/engine/test/integration/fitl-rule-5-1-2-free-ops-momentum.test.ts` | New test file for Rule 5.1.2 scenarios |

---

## Outcome

- **Completion date**: 2026-02-24
- **What changed vs originally planned**:
  - The spec originally proposed a kernel fallback path (`skipPipelineDispatch`-based independent enumeration).
  - Final implementation took a cleaner architecture: encode Rule 5.1.2 directly in FITL data (`__freeOperation` legality guards), keep kernel generic, and expand integration tests.
  - Ticket outcomes are recorded in archived tickets:
    - `archive/tickets/FITLSEC5RULGAP-001.md`
    - `archive/tickets/FITLSEC5RULGAP-002.md`
- **Verification results**:
  - `pnpm turbo build` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
