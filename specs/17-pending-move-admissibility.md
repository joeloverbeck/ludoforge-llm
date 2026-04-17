# Spec 17: Pending Move Admissibility

**Status**: Draft
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 16, Spec 132
**Estimated effort**: 4-5 days
**Source**: Post-ticket analysis from `132AGESTUVIA-004`; repeated mismatches between move enumeration, direct viability probing, and agent-facing pending template handling

## Overview

Define a single architectural contract for when an incomplete move may be surfaced beyond raw legal-move discovery. The engine currently has multiple layers that reason about pending moves:

- `legalMoves(...)`
- `enumerateLegalMoves(...)`
- `probeMoveViability(...)`
- decision-sequence satisfiability/admission
- agent move preparation

Those layers are individually useful, but the current architecture does not explicitly define when a move is admissible as an incomplete/pending move for downstream clients. This spec closes that gap.

## Problem Statement

The engine has historically allowed this failure mode:

1. raw legal-move discovery emits a template move
2. viability probing or special-case rewriting preserves it as `viable && !complete`
3. downstream preparation cannot realize any playable completion on the sampled path
4. simulator/agent surfaces are left to absorb the mismatch

That means the system lacks a canonical invariant for pending move admissibility. A move should not become "agent-visible pending work" merely because one layer cannot yet prove it impossible. The engine needs one shared definition for admissibility.

## Goals

- Define when an incomplete move is admissible for downstream clients.
- Define the relationship between legality, viability, satisfiability, and completion.
- Prevent false-positive pending moves from leaking to agents.
- Preserve legitimate deferred free-operation templates and other state-dependent pending moves.

## Non-Goals

- No change to GameSpec authoring format.
- No policy search.
- No game-specific special handling.
- No requirement that raw discovery fully solve completion.

## Definitions

### Raw legal template

A move shape discovered during legal-move generation before completion feasibility is fully established.

### Pending admissible move

An incomplete move that is allowed to cross the engine-client boundary because it satisfies the shared admissibility contract.

### Pending inadmissible move

A move that may appear during internal discovery but MUST NOT be exposed to agents or other downstream clients as a legitimate candidate.

## Contract

### 1. Admissibility rule

An incomplete move may be surfaced as a pending admissible move only if all of the following hold:

1. it is legal in the current state under the shared legality surface
2. it is not structurally unsatisfiable under the shared completion contract
3. its remaining incompleteness corresponds to a real pending decision or a real stochastic boundary, not merely a failure to classify the branch precisely

### 2. Illegal "floating incomplete" shape

The following shape is not admissible on the client boundary:

- `viable === true`
- `complete === false`
- `nextDecision === undefined`
- `nextDecisionSet === undefined`
- `stochasticDecision === undefined`

If such a shape appears internally, the engine MUST either:

- refine it into a more precise admissible pending shape, or
- reject it before exposing it to downstream clients

### 3. Shared parity requirement

For any move exposed by `enumerateLegalMoves(...)`, the following layers must agree on its broad class:

- legality/discovery
- viability probing
- decision-sequence admission
- completion contract

They do not need identical internal representations, but they MUST agree on whether the move is:

- complete and executable
- pending but admissible
- inadmissible / structurally impossible

### 4. Deferred free-operation templates

This spec explicitly allows deferred free-operation templates to remain admissible when:

- the move is genuinely state-dependent
- completion has not yet resolved the relevant zone/choice bindings
- the move still corresponds to a real pending decision path

This spec does **not** allow such templates to bypass admissibility simply because a special-case rewrite marks them `viable && !complete`.

### 5. Client boundary ownership

Agents, simulator, runner worker, and evaluation/reporting layers MUST treat engine-classified pending admissible moves as authoritative. They MUST NOT be responsible for deciding whether a pending move should have been surfaced in the first place.

## Required Invariants

1. No engine client should receive a pending move that is structurally impossible under the shared completion contract.
2. No engine client should be asked to distinguish "admissible pending move" from "internal discovery artifact" using private heuristics.
3. If a move is exposed as pending admissible, bounded completion/preparation must be able to make progress on it under the shared completion contract.
4. Deferred free-operation templates that are genuinely satisfiable must continue to be representable.

## Foundations Alignment

- **Foundation #5 One Rules Protocol**: admissibility is an engine-level contract, not a simulator/agent convention.
- **Foundation #8 Determinism**: admissibility outcomes must be stable for identical inputs.
- **Foundation #10 Bounded Computation**: the admissibility contract may rely on bounded satisfiability/admission checks only.
- **Foundation #12 Validation Boundary**: admissibility is state-dependent kernel work.
- **Foundation #15 Architectural Completeness**: removes the ambiguity between legality and agent-facing pending status.
- **Foundation #16 Testing as Proof**: requires parity tests across the engine surfaces.

## Required Proof

### Unit / Kernel Proof

1. A pending move with no pending-decision/stochastic continuation MUST be rejected before reaching downstream agent preparation.
2. Valid deferred free-operation templates with real pending decision paths MUST remain admissible.
3. Enumeration/probe/admission parity tests must cover at least one admissible deferred free-operation fixture and one inadmissible false-positive fixture.

### Integration Proof

1. Known replay witnesses that previously surfaced false-positive pending moves MUST stop failing at the agent boundary.
2. Existing valid free-operation template fixtures MUST continue to complete successfully.
3. Removal of `agentStuck` and equivalent simulator-era masking behavior must remain safe under these admissibility rules.

## Implementation Direction

The intended implementation boundary is shared engine classification:

- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/src/kernel/viability-predicate.ts`
- decision-sequence admission helpers

This spec prefers strengthening the shared admissibility boundary over adding more downstream retries or fallbacks.
