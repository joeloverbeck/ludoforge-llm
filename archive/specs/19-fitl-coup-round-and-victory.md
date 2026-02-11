# Spec 19: Fire in the Lake Coup Round and Victory

**Status**: ✅ COMPLETED
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 16, Spec 17, Spec 18
**Estimated effort**: 3-4 days
**Source sections**: rules 2.4, 6.0-7.3, 1.6-1.9 in brainstorming text
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement full Coup-round handling and victory computation for foundation play, with all phase effects executed deterministically via data-driven rules compiled from `GameSpecDoc` YAML into a game-agnostic `GameDef`.

## In Scope

- Full Coup round phase machine from rules 6.0:
  - Victory phase (6.1)
  - Resources phase (6.2)
  - Support phase (6.3)
  - Redeploy phase (6.4)
  - Commitment phase (6.5, non-final rounds only)
  - Reset phase (6.6, non-final rounds only)
- Consecutive-Coup exception from 6.0/2.4.2 (never more than 1 Coup round in a row).
- Final-Coup end handling and ranking/margin computation (7.1-7.3).
- Deterministic recomputation of score tracks from canonical state (support/opposition, control, bases, available US pieces).
- Coupled track effects and bounds: resources, aid, patronage, total econ, trail, casualties interactions.
- Control recalculation windows required by 6.4.4 and 6.5.
- Coup and victory logic represented in FITL YAML data and compiled to `GameDef` (no required runtime dependency on `data/fitl/...`).

## Out of Scope

- Deception marker option and handicap option (7.3 optional rule).
- Non-player victory exceptions beyond deterministic stubs required for foundation execution.

## Architecture Requirements

- Canonical path remains `GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation for all Coup/victory behavior.
- Runtime and compiler code must not branch on FITL-specific identifiers; any new primitive must be reusable across titles.
- Victory thresholds, margin formulas, and phase-order policy are data-defined in YAML and lowered into generic `GameDef` expressions.
- No mutable shadow scoreboard: all victory tracks and margins are recomputed from canonical board/track state at explicit checkpoints.
- Ordering with no player choice must be explicit and deterministic (consistent with Spec 17 ordering contract).

## Functional Requirements

- Coup round sequencing is explicit, immutable, and trace-visible per executed substep.
- 6.2 Resources phase behavior includes:
  - Sabotage placement loop until no eligible markers remain.
  - Trail degradation check from COIN control in Laos/Cambodia.
  - ARVN earnings from Aid + unSabotaged LoC Econ; update `Total Econ` marker.
  - Insurgent earnings for VC and NVA formulas.
  - Aid penalty from casualties (`Aid -= 3 * casualties`, floor 0).
- 6.3 Support phase includes:
  - US then ARVN Pacification with shared max-4-space budget and per-space max-2-shift cap.
  - US spending restriction: ARVN resources may not drop below `Total Econ`.
  - VC Agitation with max-4-space budget and per-space max-2-shift cap.
- 6.4 Redeploy phase includes:
  - Forced Laos/Cambodia COIN removal behavior.
  - Mandatory/optional ARVN troop/police redeploy constraints.
  - Optional NVA troop redeploy to NVA bases.
  - Control recomputation after redeploy moves.
- 6.5 Commitment phase (non-final rounds):
  - Casualty transitions (out-of-play vs available).
  - US commitment/withdrawal movement limits.
  - Control and victory-marker recomputation after commitment.
- 6.6 Reset phase (non-final rounds):
  - Trail normalization edge rule (0 -> 1, 4 -> 3).
  - Terror/sabotage clear, guerrilla/SF flip underground, momentum discard, eligibility reset, next-card advance.
- Victory checks:
  - During Coup rounds, evaluate threshold wins (7.2): US `>50`, NVA `>18`, ARVN `>50`, VC `>35`.
  - After final Coup, compute and publish margins (7.3):
    - US: `TotalSupport + AvailableUSBasesAndTroops - 50`
    - NVA: `NVAPopulationControl + NVABasesOnMap - 18`
    - ARVN: `COINPopulationControl + Patronage - 50`
    - VC: `TotalOpposition + VCBasesOnMap - 35`
  - Ranking/tie-break metadata is deterministic and emitted in terminal result.

## Acceptance Criteria

- Coup round executes all required phases in rule order, honoring final-round skips and consecutive-Coup exception.
- Score tracks and victory margins are reproducible from state snapshots without incremental drift.
- Final Coup terminates the game and emits complete winner/ranking/margin metadata.
- All Coup/victory semantics execute exclusively through the single path `GameSpecDoc` -> `GameDef` -> simulation.
- No FITL-specific branch is added to generic runtime/compiler modules.

## Testing Requirements

- Unit tests per Coup phase including bounds/caps/floors (`0..75`, trail `0..4`).
- Deterministic tests for consecutive-Coup handling and final-round branching.
- Golden tests for interim victory checks and final-Coup margin/ranking outputs.
- Regression tests proving Coup/victory compile+run from embedded FITL YAML assets without required `data/fitl/...` runtime reads.

## Outcome

- Completion date: 2026-02-11
- Implemented scope:
  - Declarative `coupPlan` and `victory` contracts are compiled from `GameSpecDoc` YAML and executed in terminal/runtime paths.
  - Coup lifecycle sequencing, consecutive-coup gating, and final-coup ranking metadata are covered by unit and integration tests.
  - Embedded FITL YAML asset pipeline now has dedicated coup/victory compile+run regression coverage.
- Not implemented by this spec:
  - Optional deception marker and handicap rules (remained out of scope).
