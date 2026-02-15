# GAMEDEFGEN-018: Unified Selector Runtime Error Envelope Across All Selector Failures

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Define a canonical runtime error envelope for selector-related failures across kernel surfaces (`legalMoves`, `legalChoices`, `applyMove`, and other selector-dependent execution paths).
2. Ensure selector contract violations and selector resolution failures project consistent structured metadata (surface, selector role/surface, action id when applicable, deterministic reason enum, optional ordered violation list).
3. Remove ad-hoc selector error-shape differences between modules where equivalent data is available.
4. Keep primary failure deterministic while preserving full ordered violation context when multiple selector contract violations exist.
5. Keep error taxonomy engine-generic and decoupled from any game-specific concepts.

## 2) Invariants That Should Pass

1. All selector-related runtime contract failures share one stable metadata schema.
2. Equivalent selector failures across runtime surfaces expose equivalent reason semantics and context fields.
3. Multi-violation selector-contract failures preserve deterministic ordered violation lists.
4. Error schema changes do not introduce game-specific branching.

## 3) Tests That Should Pass

1. Unit: each selector failure mode projects canonical runtime error metadata shape.
2. Unit: parity tests confirm `legalMoves`, `legalChoices`, and `applyMove` expose consistent selector error envelopes for equivalent scenarios.
3. Unit: multi-violation selector-contract scenarios preserve deterministic ordering in runtime error metadata.
4. Regression: existing legality/runtime-contract suites pass with canonicalized error envelope.
