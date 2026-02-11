# Spec 15: Fire in the Lake Foundation Scope and Engine Gaps

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: M
**Dependencies**: Spec 06, Spec 08b, Spec 10, Spec 12
**Estimated effort**: 1-2 days
**Source sections**: brainstorming FITL foundation intro, rules 1.0-6.3, two-card appendix

## Overview

Define the exact implementation boundary for the Fire in the Lake (FITL) foundation and lock Gate 0 architecture decisions before Specs 16-21 begin.

This spec is an architecture contract: engine code stays game-agnostic, and FITL behavior is encoded in `GameSpecDoc` YAML plus static data assets compiled into deterministic `GameDef` structures.

## Scope Contract

### In Scope

- Foundation FITL slice only: setup, map/state model, turn flow, operations, special activities, coup flow, victory checks, and cards 82/27.
- Deterministic interpretation choices for ambiguous transcription points.
- Explicit schema/compiler/runtime capability decisions required to express FITL via data.
- Backward compatibility for existing non-FITL games/specs.

### Out of Scope

- Full 130-card deck.
- Section 8 non-player flowchart AI.
- Optional advanced modules outside foundation loop.

## Non-Negotiable Architecture Constraints

- Engine/runtime modules must not branch on FITL identifiers (faction names, card ids, space ids, marker ids, operation names).
- FITL rules must be represented as declarative data (`GameSpecDoc` YAML + static assets), not handwritten FITL handlers.
- Any new runtime primitive must be reusable and named independent of FITL vocabulary.
- Compiler lowering must remain deterministic and auditable: each high-level rule lowers to trace-visible choices/effects.
- Deterministic tie-break behavior must be explicit in data whenever player choice is absent.

## Anti-Goals

- No FITL-only switch/if branches in generic engine code.
- No map adjacency inference from labels/artwork.
- No hidden rule behavior in test helpers that cannot be represented in `GameSpecDoc`.
- No partial capability additions that are not schema-validated.

## Required Deliverables

Spec 15 is complete only when all deliverables below exist and are accepted:

1. `GameSpecDoc` expressiveness matrix.
2. Compiler lowering matrix.
3. Runtime capability matrix.
4. Determinism checklist.
5. "No hardcoded FITL logic" audit checklist.

All deliverables are captured in `specs/15a-fitl-foundation-gap-analysis-matrix.md`.

## P0 Gap Ownership (Single Owner per Gap)

Each P0 gap has exactly one owning downstream spec. Non-owning specs may consume the capability but do not own closure.

| P0 Gap | Owning Spec | Ownership Rationale | Required Acceptance Tests |
| --- | --- | --- | --- |
| Typed domain tracks and markers | Spec 16 | State model and setup are the canonical source of track/marker representation. | `fitl-state-tracks.spec.ts`, `fitl-state-invariants.spec.ts` |
| Piece state dimensions | Spec 16 | Piece typing/status is part of foundational state encoding. | `fitl-piece-status.spec.ts`, `fitl-state-invariants.spec.ts` |
| Declarative operation framework | Spec 18 | Operations/special activities are the primary consumer and validator of framework semantics. | `fitl-ops-legality.spec.ts`, `fitl-op-sequencing.spec.ts` |
| Choice + target DSL expressiveness | Spec 18 | Complex bounded/aggregate targeting semantics are first required in ops layer. | `fitl-choice-targeting.spec.ts`, `fitl-op-sequencing.spec.ts` |
| Event lifecycle model | Spec 17 | Turn/card sequencing and lifecycle windows are owned by card-flow semantics. | `fitl-card-lifecycle.spec.ts`, `fitl-eligibility-window.spec.ts` |
| Deterministic ordering contracts | Spec 17 | Global ordering policy must be defined before ops/events consume it. | `fitl-ordering-contract.spec.ts`, `fitl-card-flow-determinism.spec.ts` |
| Map dataset ingestion | Spec 16 | Map schema + ingestion + validation are state/data concerns. | `fitl-map-ingestion.spec.ts`, `fitl-map-validation.spec.ts` |

## Dependency Contract to Specs 16-21

- Spec 16 consumes and closes: typed tracks/markers, piece state dimensions, map dataset ingestion.
- Spec 17 consumes and closes: event lifecycle model, deterministic ordering contracts.
- Spec 18 consumes and closes: declarative operation framework, choice + target DSL.
- Spec 19 consumes previously closed track and ordering contracts; does not own P0 closure.
- Spec 20 consumes event lifecycle + choice/target capabilities; does not own P0 closure.
- Spec 21 verifies determinism and architecture audit outcomes end-to-end.

## Gate 0 Acceptance Criteria

- `specs/15a-fitl-foundation-gap-analysis-matrix.md` exists and is referenced by Specs 16-21.
- Every identified gap has either:
  - a no-change proof against existing schema/compiler/runtime capabilities, or
  - a concrete generic capability proposal with tests.
- Every P0 gap maps to exactly one owning spec (16-18 only).
- A documented audit checklist exists for confirming no FITL-specific engine branching.
- No Spec 16 implementation work starts until Gap 0 ownership and resolution paths are explicit.

## Testing Requirements for Spec 15 Work

- Unit tests for any new schema/compiler diagnostics introduced while closing Spec 15 gap proposals.
- Unit tests for deterministic ordering semantics introduced by generic runtime primitives.
- Regression tests proving existing non-FITL specs compile and execute unchanged.

## Verification Commands (Gate 0)

- `npm run build`
- targeted unit tests tied to the owning spec test files listed above
