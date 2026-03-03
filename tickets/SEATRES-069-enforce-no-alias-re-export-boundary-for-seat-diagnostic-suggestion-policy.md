# SEATRES-069: Enforce no-alias re-export boundary for seat diagnostic suggestion policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL lint policy guardrails
**Deps**: archive/tickets/SEATRES/SEATRES-058-extract-seat-reference-diagnostic-suggestion-policy-module.md

## Problem

Seat-reference diagnostic suggestion constants were centralized into a canonical module, but current lint enforcement does not block non-canonical re-export alias paths. A future refactor could reintroduce compatibility-style alias surfaces without failing tests.

## Assumption Reassessment (2026-03-03)

1. Canonical constants currently live in `packages/engine/src/cnl/seat-reference-diagnostic-suggestion-policy.ts`. **Verified.**
2. Existing lint guard `packages/engine/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.ts` checks literal duplication and import source correctness. **Verified.**
3. Existing guard does not assert that non-canonical CNL modules cannot re-export these symbols (named re-export or wildcard re-export). **Verified; scope correction required.**

## Architecture Check

1. Enforcing canonical ownership plus no re-export alias paths is cleaner than relying on reviewer discipline and keeps module boundaries explicit.
2. This is architecture policy only; it does not introduce game-specific behavior and preserves GameSpecDoc data ownership versus game-agnostic GameDef/runtime layers.
3. No backwards-compatibility aliasing/shims are introduced; this ticket explicitly prevents them.

## What to Change

### 1. Extend seat policy lint guard for exports

Update `cnl-seat-reference-diagnostic-suggestion-policy.test.ts` to fail if any non-canonical CNL file:
- re-exports seat suggestion symbols, or
- re-exports from the canonical module via `export *`.

### 2. Keep diagnostics policy surface single-canonical

Add focused assertions that only `seat-reference-diagnostic-suggestion-policy.ts` can export these symbols.

## Files to Touch

- `packages/engine/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.ts` (modify)

## Out of Scope

- Any changes to diagnostic wording values
- Any compiler/validator/xref behavior changes
- Any GameSpecDoc schema/runtime simulator changes

## Acceptance Criteria

### Tests That Must Pass

1. Lint policy test fails if any non-canonical CNL module re-exports seat suggestion symbols.
2. Lint policy test fails if wildcard re-export from canonical module appears in non-canonical CNL modules.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat diagnostic suggestion symbols have a single canonical export surface.
2. No alias/re-export compatibility paths exist for these symbols.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.ts` — add re-export and export-surface assertions. Rationale: enforces strict no-alias module boundary.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
