# PIPEVAL-023: Unify effect and condition macro ID contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL macro-definition validation contract consolidation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-021-unify-macro-path-segment-contract-between-expansion-and-codec.md`

## Problem

Effect and condition macro ID validation currently diverges in implementation style and constraints ownership. This increases drift risk and weakens long-term contract clarity for macro identifier behavior.

## Assumption Reassessment (2026-03-05)

1. Condition macro expansion validates non-empty IDs in `packages/engine/src/cnl/expand-condition-macros.ts`.
2. Effect macro expansion validates non-empty IDs in `packages/engine/src/cnl/expand-effect-macros.ts`; condition/effect both duplicate the same predicate (`typeof id === 'string' && id.trim() !== ''`) and each hardcodes its own message text.
3. Existing shared string predicates already exist in `packages/engine/src/cnl/validate-spec-shared.ts` (`isNonEmptyString`), but macro ID diagnostics policy (message + call-site contract) is still duplicated.
4. Condition macro expansion currently emits nested trace path segments as `[conditionMacro:<id>]` (not `[macro:<id>]`), so this ticket must stay focused on ID validation contract parity, not path-segment grammar unification.
5. Test coverage is asymmetric: effect macro tests already cover invalid/duplicate IDs; condition macro tests currently do not lock those ID diagnostics.
6. Scope correction: centralize macro ID validation predicate + deterministic diagnostics text helper so effect/condition ID validation cannot drift.

## Architecture Check

1. A dedicated macro-ID contract helper (separate from path utilities) is cleaner than duplicated checks in expansion modules and keeps responsibilities explicit.
2. This remains generic CNL compiler infrastructure and preserves game-agnostic kernel/runtime boundaries.
3. No backwards-compatibility aliasing; one canonical ID contract is enforced.

## What to Change

### 1. Add shared macro ID validator utility

Introduce a utility that owns macro ID contract checks (non-empty/trimmed) plus deterministic diagnostics message rendering for both effect/condition macro ID invalidation.

### 2. Migrate effect/condition expansion call sites

Route both `expand-effect-macros` and `expand-condition-macros` ID validation through shared utility.

### 3. Add anti-drift tests

Add/adjust tests to lock parity between effect and condition macro ID diagnostics.

## Files to Touch

- `packages/engine/src/cnl/macro-id-contract.ts` (new)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/cnl/expand-condition-macros.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/expand-condition-macros.test.ts` (modify)

## Out of Scope

- Macro argument constraint semantics
- Macro expansion ordering behavior
- Path codec/source-map algorithm changes (including `[macro:...]` vs `[conditionMacro:...]` segment grammar)

## Acceptance Criteria

### Tests That Must Pass

1. Effect and condition macro ID validation follow one shared contract implementation.
2. ID-invalid diagnostics remain deterministic and test-covered in both expansion paths.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Macro ID validity rules are defined once and consumed by both effect/condition macro systems.
2. GameDef/runtime/simulator remain game-agnostic and free of game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — invalid ID diagnostics remain correct via shared validator.
2. `packages/engine/test/unit/expand-condition-macros.test.ts` — add missing invalid/duplicate macro ID diagnostics coverage and parity checks.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js packages/engine/dist/test/unit/expand-condition-macros.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-05
- What actually changed:
  - Added shared macro ID contract helper in `packages/engine/src/cnl/macro-id-contract.ts` with canonical non-empty/trimmed predicate and invalid-ID message rendering.
  - Updated `expand-effect-macros.ts` and `expand-condition-macros.ts` to consume shared macro ID contract helper for `*_MACRO_ID_INVALID` validation.
  - Strengthened effect macro unit test to assert deterministic invalid-ID message text.
  - Added missing condition macro unit coverage for invalid IDs and duplicate IDs.
- Deviations from original plan:
  - Did not touch `path-utils.ts`; macro ID contract ownership was placed in a dedicated `macro-id-contract.ts` module to keep path grammar concerns separate from ID validation policy.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js packages/engine/dist/test/unit/expand-condition-macros.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
