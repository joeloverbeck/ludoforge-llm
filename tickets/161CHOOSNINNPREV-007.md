# 161CHOOSNINNPREV-007: Hidden-info propagation test at chooseNStep continuation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes (test only) — `packages/engine/test/unit/agents/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

Spec 161 claims hidden-info routing parity with the chooseOne path: per-root-option ref resolution flows through the same `resolveRefs` / `policy-surface.ts` plumbing, and `unknownHidden` propagates to `preview.option.*` refs and `outcomeBreakdown.unknownHidden` increments accordingly. The reassessment confirmed structurally that `runChooseNStepBeamPreview`'s `resolveBeamResult` calls into the same `resolveRefs` chain that `runChooseOneInnerPreview` uses. This ticket adds the architectural-invariant test that pins the property — preventing future refactors from quietly bypassing observer-projected resolution at chooseNStep continuation.

## Assumption Reassessment (2026-05-07)

1. `runChooseNStepBeamPreview` resolves refs via `resolveBeamResult` (now in `policy-preview-inner-choosenstep.ts` post Ticket 001), which calls the shared `resolveRefs` helper still hosted in `policy-preview-inner.ts`. `resolveRefs` consults `policy-surface.ts` for visibility and emits `hidden` for refs whose underlying observer-projected resolver returns hidden.
2. The chooseOne hidden-info test in Spec 160 lives at `packages/engine/test/unit/agents/policy-preview-inner-fitl-hidden-info.test.ts` (or similar; verify path during implementation) and serves as the modeling precedent for the chooseNStep variant.
3. Ticket 004 has wired the chooseNStep dispatch and the chooseN microturn evaluator now receives populated `previewOptionResolvedRefsByOptionKey`.

## Architecture Check

1. F#4 — Authoritative State and Observer Views: `preview.option.*` refs MUST honor hidden-information policy. The test pins this property.
2. F#16 — Testing as Proof: hidden-info routing is an architectural invariant; not a property to assume.
3. Engine-agnostic — test uses constructed fixtures with no game-specific identifiers. F#1 honored.

## What to Change

### 1. New unit test `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts`

`architectural-invariant`. Constructed fixture:

- Profile with `preview.inner.chooseNStep: true` and a microturn-scope consideration referencing `preview.option.victory.currentMargin.self` (or analogous hidden-resolvable ref).
- A chooseNStep microturn whose continuation beam evaluates a state branch where the underlying observer-projected resolver returns hidden for the `victory.currentMargin.self` ref.

Asserts:

- The per-root-option `resolvedRefs` for that ADD contains `preview.option.victory.currentMargin.self: unknownHidden`.
- `outcomeBreakdown.unknownHidden` increments for the affected drive.
- `outcome` propagates as `hidden` for the affected per-root-option result.
- A separate ADD whose continuation does NOT trigger hidden resolution returns a concrete numeric ref value with `outcome: 'ready'` — proving the routing is per-option, not whole-microturn.

## Files to Touch

- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Any source-code changes — the routing is already correct (verified during reassessment); this ticket only adds the test.
- chooseOne hidden-info coverage — already exists from Spec 160.

## Acceptance Criteria

### Tests That Must Pass

1. New: hidden-resolved per-option ref returns `unknownHidden` and increments `outcomeBreakdown.unknownHidden`.
2. New: per-option resolution is independent — non-hidden ADDs in the same microturn return concrete refs.
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) `preview.option.*` refs return `unknownHidden` whenever the underlying observer-projected resolver returns hidden, at chooseNStep continuation states. (Spec 161 acceptance #12; F#4.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (new) — `architectural-invariant`. F#4 hidden-info enforcement at chooseNStep continuation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`
