# EVTLOG-009: Fix Trigger varChanged Punctuation Envelope and Coverage Gaps

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: none

## Problem

`translate-effect-trace` currently composes trigger messages by appending `.` in the `fired`/`truncated` wrappers, while `varChanged` formatter output can also include terminal punctuation when old/new values are present. This can produce malformed event-log text (for example `..`) and is not fully guarded by tests.

## Assumption Reassessment (2026-02-25)

1. Trigger wrappers in `translateTriggerEntry` always append a period for `fired` and `truncated` entries.
2. Scoped variable-change formatting can emit sentence-final punctuation when value deltas are included.
3. **Mismatch + correction**: Existing tests validate substring presence for trigger var-changed text but do not assert full final message shape, so punctuation regressions are not caught.

## Architecture Check

1. Separating trigger-envelope punctuation from variable-change content punctuation yields deterministic message composition and avoids formatting coupling bugs.
2. This remains presentation-layer logic in runner only; no game-specific behavior is introduced in `GameDef`/runtime/simulator.
3. No backwards-compatibility aliases or shim paths are introduced.

## What to Change

### 1. Normalize trigger varChanged text composition

Ensure `fired`/`truncated` trigger message construction and var-changed formatter output compose to exactly one sentence terminator.

### 2. Strengthen regression coverage for final trigger message strings

Add full-string assertions for `fired` and `truncated` var-changed messages, including punctuation and scoped prefixes.

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine trigger emission semantics
- Event log panel rendering/layout behavior
- Non-varChanged trigger message wording redesign

## Acceptance Criteria

### Tests That Must Pass

1. `fired` var-changed trigger messages contain exactly one sentence terminator and no duplicate punctuation.
2. `truncated` var-changed trigger messages contain exactly one sentence terminator and no duplicate punctuation.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Trigger message envelope remains deterministic and independent from variable-change internals.
2. Runner event-log translation remains game-agnostic and visual-config-driven.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — add full-string assertions for `fired`/`truncated` `varChanged` messages (per-player and zone scope), validating punctuation and scope labels.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
