# EVTLOG-008: Complete Zone-Scoped Variable Context in Trigger Projection and Event Log Text

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner model/log projection and tests
**Deps**: none

## Problem

Runner trace translation now supports zone-scoped resource-transfer endpoints, but zone-scoped variable context is still incomplete in trigger projection and var-change text. This creates inconsistent zone attribution/highlighting and weakens log readability.

## Assumption Reassessment (2026-02-25)

1. `projectEffectTraceEntry` now captures zone IDs for zone-scoped `varChange` and `resourceTransfer`.
2. `projectTriggerEvent` handles `varChanged` only for `scope === 'perPlayer'`; `scope === 'zone'` currently projects no zone IDs.
3. `translateEffectTrace` var-change message formatting currently prefixes only player scope; zone-scoped var changes do not include zone labels.
4. **Discrepancy**: trigger `varChanged` text formatting (`formatTriggerEvent`) also drops zone scope context, so fixing projection alone still leaves zone-scoped trigger logs under-specified.

## Architecture Check

1. Scope-complete projection keeps event-log metadata consistent across effect and trigger channels.
2. The change is purely generic scope handling (`global`/`perPlayer`/`zone`) and uses visual-config labels for presentation, preserving game-agnostic runtime boundaries.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Extend trigger projection for zone-scoped varChanged

Update trigger projection so `varChanged` with `scope: 'zone'` includes zone IDs in `TriggerEventProjection`.

### 2. Improve varChange/varChanged message formatting for zone scope

Update message formatting to include zone label when scope is zone for both:

- effect trace `varChange` entries
- trigger `varChanged` events

Example target wording: `Alpha Zone: Support changed ...`.

### 3. Add regression tests for zone-scoped projection + formatting

Add tests for both trigger projection and translated message output to prevent future scope drift.

## Files to Touch

- `packages/runner/src/model/trace-projection.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/trace-projection.test.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine/kernel trigger emission semantics
- Animation pipeline changes outside model projection/log text
- Visual layout changes

## Acceptance Criteria

### Tests That Must Pass

1. Trigger projection test asserts `varChanged` with `scope: 'zone'` returns expected `zoneIds`.
2. Translation test asserts zone-scoped effect `varChange` messages include zone labels.
3. Translation test asserts zone-scoped trigger `varChanged` messages include zone labels.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Runner event log remains a presentation layer over generic runtime traces.
2. Zone/player scope handling is consistent across projection and message formatting.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/trace-projection.test.ts` — add zone-scoped `varChanged` trigger projection case.
2. `packages/runner/test/model/translate-effect-trace.test.ts` — add zone-scoped effect `varChange` and trigger `varChanged` label formatting cases.

### Commands

1. `pnpm -F @ludoforge/runner test -- trace-projection translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completed on**: 2026-02-25
- **What changed**:
  - Added zone-scoped trigger projection for `varChanged` so projected trigger entries now include `zoneIds`.
  - Added shared scoped-variable message rendering used by both effect `varChange` and trigger `varChanged` translation paths.
  - Added zone-aware message prefixing for effect and trigger variable-change text (`<Zone Label>: ...`), with consistent per-player/global/zone scope handling.
  - Added regression tests covering zone-scoped trigger projection and zone-scoped effect/trigger text formatting.
- **Deviations from original plan**:
  - Expanded translation scope to include trigger `varChanged` text (not only effect `varChange`) to keep scope semantics consistent across event-log channels.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- trace-projection translate-effect-trace` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
