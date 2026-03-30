# 95POLGUIMOVCOM-003: Validate `completionGuidance` and `completionScoreTerms` in agent spec

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — cnl validate-agents
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md

## Problem

Spec 95 now has materially more implementation in tree than this ticket originally assumed. The remaining gap is validator coverage and authoring-time coherence, not core completion-guidance architecture:

- `validate-agents.ts` still validates `use.completionScoreTerms` as a string list but does not cross-check ids against `library.completionScoreTerms`
- `completionGuidance.enabled: true` with no referenced completion score terms still emits no validator warning
- existing coverage proves compile/lowering behavior, but there is no focused validator test proving these authoring diagnostics directly

## Assumption Reassessment (2026-03-30)

1. `validateAgents` validates library entries by iterating over named maps (`stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `scoreTerms`, `tieBreakers`). Confirmed — adding `completionScoreTerms` follows the same pattern.
2. Mismatch: profile validation currently checks `use.*` entries for list shape only. Cross-reference validation against library keys happens later in `compile-agents.ts` via `lowerProfileUseIds`, not in `validate-agents.ts`.
3. `GameSpecScoreTermDef` is the shape for both `scoreTerms` and `completionScoreTerms` — same validation logic applies. Confirmed.
4. Mismatch: `completionGuidance` shape validation and fallback validation are already implemented in `validate-agents.ts`, and compiler lowering for `completionScoreTerms` plus `completionGuidance` already exists.
5. Mismatch: kernel threading and template-completion hooks from Spec 95 are already implemented and covered by unit tests in `move-completion.test.ts` and `playable-candidate.test.ts`. They are not part of this ticket.
6. `validateProfileUse` still validates `use.*` entries as string lists only; it does not cross-check `use.completionScoreTerms` ids against authored library keys. Confirmed.
7. Existing authoring tests live primarily in `packages/engine/test/unit/compile-agents-authoring.test.ts`; creating a brand-new test file is optional, not required.

## Architecture Check

1. Cleanest approach: keep authored-surface validation where it already lives, then add the remaining cross-reference and warning checks in `validate-agents.ts`. Do not re-open kernel threading, compiler lowering, or completed shape-validation work.
2. Engine agnosticism: validation checks structural correctness, not game-specific content. No game identifiers in validation logic.
3. No backwards-compatibility shims: diagnostics apply only when the new fields are present.
4. Architectural note: `validate-agents.ts` and `compile-agents.ts` each encode the `profile.use` buckets separately. A future cleanup should centralize that mapping so validator/compiler cannot drift, but that refactor is larger than this ticket's validation-only scope.

## What to Change

### 1. `validate-agents.ts` — add authored cross-reference validation for `profile.use` library ids

For each profile:
- validate every `use.*` id against the corresponding authored `library.*` bucket
- explicitly cover `use.completionScoreTerms` against `library.completionScoreTerms`
- emit an authoring diagnostic when a referenced id is missing
- keep this in the validator rather than deferring the failure to compiler lowering
- implement this through shared bucket mapping, not a `completionScoreTerms` one-off branch

### 2. `validate-agents.ts` — warn when guidance is enabled without referenced completion score terms

For each profile with `completionGuidance.enabled: true`:
- if `use.completionScoreTerms` is absent or empty, emit a warning
- keep this as a validator warning, not a compiler error, so authored intent is surfaced early without changing runtime semantics

### 3. Focused validator tests

Add dedicated validator tests for the remaining completion-guidance behavior instead of relying only on broader compile-path tests. Prefer the existing authoring-validation test lane unless a new test file is materially clearer.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` or `packages/engine/test/unit/cnl/validate-agents-completion.test.ts` (modify existing preferred; new file optional)

## Out of Scope

- Structural recognition of `completionScoreTerms` / `completionGuidance` keys or fallback enums (already delivered in ticket `002`)
- Compilation/lowering of `completionScoreTerms` and `completionGuidance` (already delivered)
- Kernel/template completion threading or policy runtime behavior (already delivered elsewhere in Spec 95 work)
- Runtime evaluation (tickets 005, 007)
- Expression-level validation (handled by existing expression validator, shared with `scoreTerms`)
- `zoneTokenAgg` dynamic zone validation (ticket 004)
- Policy contract centralization across types/schema/validator/compiler (tracked separately)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: valid `completionScoreTerms` in library passes validation without diagnostics
2. New unit test: `use.completionScoreTerms` referencing nonexistent library key emits error diagnostic
3. New unit test: `completionGuidance.enabled: true` with empty `use.completionScoreTerms` emits warning
4. New or strengthened validator regression: existing `use.pruningRules` / `use.scoreTerms` / `use.tieBreakers` buckets also receive the same validator cross-reference treatment
5. Existing validator behavior for invalid `completionGuidance.fallback` remains covered and unchanged
6. Existing suite: `pnpm -F @ludoforge/engine test` — all pass
7. Existing suite: `pnpm turbo typecheck` — all pass

### Invariants

1. Specs without `completionScoreTerms` or `completionGuidance` produce zero new diagnostics (backward compatible).
2. Validation does not import or depend on compilation logic.
3. Foundation #8 (Compiler-Kernel Boundary): validation is purely structural — no semantic/runtime checks.

## Test Plan

### New/Modified Tests

1. Focused validator coverage in the existing agents authoring validation lane for:
   - unknown library ids across `profile.use` buckets via the shared validator path
   - valid `completionScoreTerms` references
   - unknown `use.completionScoreTerms` ids
   - enabled guidance with no referenced completion score terms
   - existing invalid fallback coverage remains intact

### Commands

1. Targeted engine unit test command covering the chosen validation test file
2. `pnpm turbo test && pnpm turbo typecheck` (full suite)

## Outcome

- Completion date: 2026-03-30
- Actual changes:
  - added validator-side library-id cross-reference checks for all `doc.agents.profiles.*.use.*` buckets, including `completionScoreTerms`
  - added a validator warning when `completionGuidance.enabled: true` but the profile references no valid `completionScoreTerms`
  - strengthened existing authoring tests in `packages/engine/test/unit/compile-agents-authoring.test.ts` instead of creating a new standalone validator test file
- Deviations from original plan:
  - broadened the validator fix from `use.completionScoreTerms` only to all `profile.use` buckets because the shared-path implementation is cleaner and avoids validator/compiler drift
  - did not add a new `packages/engine/test/unit/cnl/validate-agents-completion.test.ts`; existing authoring-surface tests were the better fit for this coverage
- Verification results:
  - `node packages/engine/dist/test/unit/compile-agents-authoring.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm turbo typecheck`
  - `pnpm -F @ludoforge/engine test`
