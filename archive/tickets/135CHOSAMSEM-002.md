# 135CHOSAMSEM-002: Add `retryBiasNonEmpty` option and thread through `completeTemplateMove` to `chooseAtRandom` clamp

**Status**: DEFERRED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel move completion (`packages/engine/src/kernel/move-completion.ts`)
**Deps**: `specs/135-choosen-sampler-semantics.md`

## Problem

This draft ticket's owned slice was absorbed on 2026-04-18 by `135CHOSAMSEM-001` through a user-directed boundary rewrite required for `docs/FOUNDATIONS.md` alignment. It remains only as a historical record of the original planned split.

Spec 135 relocates the "prefer non-empty" bias from the sampler (`selectFromChooseN`) to the caller-retry layer. The relocation is architecturally split across 135CHOSAMSEM-002 through -004. This ticket installs the signature plumbing: a new `retryBiasNonEmpty?: boolean` option on `TemplateMoveCompletionOptions`, threaded through `completeTemplateMove` into `chooseAtRandom`, where it produces a call-site clamp (min=1 for optional chooseN) before invoking `selectFromChooseN`.

Critically, this ticket does NOT remove `sampledMin` from `selectFromChooseN` and does NOT wire the retry caller to set the flag. After this ticket: the option exists, the clamping logic exists at the call site, but no caller sets `retryBiasNonEmpty: true`, and the sampler continues to apply `sampledMin`. Observable behavior is unchanged. The call-site clamp is redundant with `sampledMin` for now; it becomes load-bearing only after 135CHOSAMSEM-004 deletes `sampledMin`.

This separation preserves a reviewable per-ticket diff and prevents an intermediate state where bias is broken.

## Historical Resolution

- The `retryBiasNonEmpty` option, call-site clamp, and associated tests landed as part of `135CHOSAMSEM-001`.
- This draft stays deferred so the original spec-to-ticket decomposition remains inspectable, but it no longer represents pending implementation work.

## Assumption Reassessment (2026-04-18)

1. `TemplateMoveCompletionOptions` is the existing options record on `completeTemplateMove` — confirmed via spec 135 reassessment. Adding an optional field with default `false` is a backwards-compatible extension at the type level and costs nothing for existing callers (e.g., `playable-candidate.ts`) that omit the field.
2. `chooseAtRandom` is the single internal call site of `selectFromChooseN` (confirmed in the session's Explore agent report). Clamping at `chooseAtRandom` — not inside `selectFromChooseN` — preserves Spec 135 Contract §1 (sampler purity) even during the transition.
3. `selectFromChooseN` is not exported; it is a module-internal helper. No external consumers need updating.

## Architecture Check

1. **Why this approach is cleaner**: The clamp at `chooseAtRandom` is driven by an explicit flag that flows from the call site. The sampler itself remains pure — it samples uniformly over the `[min, max]` it is given. Retry policy is cleanly separated from sampling mechanics (Foundation 15: architectural completeness — decisions made at the layer that owns the context).
2. **Agnostic boundaries**: `retryBiasNonEmpty` is a generic completion-options flag. No game-specific logic is introduced. Foundation 1 preserved.
3. **No backwards-compatibility shims**: The flag is optional with default `false`. This is not a shim — it is a deliberate additive extension with a well-defined default. Foundation 14's prohibition targets alias paths and legacy suffixes, not optional options with sensible defaults.

## What to Change

### 1. Extend `TemplateMoveCompletionOptions`

In `packages/engine/src/kernel/move-completion.ts`, add an optional field:

```ts
interface TemplateMoveCompletionOptions {
  // existing fields...
  readonly retryBiasNonEmpty?: boolean;
}
```

Default is `false` (absent). Document that when `true`, any optional chooseN (`min === 0 && max > 0 && options.length >= 1`) encountered during this completion samples as if declared `min: 1`.

### 2. Thread the flag into `chooseAtRandom`

`completeTemplateMove` → `completeTemplateMoveInternal` → `chooseAtRandom`: pass the flag through the internal call chain. Whatever mechanism is already used to thread options (e.g., closure capture, parameter passing) extends to carry this flag.

### 3. Apply the clamp at the call site

In `chooseAtRandom`, when constructing the `(min, max)` passed to `selectFromChooseN`, apply:

```ts
const declaredMin = request.min ?? 0;
const clampedMin = options.retryBiasNonEmpty
  && declaredMin === 0
  && max > 0
  && optionSet.length >= 1
  ? 1
  : declaredMin;
// selectFromChooseN(optionSet, clampedMin, max, rng)
```

(Exact symbol names match current code; pseudocode above.)

### 4. No changes to `selectFromChooseN`

`selectFromChooseN` continues to contain `sampledMin = min === 0 && max > 0 && options.length > 0 ? 1 : min;`. That line is removed in 135CHOSAMSEM-004, not here. During the transitional period (after this ticket, before -004), both the call-site clamp and the sampler-internal clamp are active. Because both collapse to the same outcome (min=1 for optional chooseN when triggered), observable behavior is unchanged.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)

## Out of Scope

- Removal of `sampledMin` (135CHOSAMSEM-004).
- Retry-caller wiring in `prepare-playable-moves.ts` (135CHOSAMSEM-003).
- `drawDeadEnd` payload (135CHOSAMSEM-001).
- Warning emission (135CHOSAMSEM-003).
- Test migrations (135CHOSAMSEM-004).

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: given a template move with `retryBiasNonEmpty: true` on the options and an optional chooseN (`min=0, max=N, options.length >= 1`), the call site passes `min=1` to `selectFromChooseN`. This test can assert the behavioral outcome (count >= 1 across all seeds) rather than inspecting internal clamp logic directly.
2. New unit test: given a template move with `retryBiasNonEmpty: false` (or omitted) and an optional chooseN, the call site passes `declaredMin` unchanged to `selectFromChooseN`. Sampler-internal `sampledMin` logic (still live pre--004) applies as before.
3. Existing suite: `pnpm turbo test` — no regressions. Observable behavior for all existing callers is unchanged because no caller sets `retryBiasNonEmpty: true` yet.

### Invariants

1. `selectFromChooseN` remains unchanged in this ticket. Contract §1 (sampler purity) is not yet enforced here — it lands in 135CHOSAMSEM-004.
2. `TemplateMoveCompletionOptions.retryBiasNonEmpty` defaults to `false` when absent. No caller must be updated by this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion-retry-bias-option.test.ts` (new) — exercises the `retryBiasNonEmpty` flag at the options boundary. Confirms call-site clamping via behavioral observation (count distribution with flag on vs off for optional chooseN).

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo build test lint typecheck`
