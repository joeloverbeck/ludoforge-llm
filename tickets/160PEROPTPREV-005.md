# 160PEROPTPREV-005: `chooseOne` per-option preview driver + hidden-info routing

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-preview-inner.ts` (new)
**Deps**: `archive/tickets/160PEROPTPREV-002.md`, `archive/tickets/160PEROPTPREV-003.md`, `archive/tickets/160PEROPTPREV-004.md`

## Problem

Phase A core of Spec 160. When a profile opts in via `preview.inner.chooseOne: true`, every published `chooseOne` decision should produce per-option preview values that microturn-scope considerations (e.g., `preferOptionProjectedMargin` against `preview.option.delta.victory.currentMargin.self`) can read. Today, `chooseFrontierDecision` hardcodes `previewUsage: emptyPreviewUsage()` — preview is structurally not invoked at inner microturns.

This ticket introduces a new module `policy-preview-inner.ts` that drives per-option preview: for each legal option in a chooseOne, snapshot a Spec 146 draft state, apply the option, drive remaining microturns with `policyGuided` (Spec 159's `pickInnerDecision`, exported in ticket 002), resolve `preview.option.*` refs (registered in ticket 004), and return the per-option preview values for consumption by microturn-scope considerations. Hidden-info protection routes refs touching hidden surfaces through the existing `previewOutcome: 'hidden'` mechanism (no new enum value).

## Assumption Reassessment (2026-05-06)

1. Ticket 002 has exported `pickInnerDecision` from `policy-preview.ts:520`.
2. Ticket 003 has compiled `preview.inner` config so the runtime can read `compiledProfile.preview.inner.chooseOne` and triple-product fields.
3. Ticket 004 has registered the eight `preview.option.*` ref kinds and dispatch arms; the dispatch returns defaults until this driver populates the resolved-refs map.
4. Spec 146's `createMutableState` (`packages/engine/src/kernel/state-draft.ts:52`) supports per-call isolation — independent drafts per option preview (not stacked scopes; the spec acknowledges this).
5. `applyPublishedDecision` is exported from `packages/engine/src/kernel/microturn/apply.ts:469`.
6. Hidden-info plumbing centralizes in `packages/engine/src/agents/policy-surface.ts`; existing surface refs already return `previewOutcome: 'hidden'` when a surface is hidden for the seat (per `kernel/types-core.ts:1749`).

## Architecture Check

1. **Engine-agnostic** (Foundation 1): the driver operates on generic GameDef, decisions, and refs — no game-specific code paths.
2. **Bounded computation** (Foundation 10): per-option drives are bounded by `maxOptions × depthCap`; the triple-product cap (ticket 003) prevents budget explosion.
3. **Authoritative state and observer views** (Foundation 4): hidden-surface refs return via the existing `previewOutcome: 'hidden'` mechanism, reusing the centralized observer plumbing in `policy-surface.ts`. There is no new `unknownHidden` enum value.
4. **Immutability** (Foundation 11): each per-option draft is independent and fully isolated from caller-visible state via Spec 146's contract.

## What to Change

### 1. New module `packages/engine/src/agents/policy-preview-inner.ts`

Hosts the inner-microturn preview drivers. Initially exports `runChooseOneInnerPreview(input)`, parallel to `policy-preview.ts`'s `createPolicyPreviewRuntime`.

For each legal option in the chooseOne:

- Snapshot a draft state via `createMutableState` (Spec 146).
- Apply the chooseOne option to the draft via `applyPublishedDecision`.
- Drive remaining microturns of the same compound turn with `policyGuided` (using `pickInnerDecision` imported from `policy-preview.ts`, exported in ticket 002), to `preview.inner.depthCap` or compound-turn retirement, whichever comes first.
- Resolve `preview.option.*` refs against the resulting state. The `delta.*` refs subtract the pre-option value from the post-option value; the rest read the post-option state directly.
- Return `{ resolvedRefs, driveDepth, outcome }` per option.

### 2. Hidden-information routing

When resolving a `preview.option.*` ref whose underlying surface is hidden for the agent's seat, route through `policy-surface.ts`'s existing observer-projected resolver. The resolver returns the hidden marker via `previewOutcome: 'hidden'`; the per-option preview drive increments `outcomeBreakdown.unknownHidden` accordingly. No new enum value is introduced.

### 3. Wire into ref dispatch

Connect ticket 004's `preview.option.*` dispatch arms to read from the per-option resolved-refs map populated by `runChooseOneInnerPreview`. When the driver context is unavailable (no inner preview drive in progress), the dispatch returns the default per ticket 004's contract.

### 4. Driver invocation hook

Add the entry point that `chooseFrontierDecision` will call (in ticket 007). For now, the entry point is callable via tests; ticket 007 wires it into the agent path.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (new — chooseOne per-option driver)
- `packages/engine/test/unit/agents/policy-preview-inner-chooseone.test.ts` (new — per-option drive count, ref resolution, draft-state isolation)
- `packages/engine/test/unit/agents/policy-preview-inner-hidden-info.test.ts` (new — F#4 hidden-info enforcement; verifies `previewOutcome: 'hidden'` and `outcomeBreakdown.unknownHidden`)

## Out of Scope

- chooseN beam preview — ticket 006.
- `chooseFrontierDecision` integration — ticket 007 wires the new driver into the agent's frontier path and populates `previewUsage`.
- Compile-time warning for opt-in without consideration — ticket 008.
- Golden test — ticket 009.

## Acceptance Criteria

### Tests That Must Pass

1. New: `preview.inner.chooseOne: true` with a 2-option chooseOne and `depthCap: 4` invokes exactly 2 per-option preview drives, each driving up to depth 4.
2. New: per-option `preview.option.delta.victory.currentMargin.self` returns the correct difference between post-option and pre-option state on a fixture.
3. New: a chooseOne whose option preview would resolve a ref hidden for the seat surfaces `previewOutcome: 'hidden'` and increments `outcomeBreakdown.unknownHidden`.
4. New: each per-option draft state is fully isolated from caller-visible state — a regression assertion confirms no aliasing leaks across option drives (Spec 146 contract preserved).
5. Existing `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) For every chooseOne with `preview.inner.chooseOne: true`, exactly one preview drive runs per legal option.
2. (architectural-invariant) `preview.option.*` refs return `previewOutcome: 'hidden'` whenever the underlying observer-projected resolver returns hidden (Foundation 4).
3. (architectural-invariant) Each per-option draft state is fully isolated from caller-visible state (Spec 146 contract preserved).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-chooseone.test.ts` (new) — `architectural-invariant`. Per-option drive count, ref resolution, draft-state isolation.
2. `packages/engine/test/unit/agents/policy-preview-inner-hidden-info.test.ts` (new) — `architectural-invariant`. F#4 hidden-info enforcement.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js`
2. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-hidden-info.test.js`
3. `pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test`
