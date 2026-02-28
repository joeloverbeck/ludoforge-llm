# ENGINEARCH-128: Choice-Options Runtime-Shape Diagnostic Boundary and Noise Control

**Status**: COMPLETED (2026-02-28)
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/CNL diagnostic contract layering and validator diagnostic policy
**Deps**: archive/tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md, archive/tickets/ENGINEARCH-110-choice-options-runtime-shape-contract-parity.md

## Problem

Choice-option runtime-shape invariant logic was centralized, but diagnostic ownership is now partially mixed across layers: a kernel-shared module carries CNL-specific diagnostic codes, and GameDef validation can emit secondary shape errors even when the options query is already invalid for primary reasons. This weakens architectural boundaries and reduces diagnostic precision.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` currently exports a diagnostic-code union including both `CNL_COMPILER_*` and `EFFECT_*` codes, so kernel-level module API currently depends on CNL taxonomy.
2. `packages/engine/src/kernel/validate-gamedef-behavior.ts` currently runs shape-contract diagnostics after `validateOptionsQuery(...)` without gating on primary query-validation failures.
3. `ENGINEARCH-127` is archived (not active). `ENGINEARCH-110` and `ENGINEARCH-111` are also archived; none of these archived tickets resolve the current boundary/noise regression.
4. Existing tests already assert shape-invalid diagnostics are emitted for both compiler and validator (`compile-effects.test.ts`, `validate-gamedef.test.ts`), but there is no explicit validator test guaranteeing suppression of secondary shape diagnostics when the same options query already has primary reference failures.
5. Corrected scope: keep shared shape-invariant logic while restoring strict layer-owned diagnostics and adding deterministic validator noise suppression based on primary options-query errors at the same path.

## Architecture Check

1. Kernel-shared modules should own semantic invariants, not caller-layer diagnostic taxonomies; this is cleaner and prevents cross-layer coupling drift.
2. CNL and direct `GameDef` validation should consume shared invariant results but produce diagnostics in their own layer-owned code spaces.
3. GameSpecDoc remains game-specific data, while GameDef/runtime/kernel behavior remains game-agnostic; this change enforces architecture boundaries only and introduces no game-specific branching.
4. No backwards-compatibility aliasing/shims; tighten contracts in place.

## What to Change

### 1. Remove caller-specific diagnostic code ownership from kernel shared contract module

Refactor `choice-options-runtime-shape-contract.ts` to expose semantic violation metadata only (for example, runtime shape list + invalid shape list), without embedding CNL or validator diagnostic-code unions in exported API contracts.

### 2. Keep diagnostic construction at caller layer boundaries

In `compile-effects.ts` and `validate-gamedef-behavior.ts`, map shared violation metadata to layer-local diagnostics (`CNL_COMPILER_*` vs `EFFECT_*`) at call sites.

### 3. Add validator diagnostic-noise control policy

Prevent/avoid secondary `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` diagnostics when the same options-query path already has primary query-validation errors (for example unknown runtime table/field). Ensure deterministic behavior.

Implementation boundary: suppress only when the primary error is rooted under the same options path; do not suppress shape diagnostics for independently valid options paths.

## Files to Touch

- `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify only if diagnostics payload/assertions require updates)

## Out of Scope

- Any game-specific GameSpecDoc content changes.
- Visual presentation/`visual-config.yaml` concerns.
- Runtime effect semantics changes for already-valid specs.

## Acceptance Criteria

### Tests That Must Pass

1. Shared kernel choice-options shape module no longer exports/owns CNL-specific diagnostic code contracts.
2. CNL and GameDef validator still report their respective layer-owned diagnostics for shape violations.
3. GameDef validation does not emit secondary shape diagnostics for options-query paths that already fail primary query-validation checks.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared query-shape invariant logic remains single-source, deterministic, and game-agnostic.
2. Diagnostic taxonomy ownership remains layer-local (CNL vs GameDef validator), with no cross-layer coupling in shared kernel contract modules.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` — replace shared diagnostic-builder assertions with semantic-violation-only contract checks.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — add case verifying primary options-query failures do not produce redundant shape-diagnostic noise on the same path.
3. `packages/engine/test/unit/compile-effects.test.ts` — keep/adjust shape-diagnostic assertions to ensure compiler diagnostics remain correct after caller-local diagnostic construction.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-contract.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed as planned: shared kernel module now returns semantic violation metadata only; caller layers (`compile-effects.ts`, `validate-gamedef-behavior.ts`) now construct their own diagnostics.
- Completed and tightened: validator now suppresses `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` when primary options-query validation already emitted an error at the same options path.
- Further architectural hardening: shared kernel module now also provides a layer-agnostic diagnostic-details builder (`message`/`suggestion`/`alternatives`) so caller layers avoid duplicated wording while still owning taxonomy/path/severity.
- Test updates: kernel contract test now validates semantic-only output; validator tests now cover query-error/noise suppression; compiler shape-diagnostic behavior remains covered and passing.
