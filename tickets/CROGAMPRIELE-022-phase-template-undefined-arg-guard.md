# CROGAMPRIELE-022: Guard against undefined arg values in phase template substitution

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — cnl expand-phase-templates, compiler-diagnostic-codes
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-005-parameterized-phase-templates.md`

## Problem

`substituteParams` in `expand-phase-templates.ts` (lines 24-57) performs placeholder substitution on phase template bodies. When an arg value is `undefined` (e.g., `{ roundId: undefined }` in the `args` object), two problems occur:

1. **Entire-string match** (line 31): `value === '{roundId}'` — the entire-string check fails because `undefined !== '{roundId}'`. The function falls through to the embedded-placeholder path.
2. **Embedded placeholder** (line 38): `String(undefined)` produces the literal string `"undefined"`, so a phase ID like `{roundId}` becomes `"undefined"` — a valid but nonsensical string that silently propagates into the GameDef.

This is a spec-authoring mistake that should be caught at expansion time with a clear diagnostic rather than producing a garbage ID that only manifests as a confusing downstream error (e.g., "unknown phase 'undefined'" during action compilation).

The existing param validation in `expandPhaseArray` (lines 90-121) checks that all declared params have *keys* in `args` and that no extra keys exist, but it does not check that the *values* are non-undefined. This is because `'roundId' in { roundId: undefined }` returns `true` in JavaScript.

## Assumption Reassessment (2026-03-02)

1. `substituteParams` is at `expand-phase-templates.ts:24-57`. Confirmed: no `undefined` check on arg values.
2. `expandPhaseArray` param validation is at lines 90-121. Confirmed: uses `Object.keys(entry.args)` and `Set.has()` — both treat explicit `undefined` values as present keys.
3. No existing diagnostic code for undefined arg values — confirmed by grepping `compiler-diagnostic-codes.ts` for `PARAM_UNDEFINED` or `ARG_UNDEFINED` (zero matches).
4. The `args` field type on `GameSpecPhaseFromTemplate` is `Readonly<Record<string, unknown>>`, so `undefined` values are type-legal.

## Architecture Check

1. Validating arg values early (at the same point where keys are validated) follows the fail-fast principle and the existing validation pattern in `expandPhaseArray`. The check belongs alongside the existing key-presence checks — same function, same phase, same diagnostic context.
2. This is a compiler-level validation. The kernel never sees template args — only the substituted `GameSpecPhaseDef`. Runtime remains agnostic.
3. No backwards-compatibility concern — specs with well-formed args are unaffected. Specs with `undefined` values were producing garbage silently; now they get a diagnostic.

## What to Change

### 1. Add arg value validation in `expandPhaseArray` (`expand-phase-templates.ts`)

After the existing key validation loop (lines 90-121) and before the substitution call (line 124), add a check for `undefined` arg values:

```typescript
for (const [name, value] of Object.entries(entry.args)) {
  if (value === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_ARG_UNDEFINED,
      path: `${path}.args.${name}`,
      severity: 'error',
      message: `Arg "${name}" for template "${entry.fromTemplate}" is undefined.`,
    });
  }
}
```

Include this in the existing validation gate (the `hasMissing || hasExtra` check at line 119) so that `undefined` args also prevent expansion.

### 2. Add diagnostic code (`compiler-diagnostic-codes.ts`)

Add `CNL_COMPILER_PHASE_TEMPLATE_ARG_UNDEFINED` to the `CNL_COMPILER_DIAGNOSTIC_CODES` enum after the existing `PHASE_TEMPLATE_*` entries.

## Files to Touch

- `packages/engine/src/cnl/expand-phase-templates.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/expand-phase-templates.test.ts` (modify)

## Out of Scope

- Checking for `null` arg values (these are valid primitives that `String(null)` renders as `"null"` — a plausible, if unusual, value)
- Adding similar guards to `expand-piece-generation.ts` (its `substitutePattern` operates on a fixed dimension value set, not user-provided args)
- Runtime validation of phase IDs (already handled by downstream compilation)

## Acceptance Criteria

### Tests That Must Pass

1. A `fromTemplate` entry with `args: { roundId: undefined }` emits `CNL_COMPILER_PHASE_TEMPLATE_ARG_UNDEFINED` and does not produce an expanded phase.
2. A `fromTemplate` entry with all args defined (including falsy values like `0`, `""`, `false`) succeeds without the new diagnostic.
3. All existing `expand-phase-templates.test.ts` tests continue to pass.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No phase template expansion proceeds with `undefined` arg values.
2. The diagnostic pinpoints the specific arg name and template name.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-phase-templates.test.ts` — "emits CNL_COMPILER_PHASE_TEMPLATE_ARG_UNDEFINED when an arg value is undefined": create a `fromTemplate` entry with `args: { roundId: undefined }`. Assert the diagnostic is emitted with the correct code, path, and message.
2. `packages/engine/test/unit/expand-phase-templates.test.ts` — "allows falsy but defined arg values (0, empty string, false)": create a `fromTemplate` entry with `args: { roundId: 0 }` and `args: { roundId: '' }`. Assert no `ARG_UNDEFINED` diagnostic and successful expansion.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "expand-phase-templates|expandPhaseTemplates"`
2. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`
