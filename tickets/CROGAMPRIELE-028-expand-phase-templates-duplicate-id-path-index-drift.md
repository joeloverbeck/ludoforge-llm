# CROGAMPRIELE-028: Duplicate-ID diagnostic path index drifts when earlier entries are skipped

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — cnl expand-phase-templates
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-005-parameterized-phase-templates.md`, `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-021-phase-template-duplicate-id-diagnostic-provenance.md`

## Problem

In `expandPhaseTemplates` (`expand-phase-templates.ts`), the post-expansion duplicate-ID check constructs `allEntries` by mapping the *expanded* arrays with their positional indices:

```typescript
const allEntries = [
  ...expandedPhases.map((e, i) => ({ ...e, path: `turnStructure.phases[${i}]` })),
  ...(expandedInterrupts ?? []).map((e, i) => ({ ...e, path: `turnStructure.interrupts[${i}]` })),
];
```

The index `i` is the position within `expandedPhases` / `expandedInterrupts` — the *output* arrays. When a `fromTemplate` entry earlier in the input is skipped (due to `PARAM_MISSING`, `PARAM_EXTRA`, or `ARG_UNDEFINED` validation failure), the output array is shorter than the input array. The `path` in any subsequent duplicate-ID diagnostic then points to the wrong input index.

Example: input has `phases[0]` (skipped, param error), `phases[1]`, `phases[2]`. The expanded array has 2 entries at indices 0 and 1. If `phases[1]` and `phases[2]` produce the same ID, the diagnostic says `turnStructure.phases[0]` and `turnStructure.phases[1]` — but the actual culprits are input entries 1 and 2.

This is a diagnostic-accuracy issue, not a runtime-correctness issue — the spec is still rejected. But the wrong path misleads spec authors trying to fix their input.

## Assumption Reassessment (2026-03-03)

1. `expandPhaseArray` at `expand-phase-templates.ts:72-153` builds the `expanded` array by pushing only successfully-expanded entries, skipping those that fail validation. The output array's length ≤ input array's length. **Verified.**
2. The `allEntries` construction at lines 241-244 uses `.map((e, i) => ...)` where `i` is the output index, not the input index. **Verified.**
3. `ExpandedPhaseEntry` (the output type) has `phase` and optional `fromTemplate` but no `inputIndex` field. **Verified.**
4. The issue affects only the `PHASE_TEMPLATE_DUPLICATE_ID` diagnostic's `path` field. All other diagnostics emitted during expansion use the input index (`entryIdx` at line 86). **Verified.**

## Architecture Check

1. The cleanest fix is to add an `inputIndex` field to `ExpandedPhaseEntry` so the original input position flows through to the duplicate-ID check. This follows the existing provenance pattern (CROGAMPRIELE-021 added `fromTemplate` to the same struct for a similar reason).
2. No game-specific logic — this is pure compiler infrastructure.
3. No backwards-compatibility shims. The diagnostic `path` field changes from an incorrect value to a correct one.

## What to Change

### 1. Add `inputIndex` to `ExpandedPhaseEntry`

```typescript
interface ExpandedPhaseEntry {
  readonly phase: GameSpecPhaseDef;
  readonly fromTemplate?: string;
  readonly inputIndex: number;
}
```

### 2. Pass `entryIdx` through in `expandPhaseArray`

In the `expanded.push(...)` calls (both the literal-phase path and the substituted path), include `inputIndex: entryIdx`.

### 3. Use `inputIndex` in the `allEntries` mapping

```typescript
const allEntries = [
  ...expandedPhases.map((e) => ({ ...e, path: `turnStructure.phases[${e.inputIndex}]` })),
  ...(expandedInterrupts ?? []).map((e) => ({ ...e, path: `turnStructure.interrupts[${e.inputIndex}]` })),
];
```

## Files to Touch

- `packages/engine/src/cnl/expand-phase-templates.ts` (modify)
- `packages/engine/test/unit/expand-phase-templates.test.ts` (modify)

## Out of Scope

- The separate duplicate-ID check in the validator (`validate-spec-core.ts`) — that is CROGAMPRIELE-024.
- Changing the diagnostic code or severity — `PHASE_TEMPLATE_DUPLICATE_ID` remains correct.

## Acceptance Criteria

### Tests That Must Pass

1. When `phases[0]` is skipped (param error) and `phases[1]`/`phases[2]` produce duplicate IDs, the diagnostic path references the correct input indices (1 and 2), not the output indices (0 and 1).
2. When no entries are skipped, the diagnostic path indices match the input indices (existing behavior preserved).
3. All existing `expand-phase-templates.test.ts` tests continue to pass.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic `path` fields in `PHASE_TEMPLATE_DUPLICATE_ID` always reference input-array positions, not output-array positions.
2. `ExpandedPhaseEntry.inputIndex` is always set for every entry.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-phase-templates.test.ts` — "duplicate-ID diagnostic uses input index when earlier entries are skipped": create a 3-entry phases array where entry 0 has a param error (skipped) and entries 1 and 2 produce duplicate IDs. Assert the diagnostic path contains `phases[1]` or `phases[2]`, not `phases[0]` or `phases[1]`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "expandPhaseTemplates"`
2. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`
