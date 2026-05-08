# 161CHOOSNINNPREV-008: chooseNStep inner-preview replay-identity test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes (test only) — `packages/engine/test/determinism/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

Foundation 8 (Determinism Is Sacred) requires byte-identical replay across two runs of the same GameDef + initial state + seed + actions. Spec 161 introduces a new code path (per-root-option chooseNStep preview drive) with state-isolation via `createMutableState`, beam-driver delegation, and per-root iteration over a stable lexicographic order. Each of these is a place where determinism could leak (key-ordering bugs, snapshot freeze gaps, RNG-state bleed). Following the precedent of `spec-160-inner-preview-replay-identity.test.ts`, this ticket adds the architectural-invariant test pinning replay identity for chooseNStep inner trace.

## Assumption Reassessment (2026-05-07)

1. `packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts` exists as the convention precedent.
2. Ticket 004 has landed the dispatch; with `chooseNStep: true`, every chooseNStep microturn now produces non-`disabled` `previewUsage` and synthetic-decision arrays.
3. Replay-identity tests live in `packages/engine/test/determinism/` and run via `pnpm -F @ludoforge/engine test:determinism`.

## Architecture Check

1. F#8 — Determinism: replay-identity is an engine invariant, not a profile-quality witness. The test asserts only engine-level invariants and goes in `determinism/`, not `policy-profile-quality/`.
2. F#16 — Testing as Proof: runtime determinism is proven by replay tests, not assumed.
3. Engine-agnostic test fixture — uses a constructed game or FITL canary with chooseNStep frontiers. F#1 honored.

## What to Change

### 1. New determinism test `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.ts`

`architectural-invariant`. Models on `spec-160-inner-preview-replay-identity.test.ts`. Asserts:

- Same GameDef, initial state, seed, and action sequence produce byte-identical canonical serialized state across two runs.
- Same conditions produce byte-identical `previewUsage` and synthetic-decision arrays at every chooseNStep microturn.
- A profile with `preview.inner.chooseNStep: true` produces stable `chooseNStep:<decisionKey>:add:<JSON(value)>` keys in stable order across two runs.
- `evaluatedCandidateCount` is identical across runs.

Use a profile that opts into `preview.inner.chooseNStep: true` so the new code path is exercised.

## Files to Touch

- `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.ts` (new — `architectural-invariant`)

## Out of Scope

- No-op-default invariant — Ticket 009 (separate test).
- Hidden-info, structural audit, FITL canary golden — Tickets 007, 010, 011.
- Source-code changes — none required; this ticket only adds the test.

## Acceptance Criteria

### Tests That Must Pass

1. New: two runs produce byte-identical canonical state.
2. New: two runs produce byte-identical `previewUsage` and synthetic decisions at every chooseNStep microturn.
3. New: stable iteration order across runs.
4. New: stable `evaluatedCandidateCount`.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.
6. Existing determinism suite: `pnpm -F @ludoforge/engine test:determinism`.

### Invariants

1. (architectural-invariant) Same GameDef + initial state + seed + actions = byte-identical canonical state and chooseNStep `previewUsage` and synthetic-decision arrays. (F#8; Spec 161 acceptance #10.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over chooseNStep inner trace. Modeled on `spec-160-inner-preview-replay-identity.test.ts`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.js`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm -F @ludoforge/engine test`
