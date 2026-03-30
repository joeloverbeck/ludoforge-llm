# 95POLGUIMOVCOM-009: Production FITL guidance authoring and end-to-end proof for guided completion

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — FITL policy authoring, golden fixtures, and end-to-end tests
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-001.md, archive/tickets/95POLGUIMOVCOM-002.md, archive/tickets/95POLGUIMOVCOM-003.md, archive/tickets/95POLGUIMOVCOM-004.md, archive/tickets/95POLGUIMOVCOM-005.md, archive/tickets/95POLGUIMOVCOM-007.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-008.md

## Problem

Guided completion is implemented in the engine, compiler, and policy agent, but the production FITL policy catalog still does not author any `completionGuidance` or `completionScoreTerms`. As a result, Spec 95 is only proven by synthetic/unit coverage, not by a real authored production profile. The missing work is not lower-layer plumbing; it is production authoring plus end-to-end proof that the authored guidance improves real move completion behavior and stays deterministic.

## Assumption Reassessment (2026-03-30)

1. `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` is the canonical FITL compile path. Confirmed.
2. Compiler, validator, policy-eval core, completion scoring, chooser construction, and PolicyAgent chooser threading are already implemented in archived tickets `002`, `003`, `007`, and `008`. This ticket must not re-scope those as new work. Confirmed.
3. Production FITL policy golden coverage already exists in `packages/engine/test/unit/policy-production-golden.test.ts` with fixture `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`. The ticket should update that existing contract, not create a parallel golden path. Confirmed.
4. The current production FITL authored profile `vc-evolved` in `data/games/fire-in-the-lake/92-agents.md` does not yet contain `completionGuidance` or `use.completionScoreTerms`, and the library has no `completionScoreTerms` section. The original ticket text incorrectly treated this as already confirmed/ready. Corrected.
5. Existing FITL integration coverage in `packages/engine/test/integration/fitl-policy-agent.test.ts` already proves baseline policy-agent wiring and fixed-seed self-play stability. This ticket should extend that coverage rather than fragment it into multiple new FITL policy files unless a new lane is clearly justified. Confirmed.
6. Existing lower-layer tests already cover chooser legality-precedence behavior, fallback semantics, scoring semantics, and deterministic guided completion on focused fixtures. This ticket's missing proof is production authoring plus real FITL end-to-end behavior. Confirmed.
7. The original "test files only" scope is false. To prove Spec 95 in production, this ticket must change the authored FITL agent profile and update the committed golden artifact. Corrected.

## Architecture Check

1. The cleaner architecture is to author guidance directly into the real `vc-evolved` production profile, not to create a test-only FITL profile or shadow catalog. The production policy catalog is the truth the engine actually runs.
2. Reusing the existing production golden fixture and FITL policy-agent integration suite is better than adding a parallel "guided" test stack. One authoritative golden plus focused behavioral additions is cleaner and less prone to drift.
3. This ticket should not add any new aliasing, fallback shims, or special test hooks. If authored guidance changes production behavior, the correct response is to update the production golden and the affected policy summary expectations.
4. The implementation is beneficial relative to the current architecture because it removes dead capability from the authored FITL profile. Today the engine supports guided completion, but the production VC policy does not exercise it. Authoring real `completionScoreTerms` restores alignment between policy architecture and shipped policy data.
5. Keep the authored guidance tight. Add only the minimum durable scoring terms that demonstrably improve VC inner decisions in FITL. Do not turn `92-agents.md` into an overfit experiment dump.

## Scope Correction

This ticket owns production FITL policy authoring and the end-to-end regression proof for that authored guidance.

- In scope here:
  - add production `completionScoreTerms` and `completionGuidance` authoring for `vc-evolved`
  - update the FITL compiled policy catalog golden fixture
  - extend FITL policy integration coverage to prove the authored guidance changes a real completion decision and preserves immutable snapshot behavior
  - add deterministic replay coverage for guided FITL policy self-play across curated seeds
- Out of scope here:
  - any new compiler/kernel/runtime/chooser plumbing already completed in prior tickets
  - a separate test-only FITL profile
  - performance benchmarking
  - broad policy-architecture cleanup beyond what the authored FITL guidance needs
  - Texas Hold'em guided completion authoring
  - policy contract centralization across validator/compiler/schema ownership (ticket `010`)

## What to Change

### 1. Author production FITL completion guidance in `vc-evolved`

Update `data/games/fire-in-the-lake/92-agents.md`:

- add a small `completionScoreTerms` library section for the VC policy
- add any required guidance-specific tunable parameters if the authored terms need them
- add `use.completionScoreTerms` to `vc-evolved`
- add `completionGuidance` to `vc-evolved`

The authored terms should target real VC completion decisions that are robustly expressible through the current policy surface, for example:

- preferring higher-value Rally destination spaces
- preferring stronger placement/upgrade modes when the request exposes enum-style choices

Do not add terms that depend on speculative unsupported refs or test-only authored data.

### 2. Extend existing FITL integration coverage

Prefer extending `packages/engine/test/integration/fitl-policy-agent.test.ts` unless a different lane is clearly more appropriate.

Required coverage:

- production FITL compiles with the authored `vc-evolved` guidance and no new diagnostics
- compiled production catalog exposes the new `completionGuidance` and referenced `completionScoreTerms`
- a real FITL template-completion scenario demonstrates that guided completion picks the policy-preferred inner decision compared with unguided/random completion
- the guided completion path does not mutate the external pre-move snapshot state

### 3. Extend deterministic replay coverage for guided FITL self-play

Add or extend a determinism/integration lane test that runs production FITL self-play with `PolicyAgent` across curated seeds and proves:

- same seed => same final state hash
- runs complete without runtime failures
- no move reports `emergencyFallback: true`

Prefer an existing determinism or FITL policy suite over a new ad hoc file if that keeps the test taxonomy cleaner.

### 4. Update committed production goldens

Update the existing committed FITL policy artifacts that should change because the production authored catalog changed:

- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`
- any FITL policy summary golden that legitimately changes because the production profile now resolves a different completed move at the fixed seed

Do not create a separate "guided" golden fixture alongside the production one.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/test/unit/policy-production-golden.test.ts` (modify only if the assertions need to become more explicit)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (modify only if production behavior changes)
- `packages/engine/test/determinism/*` or another existing deterministic FITL policy suite (modify/add the smallest clean proof)

## Out of Scope

- Test-only FITL policy profiles or duplicate policy catalogs
- Texas Hold'em policy guidance authoring
- Performance benchmarks for guided vs unguided completion
- Runner/UI work
- Event-card-specific completion systems that do not use the policy-agent path
- Any backwards-compatibility shims for old unguided FITL policy behavior

## Acceptance Criteria

### Tests That Must Pass

1. Production FITL compiles with authored VC guidance and zero new parse/validation/compiler errors.
2. The compiled FITL production policy catalog golden matches the committed fixture and includes the authored guidance configuration.
3. A FITL integration test proves that guided completion changes at least one real VC inner decision in the authored production path relative to unguided completion.
4. A FITL integration test proves the external pre-move snapshot state remains unchanged after guided template completion.
5. Guided FITL policy self-play is deterministic across curated seeds: same seed => same final state hash.
6. Guided FITL policy self-play completes across the curated seed set without runtime failures.
7. No guided FITL policy move in the curated replay set reports `emergencyFallback: true`.
8. Existing `pnpm -F @ludoforge/engine test` passes.
9. `pnpm turbo typecheck` passes.
10. `pnpm turbo lint` passes.

### Invariants

1. The production FITL profile catalog remains the single source of truth; there is no test-only alias profile for guided completion.
2. Non-VC profiles are unchanged unless an authored dependency makes a broader correction necessary.
3. Foundation #5 (Determinism): the authored guided completion path is replay-deterministic.
4. Foundation #7 (Immutability): the chooser closes over snapshot state only; external pre-move state is not mutated.
5. Foundation #9 (No Backwards Compatibility): if the production VC policy now chooses different moves, the goldens and affected tests are updated rather than shimmed.
6. Foundation #10 (Architectural Completeness): the ticket finishes the production authoring path instead of leaving guided completion as dead capability in FITL.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — extend with production-guidance compile/behavior/immutability coverage
2. existing FITL deterministic replay suite in `packages/engine/test/determinism/` or another established lane — extend/add guided policy replay proof
3. `packages/engine/test/unit/policy-production-golden.test.ts` — existing production golden assertions remain the contract; only adjust if stronger explicit assertions help

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused `node --test` runs for the modified FITL policy and determinism files
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Authored production VC `completionGuidance` and `completionScoreTerms` in `data/games/fire-in-the-lake/92-agents.md`.
  - Fixed `buildCompletionChooseCallback(...)` so `chooseN` guidance returns a legal subset array instead of a scalar.
  - Extended FITL policy-agent integration coverage to prove production guidance compiles, changes a real VC Rally completion, preserves snapshot immutability, and replays deterministically without fallback.
  - Expanded chooser unit coverage for `chooseN` subset scoring/fallback behavior.
  - Updated the committed FITL policy catalog golden fixture.
- Deviations from original plan:
  - The ticket was corrected before implementation because lower-layer compiler/runtime/agent guidance plumbing was already complete.
  - The implementation uncovered and fixed a real chooser-contract bug for `chooseN`; without that fix, production FITL guidance would have rested on an invalid callback shape.
  - The production proof stayed within the existing FITL policy-agent and production-golden suites instead of creating a parallel guided-only test stack.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/completion-guidance-choice.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
  - `node --test packages/engine/dist/test/unit/policy-production-golden.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
