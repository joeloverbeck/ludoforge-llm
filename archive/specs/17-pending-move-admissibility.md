# Spec 17: Pending Move Admissibility

**Status**: COMPLETED
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 16 (archived; COMPLETED 2026-04-17), Spec 132 (archived; COMPLETED 2026-04-17)
**Estimated effort**: 2-3 days
**Source**: Post-ticket analysis from `132AGESTUVIA-004`; repeated mismatches between move enumeration, direct viability probing, and agent-facing pending template handling

## Overview

Define a single architectural contract for when an incomplete move may be surfaced beyond raw legal-move discovery. Spec 132 closed the seed-1000 crash by unifying probe logic, fixing the retry budget, and removing `agentStuck` from the simulator stop-reason set. Spec 16 formalized the `TemplateCompletionResult` contract and locked its outcomes in with isolated invariant tests. What remains is the admissibility layer that sits above completion: which incomplete moves may be **classified as pending admissible** and exposed across the engine-client boundary.

The engine currently reasons about pending moves through multiple layers:

- `legalMoves(...)`
- `enumerateLegalMoves(...)`
- `probeMoveViability(...)`
- decision-sequence satisfiability/admission helpers (`classifyMoveDecisionSequenceAdmissionForLegalMove`)
- agent move preparation (`classifyPlayableMoveCandidate`, `classifyCompletedTemplateMove`, `preparePlayableMoves`)

Each layer is individually useful, but the admissibility classification is enforced at three separate call sites with overlapping-but-non-identical semantics:

- `packages/engine/src/kernel/legal-moves.ts:327-354` (enumeration layer, warning code `MOVE_ENUM_PROBE_REJECTED`)
- `packages/engine/src/kernel/playable-candidate.ts:63-67` (pre-completion classify, rejection `notDecisionComplete`)
- `packages/engine/src/kernel/playable-candidate.ts:93-98` (post-completion classify, rejection `drawDeadEnd`)

No module owns the admissibility predicate. This spec centralizes the classifier and proves cross-layer agreement.

## Problem Statement

Admissibility is currently **code-enforced but not spec-codified, and not proven by a cross-layer parity test**. Three independent call sites each enforce part of the rule:

1. enumeration rejects the "floating incomplete" shape (`viable && !complete` with all three pending-decision refs `undefined`) when decision-sequence admission returns `'unsatisfiable'`
2. pre-completion classification rejects any pending shape that is not complete-or-stochastic
3. post-completion classification rejects completion-contract violations as `drawDeadEnd`

These three sites were introduced piecemeal across Specs 132 and 16. They share an underlying predicate — "a pending admissible move must point to a real decision or stochastic continuation under the shared completion contract" — but nothing currently factors that predicate out. A future refactor can silently weaken one site while the other two still pass regression tests, and no existing test asserts that the four layers (legality, viability, admission, completion) agree on a move's broad class.

The "floating incomplete" shape (`viable: true, complete: false, nextDecision: undefined, nextDecisionSet: undefined, stochasticDecision: undefined`) has exactly one construction site today: `deriveMoveViabilityVerdict` at `packages/engine/src/kernel/viability-predicate.ts:108-127`, triggered only by `isDeferredFreeOperationTemplateZoneFilterMismatch`. Without a shared admissibility classifier, a new construction site could be introduced without any single place in the codebase noticing.

## Goals

- Define when an incomplete move is admissible for downstream clients.
- Centralize the admissibility predicate/classifier into a shared kernel module.
- Define the relationship between legality, viability, satisfiability, and completion.
- Prevent false-positive pending moves from leaking to agents.
- Preserve legitimate deferred free-operation templates and other state-dependent pending moves.
- Prove cross-layer parity via an explicit integration test.

## Non-Goals

- No change to GameSpec authoring format.
- No policy search.
- No game-specific special handling.
- No requirement that raw discovery fully solve completion.
- No semantic changes to `TemplateCompletionResult` (Spec 16 territory).
- No changes to agent retry budgets or policy (caller prerogative per Spec 16 Contract §4).

## Definitions

### Raw legal template

A move shape discovered during legal-move generation before completion feasibility is fully established.

### Pending admissible move

An incomplete move that is allowed to cross the engine-client boundary because it satisfies the shared admissibility contract.

### Pending inadmissible move

A move that may appear during internal discovery but MUST NOT be exposed to agents or other downstream clients as a legitimate candidate.

### Floating incomplete shape

A `MoveViabilityResult` with `viable: true, complete: false` and all three pending-decision refs (`nextDecision`, `nextDecisionSet`, `stochasticDecision`) equal to `undefined`. Produced today only by `deriveMoveViabilityVerdict` at `packages/engine/src/kernel/viability-predicate.ts:108-127` for the deferred free-operation zone-filter mismatch case. This is the canonical example of an inadmissible pending shape.

## Contract

### 1. Admissibility rule

An incomplete move may be surfaced as a pending admissible move only if all of the following hold:

1. it is legal in the current state under the shared legality surface
2. it is not structurally unsatisfiable under the shared completion contract (Spec 16)
3. its remaining incompleteness corresponds to a real pending decision or a real stochastic boundary, not merely a failure to classify the branch precisely

### 2. Illegal "floating incomplete" shape

The floating incomplete shape (see Definitions) is not admissible on the client boundary. If such a shape appears internally, the engine MUST either:

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

This spec does **not** allow such templates to bypass admissibility simply because a special-case rewrite marks them `viable && !complete`. The `deriveMoveViabilityVerdict` rewrite is internal discovery only; its output MUST pass through the shared admissibility classifier before reaching any client.

### 5. Client boundary ownership

Agents, simulator, runner worker, and evaluation/reporting layers MUST treat engine-classified pending admissible moves as authoritative. They MUST NOT be responsible for deciding whether a pending move should have been surfaced in the first place.

## Required Invariants

1. No engine client should receive a pending move that is structurally impossible under the shared completion contract.
2. No engine client should be asked to distinguish "admissible pending move" from "internal discovery artifact" using private heuristics.
3. If a move is exposed as pending admissible, bounded completion/preparation must be able to make progress on it under the shared completion contract.
4. Deferred free-operation templates that are genuinely satisfiable must continue to be representable.
5. The admissibility classification for a given `(GameDef, state, move)` is identical across all call sites; any disagreement is a test failure.

## Foundations Alignment

- **Foundation #5 One Rules Protocol**: admissibility is an engine-level contract, not a simulator/agent convention.
- **Foundation #8 Determinism**: admissibility outcomes must be stable for identical inputs.
- **Foundation #10 Bounded Computation**: the admissibility contract may rely on bounded satisfiability/admission checks only.
- **Foundation #11 Immutability**: the shared admissibility classifier MUST be a pure predicate — no mutation of `def`, `state`, `runtime`, or any caller-visible object. Matches the pattern Spec 132 established for its extracted viability predicate.
- **Foundation #12 Validation Boundary**: admissibility is state-dependent kernel work.
- **Foundation #14 No Backwards Compatibility**: the existing scattered admissibility checks at `legal-moves.ts:327-354` and `playable-candidate.ts:63-67, 93-98` MUST be migrated to the shared classifier in the same change — no compatibility shim, no parallel code paths.
- **Foundation #15 Architectural Completeness**: removes the ambiguity between legality and agent-facing pending status, and eliminates the drift surface where three independent sites encode overlapping rules.
- **Foundation #16 Testing as Proof**: requires parity tests across the engine surfaces.

## Required Proof

### Unit / Kernel Proof

1. A pending move with no pending-decision/stochastic continuation MUST be rejected before reaching downstream agent preparation.
2. Valid deferred free-operation templates with real pending decision paths MUST remain admissible.
3. Cross-layer parity: for a fixture whose admissibility verdict is known, all four layers (enumeration classification, `probeMoveViability`, `classifyMoveDecisionSequenceAdmissionForLegalMove`, `completeTemplateMove`) MUST agree on the broad class (complete-executable / pending-admissible / inadmissible). Existing Spec 16 coverage in `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` proves the completion-layer side (structurally-unsatisfiable is not retried); this spec adds the cross-layer tie.

### Integration Proof

1. Known replay witnesses that previously surfaced false-positive pending moves MUST remain green at the agent boundary. Canonical witnesses: seed 1000 of the FITL production game (Spec 132 reproducer at `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs`) and the seeds covered by `packages/engine/test/integration/fitl-seed-stability.test.ts`.
2. Existing valid free-operation template fixtures MUST continue to complete successfully (coverage: `packages/engine/test/integration/classified-move-parity.test.ts`, `packages/engine/test/integration/fitl-policy-agent.test.ts`, `packages/engine/test/integration/fitl-events-sihanouk.test.ts`).
3. The removal of `agentStuck` and equivalent simulator-era masking behavior (Spec 132) MUST continue to be safe under the admissibility refactor. Guarded by `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts`.

### New Test File

New integration test: `packages/engine/test/integration/pending-move-admissibility-parity.test.ts`. At minimum:

- one admissible deferred free-operation fixture that all four layers classify as pending-admissible
- one inadmissible floating-incomplete fixture (deferred free-operation zone-filter mismatch + unsatisfiable admission) that all four layers classify as inadmissible
- byte-identical classification verdicts across repeated invocations (determinism)

## Implementation Direction

The intended implementation boundary is a new shared admissibility module plus migration of the existing scattered call sites. The shared classifier owns the admissibility predicate; each layer retains its thin layer-specific policy wrapping the shared classifier.

### New module

- `packages/engine/src/kernel/move-admissibility.ts` — shared admissibility classifier. Exports a pure predicate that, given `(def, state, move, viability, runtime?)`, returns one of `{ complete, pendingAdmissible, inadmissible }` with structured reason. Internally composes `probeMoveViability`, the decision-sequence admission helpers, and (where applicable) completion-contract introspection from Spec 16.

### Call-site migrations (same change, no shims)

- `packages/engine/src/kernel/legal-moves.ts` — replace the inline check at lines 327-354 with a call into the shared classifier. Preserve the `MOVE_ENUM_PROBE_REJECTED` warning emission.
- `packages/engine/src/kernel/playable-candidate.ts` — replace the two inline checks at lines 63-67 and 93-98 with calls into the shared classifier. Preserve the existing `notDecisionComplete` and `drawDeadEnd` rejection mapping as layer-specific policy on top of the shared verdict.

### Admission helper integration

- `packages/engine/src/kernel/move-decision-sequence.ts` — the `classifyMoveDecisionSequenceAdmissionForLegalMove` helper is consumed by the shared classifier. No signature change is required unless the integration surfaces a missing input.

### Touched but not migrated

- `packages/engine/src/kernel/viability-predicate.ts` — `deriveMoveViabilityVerdict` remains the single construction site of the floating incomplete shape; its output is now consumed by the shared classifier rather than directly by enumeration.
- `packages/engine/src/kernel/apply-move.ts` — `probeMoveViability` may expose minor helpers to the shared classifier if needed; no contract change.

### Consumer (no semantic change expected)

- `packages/engine/src/agents/prepare-playable-moves.ts` — already consumes the admissibility verdict indirectly via `evaluatePlayableMoveCandidate`. Verify retry-budget decisions at lines 295-310 remain correct (structurally-unsatisfiable → break; notViable/drawDeadEnd → retry within `NOT_VIABLE_RETRY_CAP`) under the shared classification. No code change expected; the verification is part of the integration proof.

This spec prefers strengthening the shared admissibility boundary over adding more downstream retries or fallbacks.

## Outcome

- Completion date: 2026-04-17
- What changed:
  - ticket `17PENMOVADM-001` introduced the shared kernel admissibility classifier in `packages/engine/src/kernel/move-admissibility.ts` and its unit coverage
  - ticket `17PENMOVADM-002` migrated the enumeration layer in `packages/engine/src/kernel/legal-moves.ts`
  - ticket `17PENMOVADM-003` migrated the playable-candidate boundary in `packages/engine/src/kernel/playable-candidate.ts`
  - ticket `17PENMOVADM-004` added `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` as the explicit Spec 17 Contract §3 proof and completed the regression sweep
- Deviations from original plan:
  - the canonical floating deferred free-operation fixture proved the same inadmissible invariant through early enumeration omission rather than `MOVE_ENUM_PROBE_REJECTED` warning emission, so the final proof and ticket reassessment were corrected to match the live architecture under `docs/FOUNDATIONS.md`
  - the direct standalone `fitl-seed-stability` invocation continued to show the repo's existing silent-harness behavior in-terminal, so final verification relied on the passing package and workspace sweeps to cover that lane while recording the direct-command behavior truthfully
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/pending-move-admissibility-parity.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-events-sihanouk.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator-no-playable-moves.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-contract-invariants.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-admissibility.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs`
    - output: `Running seed 1000 with max-turns=200`
    - output: `Completed: stopReason=noLegalMoves turns=1 moves=144`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
