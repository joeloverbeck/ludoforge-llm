# CROGAMPRIELE-027: Compiler metadata boundary check missing for actionDefaults.afterEffects

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cnl validator
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-006-phase-action-defaults.md`, `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-010-texas-holdem-spec-migration.md`

## Problem

`validateAuthoredCompilerMetadataBoundary()` in `validate-actions.ts` validates that spec authors do not use reserved compiler metadata keys in effect arrays. It currently checks:

- `doc.actions[*].effects` (action effects)
- `doc.triggers[*].effects` (trigger effects)
- `doc.turnStructure.phases[*].onEnter` (phase onEnter effects)
- `doc.turnStructure.phases[*].onExit` (phase onExit effects)
- `doc.turnStructure.interrupts[*].onEnter` / `onExit` (interrupt effects)
- `doc.actionPipelines[*].costEffects` and `stages[*].effects` (pipeline effects)

It does NOT check:

- `doc.turnStructure.phases[*].actionDefaults.afterEffects` (phase actionDefaults after-effects)
- `doc.turnStructure.phases[*].actionDefaults.pre` (less relevant since `pre` is conditions, not effects — but worth verifying)
- Phase template definitions (`doc.phaseTemplates[*].phase.actionDefaults.afterEffects`)

If a spec author places reserved compiler metadata keys inside `actionDefaults.afterEffects`, the boundary violation escapes detection.

## Assumption Reassessment (2026-03-03)

1. `validateAuthoredCompilerMetadataBoundary()` is at `validate-actions.ts:131-212`. **Verified.**
2. The `validatePhases` closure at lines 172-183 checks `phase.onEnter` and `phase.onExit` but not `phase.actionDefaults`. **Verified.**
3. `actionDefaults` is typed as `{ pre?: ConditionAST[]; afterEffects?: EffectAST[] }` in the compiled `PhaseDef`. In the raw `GameSpecDoc`, `actionDefaults` is `unknown` on the phase record. **Verified.**
4. `phaseTemplates` definitions are not checked at all by `validateAuthoredCompilerMetadataBoundary`. **Verified.**
5. The `validateEffectArrayForAuthoredCompilerMetadata` helper accepts an `unknown` and checks if it's an array of records with `__compiler` keys. **Verified.**

## Architecture Check

1. The fix extends the existing `validatePhases` closure to also recurse into `phase.actionDefaults.afterEffects`. This is consistent with the existing pattern — every authored effect array should be checked.
2. Phase templates should also be checked (their `phase.onEnter`, `phase.onExit`, and `phase.actionDefaults.afterEffects`), since they produce real phase definitions after expansion.
3. No game-specific logic — this is pure compiler infrastructure.
4. No backwards-compatibility shims.

## What to Change

### 1. Extend `validatePhases` closure to check `actionDefaults.afterEffects`

In the `validatePhases` closure within `validateAuthoredCompilerMetadataBoundary`, after checking `phase.onEnter` and `phase.onExit`, also check:

```typescript
if (isRecord(phase.actionDefaults)) {
  validateEffectArrayForAuthoredCompilerMetadata(
    phase.actionDefaults.afterEffects,
    `${basePath}.${index}.actionDefaults.afterEffects`,
    diagnostics,
  );
}
```

### 2. Add `phaseTemplates` checking

After the `turnStructure` block, add a check for `doc.phaseTemplates`:

```typescript
if (doc.phaseTemplates !== null) {
  for (const [index, template] of doc.phaseTemplates.entries()) {
    if (!isRecord(template) || !isRecord(template.phase)) continue;
    const basePath = `doc.phaseTemplates.${index}.phase`;
    validateEffectArrayForAuthoredCompilerMetadata(template.phase.onEnter, `${basePath}.onEnter`, diagnostics);
    validateEffectArrayForAuthoredCompilerMetadata(template.phase.onExit, `${basePath}.onExit`, diagnostics);
    if (isRecord(template.phase.actionDefaults)) {
      validateEffectArrayForAuthoredCompilerMetadata(
        template.phase.actionDefaults.afterEffects,
        `${basePath}.actionDefaults.afterEffects`,
        diagnostics,
      );
    }
  }
}
```

## Files to Touch

- `packages/engine/src/cnl/validate-actions.ts` (modify — extend `validateAuthoredCompilerMetadataBoundary`)

## Out of Scope

- Checking `actionDefaults.pre` for compiler metadata (pre is conditions, not effects — different shape)
- Changes to the `actionDefaults` compilation pipeline
- Adding new diagnostic codes — reuses existing `CNL_VALIDATOR_AUTHORED_COMPILER_METADATA`

## Acceptance Criteria

### Tests That Must Pass

1. A phase with compiler metadata in `actionDefaults.afterEffects` emits `CNL_VALIDATOR_AUTHORED_COMPILER_METADATA`.
2. A phase template with compiler metadata in `phase.actionDefaults.afterEffects` emits the diagnostic.
3. A phase with valid (non-metadata) `actionDefaults.afterEffects` produces no diagnostic.
4. Existing suite: `pnpm turbo test`

### Invariants

1. All authored effect arrays are checked for compiler metadata boundary violations.
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-actions.test.ts` — Add test: compiler metadata in `actionDefaults.afterEffects` emits diagnostic.
2. `packages/engine/test/unit/cnl/validate-actions.test.ts` — Add test: compiler metadata in phase template `actionDefaults.afterEffects` emits diagnostic.
3. `packages/engine/test/unit/cnl/validate-actions.test.ts` — Add test: valid `actionDefaults.afterEffects` produces no diagnostic.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
