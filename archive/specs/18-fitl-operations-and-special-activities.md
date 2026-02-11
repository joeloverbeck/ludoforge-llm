# Spec 18: Fire in the Lake Operations and Special Activities

**Status**: ✅ COMPLETED
**Priority**: P0 (critical path)
**Complexity**: XL
**Dependencies**: Spec 15, Spec 16, Spec 17
**Estimated effort**: 5-7 days
**Source sections**: rules 3.0-4.5
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement faction Operations and Special Activities for US, ARVN, NVA, and VC, including costs, targeting constraints, movement/removal semantics, terrain modifiers, tunnel/base rules, and side effects on tracks, using generic data-driven operation primitives.

Spec 18 is the owning closure spec for these Spec 15a P0 gaps:
- Declarative operation framework.
- Choice + target DSL expressiveness.

## In Scope

- COIN Operations: Train, Patrol, Sweep, Assault.
- Insurgent Operations: Rally, March, Attack, Terror.
- US Special Activities: Advise, Air Lift, Air Strike.
- ARVN Special Activities: Govern, Transport, Raid.
- NVA Special Activities: Infiltrate, Bombard, Ambush.
- VC Special Activities: Tax, Subvert, Ambush.
- Free-operation interaction rules where relevant.

## Out of Scope

- Non-player operation priorities (section 8 flowcharts).

## Architecture Contract

- Canonical execution path is `GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation.
- FITL behavior must be represented in game-specific YAML data and compiled output, not hardcoded runtime branches.
- New runtime/compiler capabilities introduced by this spec must remain generic and reusable by non-FITL games.
- `data/fitl/...` artifacts are optional references only and must not be required runtime inputs for operation execution.
- FITL operation text must first be decomposed into reusable primitives; faction/operation specifics then bind those primitives as data.

## Required Capability Closures (from Spec 15a)

### 1) Declarative Operation Framework

- Define a generic operation profile contract expressible in `GameSpecDoc` data and lowered deterministically into `GameDef`:
  - legality predicates
  - cost model (including free-operation and limited-operation interactions)
  - target selection plan
  - ordered resolution/effect pipeline
  - partial execution policy
  - optional linked special activity windows
- Compiler diagnostics must reject operation definitions with ambiguous or underspecified legality/cost/target/resolution behavior.

### 2) Choice + Target DSL Expressiveness

- Add reusable optional-cardinality selection support (`up to N`) in addition to exact `N` choices.
- Support aggregate/cross-space constraints in target validation while preserving deterministic output ordering.
- Require explicit tie-break policy whenever resolution does not involve player choice.

## Semantics and Determinism Rules

- Every operation must have a deterministic space processing order.
- Every multi-target removal must have deterministic tie-break rules if player choice is absent.
- Resource spend validation must fail before partial execution unless rule text explicitly supports partial execution.
- Tunnel/base removal logic must follow explicit rule sequence, including die-roll gates.
- All probabilistic branches (including die-roll gates) must consume seeded RNG deterministically and emit trace-visible outcomes.
- Deterministic ordering policy from Spec 17 must be explicitly applied to all non-choice iteration points used by operations.

## FITL Encoding Requirements

- Encode all 16 operation/special-activity families as data-backed operation profiles.
- Encode operation-specific constraints in YAML data, including:
  - Monsoon movement/targeting restrictions where applicable.
  - Highland and terrain-based operation modifiers.
  - bases-last removal and tunneled-base handling constraints.
  - underground/active status transitions and activation semantics.
  - stacking and placement constraints tied to availability/replacement rules.
- Encode cross-faction resource rules (for example, US spend from ARVN constraints) declaratively rather than in FITL-specific engine branches.
- Encode free operations and limited operations as generic execution-mode semantics reusable beyond FITL.

## Acceptance Criteria

- All 16 operation/special-activity families execute with rule-correct state transitions.
- Cost accounting matches rules and is trace-visible.
- Illegal operation attempts produce diagnostics tied to faction/rule reason.
- Same seed plus same choices yields byte-equivalent trace deltas.
- Operation behavior is declared in FITL game data, with engine/compiler code limited to generic reusable primitives.
- Operations execute through the single path `GameSpecDoc` -> `GameDef` -> simulation.
- Spec 15a P0 closures are complete for:
  - declarative operation framework
  - choice + target DSL expressiveness
- Audit passes: no FITL-specific branch logic added to shared kernel/compiler modules.

## Testing Requirements

- Unit tests for generic operation framework semantics (legality, cost, targeting, sequencing, partial-execution policy).
- Unit tests for optional-cardinality target selection (`up to N`) and aggregate constraint validation.
- Unit tests per FITL operation and special activity family (data-driven through compiled `GameDef`).
- Edge-case tests: Monsoon restrictions, Highland modifiers, bases-last removal, tunneled-base behavior, and cross-faction resource constraints.
- Integration tests for Op + Special Activity sequencing, free-op interactions, and limited-operation constraints in card-flow context.
- Determinism regression: same seed + same move sequence yields byte-identical trace output for operation-heavy scenarios.

## Outcome
- **Completion date**: 2026-02-11
- **What was changed**:
  - Implemented and validated all 16 FITL operation/special-activity families through data-driven operation profiles and integration suites.
  - Added operation-heavy determinism replay coverage in `test/integration/fitl-card-flow-determinism.test.ts`.
  - Added explicit shared engine audit coverage in `test/unit/no-hardcoded-fitl-audit.test.ts` to guard against FITL-id/name branching in `src/kernel` and `src/cnl`.
- **Deviations from original plan**:
  - Determinism regression was implemented as integration assertions over compiled fixtures rather than a dedicated new golden fixture artifact.
  - Existing focused integration tests were retained instead of adding a redundant consolidated e2e file.
- **Verification results**:
  - `npm run build` passed.
  - `npm run test:unit -- --coverage=false` passed.
  - Targeted Spec 18 integration/determinism checks passed.
  - `npm test` passed.
