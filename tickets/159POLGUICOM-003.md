# 159POLGUICOM-003: Compile-time warning for `policyGuided` without microturn considerations

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL validator (`validate-agents.ts`)
**Deps**: `archive/tickets/159POLGUICOM-001.md`, `archive/tickets/159POLGUICOM-002.md`

## Problem

After ticket 001 lands, an operator can author `preview.completion: policyGuided` but declare zero microturn-scope considerations on the profile. The runtime behavior is well-defined (every inner microturn falls through to the configured `fallbackCompletionPolicy`), but the operator's intent — to differentiate via policy guidance — is silently violated. F#15 (Architectural Completeness) demands the build surface this no-op configuration as a warning so operators don't accidentally ship profiles that always fall back. This ticket adds the warning in `validate-agents.ts` and authors the corresponding test. The warning is non-fatal: an operator may declare `policyGuided` planning to add microturn considerations later, and a hard error would block iterative authoring.

## Assumption Reassessment (2026-05-06)

1. `packages/engine/src/cnl/validate-agents.ts` exists and is the natural home for profile-level warnings. It currently validates the `agents` section structure; this ticket adds a new diagnostic for the `policyGuided`-without-microturn-considerations case.
2. After ticket 001, profiles with `preview.completion: policyGuided` will be the only path that triggers this warning — `agentGuided` no longer exists in the schema.
3. Spec 158 (archived/COMPLETED) added the `microturn` scope and the `scopes: ['microturn']` authoring surface on considerations. The `microturn` scope is a valid value in the Zod schema; checking `profile.use.considerations` for at least one microturn-scope entry is a tractable static check.
4. The warning is informational (`severity: 'warning'`), not blocking — `severity: 'error'` would prevent profile compilation, which is too aggressive for an operator iterating on a profile mid-authoring.
5. The test path `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` matches the repo's `test/unit/cnl/` subdirectory convention for compiler diagnostics tests.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** A warning-tier diagnostic at compile time is the cheapest way to surface a no-op config to the operator without blocking the build. Runtime detection (via the `completionPolicyFallbackCount` aggregate from ticket 002) is also useful, but compile-time catches it before the profile is ever exercised — F#15 wants the operator to know at authoring time, not after running a campaign.
2. **GameSpecDoc vs runtime boundary.** The warning is a static check against the profile's authored shape — it consults the consideration scopes (an authoring concept) and the `preview.completion` value (an authoring concept). No runtime state is involved. Engine-generic.
3. **No backwards-compatibility shims.** This is purely additive — no existing diagnostic is modified or removed. The warning is silently absent for profiles using `greedy` (the default), and silently absent for profiles using `policyGuided` with at least one microturn-scope consideration.
4. **F#15 (Architectural Completeness).** The warning closes the second half of Gap 5 from `reports/microturn-preview-architectural-gaps-2026-05-06.md` — the silent-fallback half is closed by ticket 002, the no-microturn-considerations half is closed here.

## What to Change

### 1. Add the warning emitter — `packages/engine/src/cnl/validate-agents.ts`

Inside the agent-profile validation pass, when iterating profiles, after the profile-level structural checks:

```ts
if (profile.preview?.completion === 'policyGuided') {
  const hasMicroturnScope = (profile.use?.considerations ?? []).some((considerationId) => {
    const consideration = doc.agents?.library?.considerations?.[considerationId];
    return consideration?.scopes?.includes('microturn') === true;
  });
  if (!hasMicroturnScope) {
    const fallbackPolicy = profile.preview?.fallbackCompletionPolicy ?? 'greedy';
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POLICYGUIDED_NO_MICROTURN_CONSIDERATIONS,
      path: `agents.profiles[${profileId}].preview.completion`,
      severity: 'warning',
      message: `Profile "${profileId}" declares preview.completion: policyGuided but has no scopes: [microturn] considerations — completion will always fall back to ${fallbackPolicy}.`,
      suggestion: 'Add at least one consideration with scopes: [microturn] to the profile, or set preview.completion to greedy.',
    });
  }
}
```

The exact iteration shape may be tightened against the existing `validate-agents.ts` patterns during implementation — the rule is the trigger condition (`completion === 'policyGuided'` AND zero microturn-scope considerations), not the loop shape.

### 2. Register the diagnostic code

Add `CNL_COMPILER_AGENT_PREVIEW_POLICYGUIDED_NO_MICROTURN_CONSIDERATIONS` to `CNL_COMPILER_DIAGNOSTIC_CODES` in the kernel diagnostics module (the canonical home of these codes — locate during implementation if not already imported by `validate-agents.ts`).

### 3. Author the test — `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts`

`architectural-invariant` test with three cases:
- **Fires**: profile with `preview.completion: 'policyGuided'` and zero microturn-scope considerations → diagnostic at the new code with `severity: 'warning'`.
- **Suppressed (microturn scope present)**: profile with `preview.completion: 'policyGuided'` and at least one microturn-scope consideration → no diagnostic at the new code.
- **Suppressed (greedy)**: profile with `preview.completion: 'greedy'` (or unset) → no diagnostic at the new code regardless of consideration scopes.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify — add the policyGuided / no-microturn-considerations warning emitter)
- `packages/engine/src/kernel/diagnostics.ts` or equivalent (modify — add `CNL_COMPILER_AGENT_PREVIEW_POLICYGUIDED_NO_MICROTURN_CONSIDERATIONS` to the diagnostic-codes registry; locate the canonical home during implementation)
- `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Behavior change to the fallback path itself. (Ticket 002.)
- Cookbook documentation of the warning. (Ticket 004.)
- Changing the warning to an error — explicitly rejected in this ticket; an operator may legitimately declare `policyGuided` mid-authoring with no microturn considerations yet authored.
- Touching the runtime — this is a compile-time warning only; runtime behavior (always-fallback) is correct and documented.

## Acceptance Criteria

### Tests That Must Pass

1. AC#4 (fires): a profile with `preview.completion: 'policyGuided'` and zero microturn-scope considerations produces a `severity: 'warning'` diagnostic at the new code, with a message containing "no scopes: [microturn] considerations".
2. AC#4 (suppressed by microturn scope): a profile with `preview.completion: 'policyGuided'` and at least one microturn-scope consideration produces NO diagnostic at the new code.
3. AC#4 (suppressed by greedy): a profile with `preview.completion: 'greedy'` (or unset) produces NO diagnostic at the new code regardless of consideration scopes.
4. Existing engine suite: `pnpm -F @ludoforge/engine test`.
5. Existing typecheck: `pnpm turbo typecheck`.
6. Existing lint: `pnpm turbo lint`.

### Invariants

1. (architectural-invariant) The warning fires if and only if `profile.preview.completion === 'policyGuided'` AND the profile's considerations contain no entry with `scopes` including `'microturn'`.
2. (architectural-invariant) The warning is `severity: 'warning'`, never `'error'` — operators iterating on a profile mid-authoring can compile partial states without the diagnostic blocking the build.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` (new) — `architectural-invariant`. Three cases per Acceptance Criteria above.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- cnl/compile-policy-guided-warning`
2. `pnpm turbo lint typecheck test`
