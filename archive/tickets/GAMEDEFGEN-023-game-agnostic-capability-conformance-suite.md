# GAMEDEFGEN-023: Game-Agnostic Capability Conformance Suite for GameSpecDoc

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 1) Reassessed Assumptions (Current Code/Test Reality)

1. The repository already has strong generic capability coverage in kernel/compiler tests (for example legality parity, subset evaluation, token lifecycle, determinism, and action pipeline behavior).
2. The gap is not missing behavior implementation; the gap is missing a cohesive, fixture-first conformance matrix at the `GameSpecDoc` integration layer.
3. Existing coverage is fragmented across many files and often mixes generic checks with production-heavy suites. This slows regression triage when engine-generic capabilities break.
4. Therefore, this ticket should not re-implement kernel behavior. It should add focused conformance fixtures and integration assertions that validate compile + runtime behavior from minimal `GameSpecDoc` inputs.

## 2) Updated Scope

1. Add a dedicated game-agnostic conformance fixture set under `test/fixtures/cnl/` using minimal, orthogonal `GameSpecDoc` markdown fixtures.
2. Add a new integration test suite that:
   - parses + validates + compiles each conformance fixture;
   - executes targeted runtime actions from compiled `GameDef`;
   - asserts deterministic, capability-specific invariants.
3. Capability matrix covered by this ticket:
   - hidden/owner/public information with reveal grants;
   - deterministic turn/phase progression from compiled specs;
   - legal move / legal choices / applyMove parity around pipeline viability;
   - resource commitment and bounded spending through pipeline cost validation/effects;
   - subset evaluation/scoring primitive behavior;
   - token lifecycle invariants (creation, movement, uniqueness, conservation where applicable).
4. Keep fixtures intentionally small and independent so failures point to one capability class quickly.

## 3) Out Of Scope

1. No production FITL/Texas-Hold'em spec rewrites.
2. No engine refactor unless tests expose a concrete defect.
3. No compatibility aliases or dual behavior paths.

## 4) Architectural Rationale

1. A dedicated conformance suite is more robust than relying on broad production suites for generic capability guarantees.
2. Fixture-first tests improve extensibility: new mechanics can be added as isolated capabilities without entangling existing production scenarios.
3. This direction is cleaner than adding more game-specific regression tests because it validates generic contracts at the right abstraction boundary (`GameSpecDoc` -> compiler -> kernel runtime).

## 5) Invariants That Must Pass

1. Core capabilities required for generic board/card modeling are validated independent of any game package.
2. Failures produce targeted, deterministic diagnostics tied to one capability fixture.
3. Conformance fixtures contain no FITL/Texas-Hold'em identifiers or assumptions.
4. Existing production suites remain supplementary, not primary proof of generic engine correctness.

## 6) Tests Required

1. New integration conformance suite passes for all fixtures.
2. Existing targeted suites relevant to touched behavior continue to pass.
3. Full regression gate for this ticket: lint + repository test suite pass.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**
  - Added a new game-agnostic conformance integration suite: `test/integration/gamespec-capability-conformance.test.ts`.
  - Added orthogonal conformance fixtures under `test/fixtures/cnl/conformance/`:
    - `hidden-reveal.md`
    - `turn-phase.md`
    - `pipeline-resource.md`
    - `pipeline-legality.md`
    - `subset-scoring.md`
    - `token-lifecycle.md`
  - Strengthened pipeline viability consistency by updating legality-choice viability for atomic cost validation and preserving free-operation behavior:
    - `src/kernel/pipeline-viability-policy.ts`
    - `src/kernel/legal-choices.ts`
  - Updated policy unit expectations in `test/unit/kernel/pipeline-viability-policy.test.ts`.
- **Deviations from original plan**
  - The initial assumption was “suite-only.” During implementation, a real parity gap surfaced (`legalChoices` vs `legalMoves`/`applyMove` on atomic cost validation). A minimal kernel fix was added to keep architecture coherent.
  - Cost-validation evaluation in `legalChoices` now has a guarded fallback for discovery-time contexts where bindings are incomplete, preventing regressions in event-heavy FITL flows.
- **Verification results**
  - `npm run lint`: pass
  - `npm run test:all`: pass
  - New conformance suite: pass
