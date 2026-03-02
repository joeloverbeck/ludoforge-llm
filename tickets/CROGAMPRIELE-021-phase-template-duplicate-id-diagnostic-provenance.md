# CROGAMPRIELE-021: Include template provenance in phase duplicate-ID diagnostic

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — cnl expand-phase-templates
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-005-parameterized-phase-templates.md`

## Problem

When `expandPhaseTemplates` detects a duplicate phase ID after expansion (line 198 of `expand-phase-templates.ts`), the diagnostic message is:

```
Duplicate phase id "preflop" after template expansion.
```

This tells the spec author *which* ID collided but not *which template(s)* produced it. In specs with many templates and instantiations, the author must manually trace back through `fromTemplate` entries to find the source of the collision. Including the originating template name(s) in the diagnostic message makes the error immediately actionable.

## Assumption Reassessment (2026-03-02)

1. Duplicate-ID detection is at `expand-phase-templates.ts:186-204`. Confirmed: iterates `allPhases` and checks `seenIds`.
2. The current loop has access to `phase` and `path` but not the originating template name. The template name is only available inside `expandPhaseArray` (lines 63-129) where `entry.fromTemplate` is accessible.
3. `GameSpecPhaseDef` does not carry provenance metadata — after substitution, the template origin is lost.
4. The `CNL_COMPILER_PHASE_TEMPLATE_DUPLICATE_ID` diagnostic code exists at `compiler-diagnostic-codes.ts:210`.

## Architecture Check

1. The cleanest approach is to tag each expanded phase with its source template name during `expandPhaseArray`, then use that tag in the duplicate-ID check. This is purely a diagnostic improvement — no runtime impact, no GameDef schema change.
2. The provenance tag is a compiler-internal concern, stripped before the phase reaches the kernel. GameDef and runtime remain agnostic.
3. No backwards-compatibility concern — the diagnostic message changes but the code remains the same.

## What to Change

### 1. Thread template provenance through expansion (`expand-phase-templates.ts`)

Change `expandPhaseArray` to return provenance alongside each phase. Two options:

**Option A (preferred — lightweight)**: Return an array of `{ phase: GameSpecPhaseDef; fromTemplate?: string }` tuples instead of bare `GameSpecPhaseDef[]`. The `fromTemplate` field records the template ID for expanded entries and is `undefined` for passthrough entries.

**Option B**: Attach a non-enumerable `__fromTemplate` property. Less clean — prefer Option A.

### 2. Update duplicate-ID diagnostic message (`expand-phase-templates.ts`)

In the duplicate-ID loop (lines 192-204), when a collision is detected, include both the current entry's template name and the first entry's template name in the message:

```
Duplicate phase id "preflop" after template expansion (from template "betting").
```

If both the first occurrence and the duplicate have template provenance, include both:

```
Duplicate phase id "preflop" after template expansion (templates "betting" and "rounds").
```

If the collision is between a literal phase and a template-expanded phase, indicate that:

```
Duplicate phase id "preflop" after template expansion (conflicts with template "betting"; first occurrence is a literal phase).
```

### 3. Track first-seen provenance in the `seenIds` map

Change `seenIds` from `Set<string>` to `Map<string, string | undefined>` where the value is the template name of the first occurrence (or `undefined` for literal phases). This enables the richer message without a second pass.

## Files to Touch

- `packages/engine/src/cnl/expand-phase-templates.ts` (modify)
- `packages/engine/test/unit/expand-phase-templates.test.ts` (modify)

## Out of Scope

- Adding provenance metadata to `GameSpecPhaseDef` or `GameDef` (purely compiler-internal)
- Changing the diagnostic severity (remains `error`)
- Adding provenance to other expansion passes (batch markers, batch vars, zones)

## Acceptance Criteria

### Tests That Must Pass

1. When two `fromTemplate` entries from the same template produce duplicate IDs, the diagnostic message includes the template name.
2. When two `fromTemplate` entries from different templates produce duplicate IDs, the diagnostic message names both templates.
3. When a literal phase and a template-expanded phase collide, the diagnostic message distinguishes literal from template origin.
4. All existing `expand-phase-templates.test.ts` tests continue to pass.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Template provenance is purely diagnostic metadata — never appears in `GameDef` or downstream.
2. The `CNL_COMPILER_PHASE_TEMPLATE_DUPLICATE_ID` diagnostic code is unchanged (same code, richer message).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-phase-templates.test.ts` — "duplicate-ID diagnostic includes template name for same-template collision": two `fromTemplate` entries from `"betting"` producing the same ID. Assert message contains `"betting"`.
2. `packages/engine/test/unit/expand-phase-templates.test.ts` — "duplicate-ID diagnostic names both templates for cross-template collision": entries from `"betting"` and `"rounds"` producing the same ID. Assert message contains both names.
3. `packages/engine/test/unit/expand-phase-templates.test.ts` — "duplicate-ID diagnostic distinguishes literal vs template origin": a literal phase `{ id: 'x' }` colliding with a `fromTemplate` entry. Assert message indicates the literal origin.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "expand-phase-templates|expandPhaseTemplates"`
2. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`
