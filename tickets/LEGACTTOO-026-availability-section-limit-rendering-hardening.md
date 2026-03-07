# LEGACTTOO-026: AvailabilitySection Limit Rendering Hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-021-availability-section-multi-limit-scope-alignment.md

## Problem

`AvailabilitySection` now renders multi-limit usage, but two UI robustness gaps remain:

1. Multi-limit entries render as adjacent inline spans with no explicit separator/line break, making output hard to read.
2. Limit row keys are derived from mutable values (`used`, `max`) which can remount nodes on normal state updates.

Additionally, tests do not explicitly cover the `limitUsage: []` path at component level, and do not lock a readable multi-limit formatting contract.

## Assumption Reassessment (2026-03-07)

1. `AvailabilitySection.tsx` renders `limitUsage` items inside a single wrapper span and each item as inline span. **Confirmed in `packages/runner/src/ui/AvailabilitySection.tsx`.**
2. Current key uses `${limit.scope}-${limit.max}-${limit.used}-${index}` and therefore changes as usage updates. **Confirmed in same file.**
3. `AvailabilitySection.test.ts` covers `limitUsage` undefined and populated arrays, but not explicit empty array rendering behavior and not formatting contract for separation/readability. **Confirmed in `packages/runner/test/ui/AvailabilitySection.test.ts`.**

## Architecture Check

1. Stable identity and explicit layout semantics are cleaner than value-derived keys and incidental inline formatting, improving deterministic UI behavior.
2. This is presentation-layer hardening only; no GameSpecDoc/GameDef/runtime semantics are changed.
3. No backward-compatibility shims/aliases: we tighten current rendering behavior directly.

## What to Change

### 1. Make multi-limit rendering explicitly readable

- Render limits as a semantic list (`ul/li`) or equivalent block rows so each limit appears on its own readable line.
- Keep current scope wording contract (`this turn`, `this phase`, `total`) unless an explicit wording policy already exists elsewhere.

### 2. Replace mutable-value keys with stable keys

- Use stable keying based on structural identity (prefer deterministic `scope + index` for current shape).
- Do not key by mutable usage values.

### 3. Strengthen component tests for edge-case and formatting contract

- Add explicit `limitUsage: []` test asserting no limit rows rendered.
- Add assertion that multi-limit renders as distinct rows/items (not just text inclusion).

## Files to Touch

- `packages/runner/src/ui/AvailabilitySection.tsx` (modify)
- `packages/runner/src/ui/AvailabilitySection.module.css` (modify)
- `packages/runner/test/ui/AvailabilitySection.test.ts` (modify)

## Out of Scope

- Engine limit accounting semantics
- ActionTooltip footer format changes
- Broader UI theming/refactors

## Acceptance Criteria

### Tests That Must Pass

1. Multi-limit actions render clearly separated per-limit rows/items.
2. Incrementing/decrementing `used` does not rely on mutable-value keys.
3. `limitUsage: []` renders no limit usage rows.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Runner consumes engine `RuleState.limitUsage` contract without adding game-specific branches.
2. Limit labels remain scope-driven and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/AvailabilitySection.test.ts` — assert explicit empty-array behavior and distinct multi-limit row rendering.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
