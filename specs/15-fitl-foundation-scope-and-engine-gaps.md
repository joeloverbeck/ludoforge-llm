# Spec 15: Fire in the Lake Foundation Scope and Engine Gaps

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: M
**Dependencies**: Spec 06, Spec 08b, Spec 10, Spec 12
**Estimated effort**: 1-2 days
**Source sections**: brainstorming FITL foundation intro, rules 1.0-6.3, two-card appendix

## Overview

Define the exact implementation boundary for the Fire in the Lake (FITL) foundation and enumerate required schema/compiler/runtime capability gaps before FITL content implementation starts.

This spec is an architecture contract: **engine code remains game-agnostic**, while FITL-specific rules and content are encoded in `GameSpecDoc` YAML and compiled data assets.

## In Scope

- Foundation-only FITL slice: setup, map/state model, turn flow, operations, special activities, coup flow, victory checks, and cards 82 and 27.
- Deterministic rule interpretation for ambiguous transcription areas.
- Explicit list of `GameSpecDoc`/compiler/runtime capability extensions needed to express FITL without hardcoding FITL logic in engine code.
- Backward compatibility for existing games/specs in this repo.

## Out of Scope

- Full 130-card deck.
- Section 8 non-player flowchart AI.
- Optional advanced modules outside foundation loop.

## Non-Negotiable Architecture Constraints

- Engine/core runtime must not branch on FITL-specific identifiers (faction names, card ids, space names, marker names, operation names).
- FITL rules must be represented as declarative data (`GameSpecDoc` YAML + static data assets), not handwritten FITL rule handlers inside generic engine modules.
- Any new runtime primitive introduced for FITL must be named and shaped as a reusable cross-game capability.
- Compiler lowering must remain deterministic and auditable: every high-level rule compiles into explicit, trace-visible effects/choices.
- Deterministic tie-break behavior must be explicit in spec data whenever player choice is absent.

## Anti-Goals

- No "just for FITL" switch statements in generic engine code.
- No ad hoc runtime inference of map adjacency from artwork or naming patterns.
- No hidden rule behavior inside test helpers that is not representable in `GameSpecDoc`.
- No partial feature additions that cannot be expressed through schema-validated data.

## Required Gap Analysis Deliverables

1. `GameSpecDoc` expressiveness matrix mapping each required FITL mechanic to current schema support.
2. Compiler lowering matrix showing how each mechanic becomes deterministic `GameDef` actions/triggers/effects.
3. Runtime capability matrix listing required new generic primitives (if any), including reusable naming and invariants.
4. Determinism checklist for all random/ordering branches (die rolls, tie-breakers, execution order).
5. "No hardcoded FITL logic" audit checklist with concrete code-level acceptance checks.

## P0 Gaps to Resolve Before Content Specs Proceed

- **Typed domain tracks and markers**: Generic representation for multi-track political/economic/military state (Support/Opposition, Control, Resources, Aid, Patronage, Trail, Eligibility, Terror) without embedding FITL enums in engine internals.
- **Piece state dimensions**: Generic piece-state tags (for statuses like Underground/Active/Tunneled) and rule-safe state transitions.
- **Declarative operation framework**: Data-driven composition of costs, eligibility, target filters, sequencing, and "execute as much as possible" semantics.
- **Choice + target DSL expressiveness**: Ability to declare bounded choices ("up to N"), alternative branches (A or B), and cross-space aggregate constraints in data.
- **Event lifecycle model**: Generic card/event lifecycle support for dual-use events, one-card lookahead sequencing constraints, and temporary lasting effects.
- **Deterministic ordering contracts**: Global reusable ordering policy for space iteration, target resolution, and tie-breaking where no player choice exists.
- **Map dataset ingestion**: Versioned static map dataset with explicit adjacency/value data and provisional edge annotation support.

## Mapping to Downstream Specs

- Spec 16 consumes: typed tracks/markers, piece-state dimensions, map dataset ingestion.
- Spec 17 consumes: event lifecycle model, deterministic ordering contracts.
- Spec 18 consumes: declarative operation framework, choice + target DSL.
- Spec 19 consumes: typed tracks/markers and deterministic recomputation semantics.
- Spec 20 consumes: event lifecycle model and choice + target DSL.
- Spec 21 verifies: determinism + "no hardcoded FITL logic" architecture constraints.

## Acceptance Criteria

- A reviewed fit-gap table exists in `specs/` and is referenced by every FITL implementation spec (16-21).
- For every identified gap, there is either:
  - a no-change proof (already representable), or
  - a concrete schema/compiler/runtime capability proposal with tests.
- Each P0 gap is mapped to exactly one owning downstream spec with explicit acceptance tests.
- A documented architecture audit confirms no FITL-specific logic was introduced in generic engine modules.
- No FITL content implementation starts until each P0 gap has a tracked resolution path.

## Testing Requirements

- Unit tests validating each new schema field and compiler diagnostic path introduced by this spec.
- Unit tests for deterministic ordering/evaluation semantics introduced by new runtime primitives.
- Regression tests proving existing non-FITL games/specs compile and execute unchanged.
