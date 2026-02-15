# GAMEDEFGEN-024: Unified Move Viability Engine (legalMoves / legalChoices / applyMove)

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Large

## 1) Reassessed assumptions (current code/test reality)

1. A shared viability policy module already exists in `src/kernel/pipeline-viability-policy.ts` and is consumed by `legalMoves`, `legalChoices`, and `applyMove`.
2. The currently unified part is **pipeline predicate viability** (legality + cost-validation + atomicity/free-operation projection), not full move-level viability.
3. Applicability gating (`phase`, `actor`, `executor`, pipeline profile dispatch) is still resolved separately via `resolveActionApplicabilityPreflight` at each surface.
4. Decision-completeness is still surface-specific (`isMoveDecisionSequenceSatisfiable`, `walkEffects`, `validateDecisionSequenceForMove`) and is not produced from one canonical viability object.
5. `legalChoices` still has discovery-time exception fallback for cost-validation predicate evaluation when bindings are incomplete; this is a known architectural compromise and belongs to follow-up hardening.
6. Existing tests already cover major parity paths:
   - `test/unit/kernel/pipeline-viability-policy.test.ts`
   - `test/unit/kernel/legality-surface-parity.test.ts`
   - `test/unit/kernel/legal-choices.test.ts`
   - `test/unit/kernel/legal-moves.test.ts`
   - `test/unit/kernel/apply-move.test.ts`
   - `test/integration/gamespec-capability-conformance.test.ts`

## 2) Updated scope for GAMEDEFGEN-024

1. Keep this ticket focused on consolidating **pipeline viability projection logic** across legality surfaces, with deterministic free-operation semantics.
2. Do not expand this ticket into a cross-cutting rewrite of applicability dispatch and decision discovery execution.
3. Preserve generic engine architecture (no game-specific branches, ids, or contracts).
4. Ensure projection consistency for currently supported viability dimensions:
   - legality predicate failure
   - atomic cost-validation failure
   - partial-cost behavior
   - free-operation override behavior in `applyMove`

## 3) Out of scope (moved to dedicated tickets)

1. Predicate tri-state/deferred semantics for decision discovery fallback handling (`GAMEDEFGEN-025`).
2. Legality-reason taxonomy normalization (`GAMEDEFGEN-026`).
3. Event-action routing cleanup (`GAMEDEFGEN-027`).
4. Move enumeration budgets/observability and broader diagnostics (`GAMEDEFGEN-028`).
5. Full "single canonical move viability object" spanning applicability + completeness + execution in one module.

## 4) Architectural rationale

1. A narrow, explicit pipeline-viability policy is cleaner than duplicating legality/cost branching in each surface.
2. Forcing full move viability unification in one ticket would couple distinct concerns (applicability, discovery, execution) and increase regression risk.
3. The current decomposition (preflight + pipeline viability policy + surface-specific completeness checks) is a pragmatic intermediate architecture; follow-up tickets can harden remaining seams without destabilizing validated behavior.

## 5) Invariants that must pass

1. For pipeline-backed actions, legality and cost-validation outcomes are projected consistently across `legalMoves`, `legalChoices`, and `applyMove`.
2. Atomic cost failures remain discoverability-blocking and execution-blocking (except explicit free-operation override in `applyMove`).
3. Partial-cost failures remain executable while preserving cost-skipped signaling.
4. No game-specific hardcoding is introduced.

## 6) Tests that must pass

1. Unit: `test/unit/kernel/pipeline-viability-policy.test.ts`.
2. Unit: `test/unit/kernel/legality-surface-parity.test.ts`.
3. Regression: `test/unit/kernel/legal-choices.test.ts`, `test/unit/kernel/legal-moves.test.ts`, `test/unit/kernel/apply-move.test.ts`.
4. Integration: `test/integration/gamespec-capability-conformance.test.ts`.
5. Determinism regressions relevant to pipeline/event behavior:
   - `test/integration/determinism-full.test.ts`
   - `test/integration/fitl-card-flow-determinism.test.ts`

## Outcome

- **Completion date**: 2026-02-15
- **What changed**
  - Reassessed and corrected this ticket's assumptions/scope to match the actual architecture in code and tests.
  - Confirmed the implemented architecture for this ticket is the shared pipeline viability policy (`src/kernel/pipeline-viability-policy.ts`) consumed by `legalMoves`, `legalChoices`, and `applyMove`.
  - Explicitly split non-completed "full unified move viability" ambitions into dedicated follow-up tickets (`GAMEDEFGEN-025` through `GAMEDEFGEN-028`).
- **Deviation from original plan**
  - Original ticket wording implied a full cross-surface move-viability unification in one change. Actual delivered architecture intentionally keeps applicability and discovery/execution completeness concerns decomposed, while unifying pipeline viability projections.
- **Verification results**
  - `npm run lint`: pass
  - `npm run test:integration`: pass
  - `npm run test:all`: pass
