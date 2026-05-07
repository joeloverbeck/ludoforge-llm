# 160PEROPTPREV-008: Compile-time warning for opt-in without `preview.option.*` consideration

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `cnl/validate-agents.ts`
**Deps**: `archive/tickets/160PEROPTPREV-003.md`, `archive/tickets/160PEROPTPREV-004.md`

## Problem

Spec 160 §7 specifies a compile-time warning when a profile sets `preview.inner.chooseOne: true` but no microturn-scope consideration uses any `preview.option.*` ref. In that configuration, the per-option preview drive runs (consuming budget) but produces no scoring signal — a silent operator footgun.

This ticket adds the warning emission. The check is purely static (compiler-side) and follows the existing warning pattern at `validate-agents.ts:158-164` (e.g., `CNL_COMPILER_AGENT_PREVIEW_POLICYGUIDED_NO_MICROTURN_CONSIDERATIONS`).

## Assumption Reassessment (2026-05-06)

1. Ticket 003 has compiled `preview.inner.chooseOne` so the validator can read `compiledProfile.preview.inner?.chooseOne`.
2. Ticket 004 has registered the `preview.option.*` ref kinds; the validator scans referenced considerations for policy-expression refs starting with `preview.option.`.
3. The warning-emission API at `validate-agents.ts:158-164` uses a `Diagnostic` object with `{ severity: 'warning', code, path, message, suggestion }`.

## Architecture Check

1. **Compiler-kernel validation boundary** (Foundation 12): this is a static, spec-derivable check — compiler responsibility, not runtime.
2. **Engine-agnostic** (Foundation 1): the check inspects ref-kind strings, not game identifiers.
3. **No backwards-compatibility shim** (Foundation 14): warning only — does not block compilation; existing profiles that opt in continue to compile (and emit the warning).

## What to Change

### 1. Add warning check to `validate-agents.ts`

Inside the per-profile validation pass in `packages/engine/src/cnl/validate-agents.ts`:

- Check `compiledProfile.preview.inner?.chooseOne === true`.
- Scan `profile.use.considerations` for any referenced consideration whose policy expression contains a `preview.option.*` ref AND whose `scopes` includes `microturn`.
- If `chooseOne === true` AND no matching consideration is found, push a warning diagnostic:

```ts
diagnostics.push({
  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION,
  path: `${profilePath}.preview.inner.chooseOne`,
  severity: 'warning',
  message: `Profile "${profileId}" has preview.inner.chooseOne enabled but no microturn-scope consideration references preview.option.* refs — the per-option preview drive will run but produce no scoring signal.`,
  suggestion: 'Add a microturn-scope consideration that references preview.option.delta.victory.currentMargin.self or another preview.option.* ref, or disable preview.inner.chooseOne.',
});
```

### 2. Register diagnostic code

Register `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` in the diagnostic-codes module alongside other CNL_COMPILER_AGENT_PREVIEW_* codes.

### 3. Test cases (extend ticket 003's test file)

Extend `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (created by ticket 003) with:

- Case: `preview.inner.chooseOne: true` + no `preview.option.*` consideration → warning fires.
- Case: `preview.inner.chooseOne: true` + at least one microturn-scope consideration referencing `preview.option.*` → no warning.
- Case: `preview.inner.chooseOne: false` (default) → no warning regardless of considerations.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify — warning emission)
- Diagnostic-codes module (modify — register `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION`; verify path during implementation)
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (modify — add three warning-emission test cases)

## Out of Scope

- Per-option preview driver behavior — ticket 005.
- Trace integration — ticket 007.
- Cookbook documentation of the warning — ticket 010.

## Acceptance Criteria

### Tests That Must Pass

1. New: `preview.inner.chooseOne: true` + no `preview.option.*` consideration emits the warning.
2. New: `preview.inner.chooseOne: true` + at least one matching consideration does not emit the warning.
3. New: `preview.inner.chooseOne: false` (default) does not emit the warning regardless of considerations.
4. Existing `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) The warning is emitted exactly once per profile that satisfies the conditions; never emitted for profiles with the default-off config.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (modify — add three warning-emission cases) — `architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/compile-preview-inner.test.js`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`

## Outcome (2026-05-07)

Implemented.

- Added `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` to the compiler diagnostic code registry.
- Added the static validator warning in `packages/engine/src/cnl/validate-agents.ts`. The live authored contract stores `preview.option.*` usage as policy-expression refs inside referenced considerations, not as a standalone `feature` field, so the validator scans the profile's referenced microturn-scope considerations for `ref` or legacy-shaped `feature` entries beginning with `preview.option.`.
- Extended `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` with the three ticket-owned warning cases: opt-in with no matching ref warns, opt-in with a microturn `preview.option.*` consideration does not warn, and default/disabled `chooseOne` does not warn.
- Corrected the active Spec 160 prose and deferred cookbook ticket wording from the stale `feature: preview.option...` example to the live policy-expression ref shape.

Schema/artifact fallout: none; this adds a diagnostic code and validator logic only.

Touched-file scope: all ticket-named files were touched. `specs/160-per-option-preview-inner-microturns.md` and `tickets/160PEROPTPREV-010.md` received owned series-prose corrections for the same stale authoring noun; no sibling boundary changed. `packages/engine/src/cnl/validate-agents.ts` was already above the repository's typical 400-line guidance and grew to 506 lines; extraction was considered, but the added helpers are tightly scoped to the existing profile-validation pass and splitting them would widen this small compiler-warning ticket. No separate extraction ticket is justified.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test dist/test/unit/cnl/compile-preview-inner.test.js` from `packages/engine/` — passed.
3. `pnpm turbo typecheck` — passed.
4. `pnpm -F @ludoforge/engine test` — passed.

Post-review cleanup: moved this outcome block to the bottom of the ticket to match `docs/archival-workflow.md`; no implementation behavior changed.

No-invalidation: this outcome/status transcription, same-contract prose correction, and post-review outcome-block relocation changed no code, acceptance criteria, command semantics, dependency ownership, or follow-up boundary after the green proof lanes.
