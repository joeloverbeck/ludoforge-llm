# EVTLOG-009: Normalize Trigger varChanged Message Composition and Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: none

## Problem

`translate-effect-trace` composes trigger messages with a sentence envelope in `fired`/`truncated` wrappers. Trigger `varChanged` formatting currently reuses scoped variable-change text but does not include `oldValue/newValue`, so event-log trigger lines lose available runtime detail. In addition, punctuation ownership is split across helpers in a way that can produce malformed punctuation if value deltas are later threaded through without normalizing composition boundaries.

## Assumption Reassessment (2026-02-25)

1. Trigger wrappers in `translateTriggerEntry` append a period for `fired` and `truncated` entries.
2. `formatScopedVariableChangeMessage` can emit terminal punctuation when old/new deltas are included.
3. **Discrepancy corrected**: current trigger `varChanged` formatting does not pass `oldValue/newValue`, so duplicate punctuation is latent (not currently reproduced) while value-delta detail is currently omitted.
4. Existing tests assert trigger var-changed content with `toContain`, not exact final-string envelopes, so punctuation and full-sentence regressions can escape.

## Architecture Check

1. Trigger-event formatters should return punctuation-free event fragments; trigger wrappers should own final sentence punctuation.
2. Scoped variable-change formatting should expose both clause-level and sentence-level composition so effect entries and trigger entries can share logic without punctuation coupling.
3. Rendering trigger `varChanged` deltas when provided improves observability and aligns UI output with runtime event payloads.
4. This remains presentation-layer logic in runner only; no game-specific behavior is introduced in `GameDef`/runtime/simulator.

## What to Change

### 1. Split scoped var-change formatting responsibilities

Introduce/adjust formatting so clause generation is punctuation-free and sentence wrapping is applied at the envelope layer.

### 2. Include trigger varChanged old/new deltas when present

Thread `oldValue/newValue` through trigger var-changed event text generation.

### 3. Strengthen regression coverage for final trigger message strings

Add exact-string assertions for `fired` and `truncated` var-changed trigger messages (including scope labels, value deltas, and punctuation).

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine trigger emission semantics
- Event log panel rendering/layout behavior
- Non-varChanged trigger message wording redesign

## Acceptance Criteria

### Tests That Must Pass

1. `fired` var-changed trigger messages render scope + deltas with exactly one sentence terminator.
2. `truncated` var-changed trigger messages render scope + deltas with exactly one sentence terminator.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Trigger message envelope remains deterministic and independent from variable-change internals.
2. Runner event-log translation remains game-agnostic and visual-config-driven.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — exact-string assertions for `fired`/`truncated` `varChanged` messages (per-player and zone scopes), validating punctuation, scope labels, and value deltas.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-25
- Actual changes:
  - Split scoped var-change rendering into clause-level (no terminal punctuation) and sentence-level helpers.
  - Updated trigger var-changed rendering to include `oldValue/newValue` when present.
  - Added exact-string trigger assertions for fired/truncated var-changed messages (zone and per-player), including punctuation and scope labels.
- Deviations from original plan:
  - Ticket assumptions were corrected before implementation because duplicate punctuation was latent rather than currently reproducible; scope expanded to include value-delta rendering, which the runtime already emits.
- Verification:
  - `pnpm -F @ludoforge/runner test -- translate-effect-trace`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
