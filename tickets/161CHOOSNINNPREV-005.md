# 161CHOOSNINNPREV-005: Compile-time warning parity for `preview.inner.chooseNStep`

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/cnl/`
**Deps**: `tickets/161CHOOSNINNPREV-004.md`

## Problem

`validateInnerPreviewOptionConsiderations` at `validate-agents.ts:168` currently emits the `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` warning only when `preview.inner.chooseOne === true` and no microturn-scope `preview.option.*` consideration exists. After Ticket 004 wires up the chooseNStep dispatch, the same diagnostic should fire for `preview.inner.chooseNStep === true` profiles missing a microturn-scope consideration — otherwise operators silently opt into a runtime drive that produces no scoring signal.

## Assumption Reassessment (2026-05-07)

1. `validateInnerPreviewOptionConsiderations` exists at `validate-agents.ts:168`. The current early-return at line 177 reads `if (!isRecord(inner) || inner.chooseOne !== true) return;`.
2. `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` is registered at `compiler-diagnostic-codes.ts:260`.
3. `hasPreviewOptionMicroturnConsideration(profileDef.use, library)` is the existing predicate for "any microturn-scope `preview.option.*` consideration is referenced".
4. After Ticket 004, the chooseNStep runtime drive runs when the flag is opted in and the consideration is present — without the consideration, the drive runs but produces no scoring signal, justifying the warning.

## Architecture Check

1. Single shared diagnostic code — no new code added, no alias. The path string differentiates which flag triggered. F#14 honored.
2. The warning's existence and message are runtime-truthful only after Ticket 004 lands; this ticket is gated on Ticket 004 to avoid emitting a misleading warning during the silent-no-op transition window.
3. Engine-agnostic — validator changes touch no game-specific identifiers. F#1 honored.

## What to Change

### 1. Refactor `validateInnerPreviewOptionConsiderations` — `packages/engine/src/cnl/validate-agents.ts`

Replace the early-return at line 177 and the surrounding diagnostic emission with a flag-collection + per-flag emission pattern:

```ts
const flagsRequiringConsideration: Array<'chooseOne' | 'chooseNStep'> = [];
if (inner.chooseOne === true) flagsRequiringConsideration.push('chooseOne');
if (inner.chooseNStep === true) flagsRequiringConsideration.push('chooseNStep');
if (flagsRequiringConsideration.length === 0) return;
if (hasPreviewOptionMicroturnConsideration(profileDef.use, library)) return;

for (const flag of flagsRequiringConsideration) {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION,
    path: `${profilePath}.preview.inner.${flag}`,
    severity: 'warning',
    message: `Profile "${profileId}" has preview.inner.${flag} enabled but no microturn-scope consideration references preview.option.* refs; the per-option preview drive will run but produce no scoring signal.`,
    suggestion: `Add a microturn-scope consideration that references preview.option.delta.victory.currentMargin.self or another preview.option.* ref, or disable preview.inner.${flag}.`,
  });
}
```

A profile with both flags enabled and no consideration emits two diagnostics (one per flag), each with a flag-specific path.

### 2. New unit test `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts`

`architectural-invariant`. Asserts:

- A profile with `chooseOne: true` and no `preview.option.*` consideration emits exactly one diagnostic with path `...preview.inner.chooseOne`.
- A profile with `chooseNStep: true` and no `preview.option.*` consideration emits exactly one diagnostic with path `...preview.inner.chooseNStep`.
- A profile with both flags `true` and no consideration emits two diagnostics, one per flag.
- A profile with either or both flags `true` AND a `preview.option.*` consideration emits zero diagnostics.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify — extend warning to chooseNStep)
- `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Squared-cost formula validation — Ticket 006.
- Diagnostic code rename — Ticket 006.
- Any chooseOne behavior change — the chooseOne path is unchanged structurally.

## Acceptance Criteria

### Tests That Must Pass

1. New: warning fires for `chooseOne: true` without consideration (existing behavior preserved).
2. New: warning fires for `chooseNStep: true` without consideration (new behavior).
3. New: both warnings fire when both flags are set without a consideration.
4. New: zero warnings when a `preview.option.*` consideration exists, regardless of which flags are set.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.
6. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) Each opt-in flag without a corresponding consideration emits exactly one diagnostic; presence of a consideration suppresses all flag-specific warnings.
2. The diagnostic code (`CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION`) is reused; no new code added.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts` (new) — `architectural-invariant`. Warning fires for both `chooseOne: true` and `chooseNStep: true` cases; combined fires twice; consideration suppresses.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/validate-preview-inner-warning-parity.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`
