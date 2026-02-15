# GAMEDEFGEN-023: Game-Agnostic Capability Conformance Suite for GameSpecDoc

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Large

## 1) What Needs To Change / Be Added

1. Create a game-agnostic capability conformance suite that validates core engine/compiler capabilities via minimal fixture GameSpecDocs (not game-specific production content).
2. Define a capability matrix covering foundational board/card mechanics, for example:
   - hidden/public information zones and reveal flows
   - deterministic turn/phase progression
   - legal move/choice surface parity
   - resource commitment and bounded spending
   - subset evaluation/scoring primitives
   - action pipeline applicability/legality/cost validation behavior
   - token lifecycle invariants (creation, movement, uniqueness, conservation where applicable)
3. Implement fixture specs per capability with deterministic expected compile/runtime outcomes.
4. Keep fixtures minimal and orthogonal so failures isolate capability regressions quickly.

## 2) Invariants That Should Pass

1. Core capabilities required for generic board/card game modeling are continuously validated independent of any one game.
2. Capability regressions surface as targeted conformance failures with deterministic diagnostics.
3. Conformance fixtures remain engine-generic and do not encode FITL/Texas-Hold'em-specific logic.
4. Existing production specs remain supplementary validation, not sole proof of engine generality.

## 3) Tests That Should Pass

1. Unit/Integration: each capability fixture compiles and executes with deterministic expected outcomes.
2. Integration: legal surface parity and runtime contract assertions pass across capability fixtures.
3. Property-oriented checks: core invariants (determinism, token ownership uniqueness, bounded variable constraints) hold across representative fixture runs.
4. Regression: existing unit/integration/e2e suites pass with conformance suite added.

