# CROGAMPRIELE-023: Extract shared phase ID resolution helper (DRY)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — cnl validators + expand-phase-templates
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-005-parameterized-phase-templates.md`, `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-010-texas-holdem-spec-migration.md`

## Problem

The same `{param}` → value substitution logic for resolving a phase ID from a `fromTemplate` entry is implemented three times with identical semantics:

1. `validate-actions.ts:262-270` — `resolveFromTemplatePhaseId()` helper
2. `validate-spec-core.ts:248-255` — inline in `validateDuplicateIdentifiers()`
3. `expand-phase-templates.ts:28-41` — `substituteParams()` (general-purpose, handles arrays/objects too)

All three implement the same "entire-string match → direct assignment; else `replaceAll`" algorithm. If the substitution rule ever changes (e.g., to support escaping, nesting, or numeric coercion), all three must be updated in lockstep — a maintenance hazard and a DRY violation.

## Assumption Reassessment (2026-03-03)

1. The three locations listed above all exist and implement the same algorithm. **Verified.**
2. `substituteParams` in `expand-phase-templates.ts` is more general (deep object/array recursion), but the ID-only resolution in the two validators is a strict subset of that logic. **Verified.**
3. `GameSpecPhaseTemplateDef` type defines `phase` as `Readonly<Record<string, unknown>>`, so `template.phase.id` is typed `unknown`. **Verified.**
4. `normalizeIdentifier` now lives in `identifier-utils.ts` and is consumed by validator/shared modules; it is no longer defined in `validate-spec-shared.ts`. **Verified.**

## Architecture Check

1. Extracting a focused `resolvePhaseIdFromTemplate(entry, phaseTemplates)` helper into `validate-spec-shared.ts` centralizes the algorithm in one place, while importing canonical normalization from `identifier-utils.ts`. The general `substituteParams` in `expand-phase-templates.ts` can delegate to this for the ID-specific case, or remain separate if deep recursion stays needed.
2. No game-specific logic involved — this is purely compiler infrastructure.
3. No backwards-compatibility shims. The three call sites simply replace inline logic with the shared helper.

## What to Change

### 1. Extract `resolvePhaseIdFromTemplate` into `validate-spec-shared.ts`

Create a focused helper:
```typescript
export function resolvePhaseIdFromTemplate(
  entry: { fromTemplate: string; args: Record<string, unknown> },
  phaseTemplates: readonly GameSpecPhaseTemplateDef[] | null,
): string | undefined
```

Logic: find template by `entry.fromTemplate`, substitute `entry.args` into `template.phase.id`, return `normalizeIdentifier(result)` or `undefined`.

### 2. Replace inline logic in `validate-actions.ts`

Replace `resolveFromTemplatePhaseId()` body with a call to the shared helper. The diagnostic-emitting wrapper stays in place for validation-specific concerns (invalid template name, missing args).

### 3. Replace inline logic in `validate-spec-core.ts`

Replace the inline `fromTemplate` resolution in `validateDuplicateIdentifiers()` with a call to the shared helper.

### 4. Assess `expand-phase-templates.ts`

`substituteParams` performs deep object/array recursion. If the ID-resolution portion can delegate to the shared helper, do so. Otherwise, leave a comment cross-referencing the shared helper to maintain awareness.

## Files to Touch

- `packages/engine/src/cnl/validate-spec-shared.ts` (modify — add shared helper)
- `packages/engine/src/cnl/validate-actions.ts` (modify — use shared helper)
- `packages/engine/src/cnl/validate-spec-core.ts` (modify — use shared helper)
- `packages/engine/src/cnl/expand-phase-templates.ts` (modify if applicable — cross-reference or delegate)

## Out of Scope

- Changing substitution semantics (escape sequences, nesting)
- Modifying `substituteParams`'s deep recursion behavior
- Adding new validation diagnostics

## Acceptance Criteria

### Tests That Must Pass

1. All existing `fromTemplate` phase resolution tests continue to pass.
2. The shared helper is tested directly if extracted as a public export.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Phase ID resolution produces identical results before and after refactor.
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-spec-shared.test.ts` — Unit test for `resolvePhaseIdFromTemplate` with: matched template, missing template, missing args, entire-string substitution, partial substitution.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
