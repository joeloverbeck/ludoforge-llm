# 164CONTPREVDEP-001: Foundation #10 amendment and cap-class registry

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/cnl/compile-agents.ts` (new exported constant)
**Deps**: `archive/specs/164-continued-inner-preview-deepening.md`

## Problem

Spec 164 introduces named cap classes (`standard256`, `deep1024`) as the formal vocabulary for declared inner-preview bounds. Foundation #10 currently states the bounded-computation principle in the abstract; it does not yet acknowledge that bounded-computation surfaces may publish a tier of named cap classes. Subsequent tickets (002–004) need a single source of truth for cap-class budgets and a Foundation principle that justifies recording the chosen class in compiled artifacts and reproducibility metadata.

This ticket is Phase 0 of the spec (§4 amendment + §7.5 cap-class registry).

## Assumption Reassessment (2026-05-09)

1. Foundation #10 currently spans `docs/FOUNDATIONS.md:63-67` (verified). The amendment text in spec §4 fits as a single appended sentence and an Appendix line.
2. `INNER_PREVIEW_HARD_CAP = 256` is exported from `packages/engine/src/cnl/compile-agents.ts:95`. The cap-class registry will live alongside it without removing the existing constant — `standard256`'s budget IS `INNER_PREVIEW_HARD_CAP` (256).
3. The Appendix in `docs/FOUNDATIONS.md:141-151` already records prior amendments (Spec 140, 144, 162). The Spec 164 line follows the same pattern.

## Architecture Check

1. **Naming explicitness, not new bounds**: This amendment formalizes that bounded surfaces may declare a named cap class, but the bound-strictness invariant of Foundation #10 is preserved verbatim. No new bounded-computation surface is introduced; `INNER_PREVIEW_HARD_CAP` continues to enforce the `standard256` budget.
2. **Engine agnosticism (F#1)**: The cap-class registry is a generic mechanism (a record of class → budget) with no game-specific identifiers. Any future amendment to the registry is reusable across all profiles regardless of game.
3. **No backwards-compatibility shim (F#14)**: The existing `INNER_PREVIEW_HARD_CAP` remains the single named constant for the `standard256` budget; the registry references it explicitly. No alias paths or fallback values.

## What to Change

### 1. Amend Foundation #10

In `docs/FOUNDATIONS.md`, append one sentence to the existing principle text (after line 67) and append one line to the Appendix (after line 151).

Amendment sentence (per spec §4):

> When a bounded computation surface offers a tier of cap classes (e.g., `standard256`, `deep1024`), the chosen class MUST be statically named in the compiled artifact and recorded in reproducibility metadata, so that profile-quality witnesses and replay artifacts can assert which class was active.

Appendix line:

> Spec 164 amended Foundation #10 to formalize cap-class naming for bounded-computation tiers.

### 2. Export `CAP_CLASS_BUDGETS` from `compile-agents.ts`

Add a new exported constant alongside `INNER_PREVIEW_HARD_CAP`:

```ts
export type CapClass = 'standard256' | 'deep1024';

export const CAP_CLASS_BUDGETS: Record<CapClass, number> = {
  standard256: INNER_PREVIEW_HARD_CAP,  // 256
  deep1024: 1024,
};
```

The constant is the single source of truth for cap-class budgets. Subsequent tickets consume it; no other module duplicates these numbers.

### 3. Architectural-invariant test for the registry

Add a test asserting:
- `CAP_CLASS_BUDGETS.standard256 === INNER_PREVIEW_HARD_CAP` (the relationship is explicit, not parallel).
- `CAP_CLASS_BUDGETS.deep1024 === 1024`.
- The registry has exactly two keys (`standard256`, `deep1024`) — guards against silent additions; future cap-class tiers must update this test together with the registry.

## Files to Touch

- `docs/FOUNDATIONS.md` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/architecture/preview-deepening/cap-class-registry.test.ts` (new)

## Out of Scope

- Lowering `strategy` or `capClass` from YAML (Ticket 002).
- Validating per-phase cost (Ticket 002).
- Recording `capClass` in compiled-artifact output (Ticket 002).
- Strategy dispatch (Ticket 003).
- Deep driver (Ticket 004).
- Cookbook, benchmark report, and fixture profile work (Ticket 005).

## Implementation Outcome

Completed on 2026-05-09.

Outcome amended: 2026-05-10 — Updated archived sibling/spec references after `164CONTPREVDEP-005` and Spec 164 were archived.

What landed:

- `docs/FOUNDATIONS.md` appends the Spec 164 cap-class sentence to Foundation #10 and records the Appendix amendment line.
- `packages/engine/src/cnl/compile-agents.ts` exports `CapClass` and `CAP_CLASS_BUDGETS` beside `INNER_PREVIEW_HARD_CAP`; `standard256` references `INNER_PREVIEW_HARD_CAP` directly and `deep1024` is the opt-in tier.
- `packages/engine/test/architecture/preview-deepening/cap-class-registry.test.ts` asserts the registry values and closed key set.

Touched-file scope:

- Ticket-named files touched: all three (`docs/FOUNDATIONS.md`, `compile-agents.ts`, new cap-class registry test).
- Additional same-series draft context: `archive/tickets/164CONTPREVDEP-005.md` appeared during implementation as a concurrent/untracked sibling draft; it is read-only context for this ticket and now records the completed Phase 4 work.

Generated fallout:

- None. This ticket does not change schemas, compiled JSON fixtures, goldens, or runtime serialized trace shape.

Deferred sibling/spec scope:

- Ticket 002 owns YAML lowering, compiled-artifact `capClass` output, cost validation, diagnostics, and compiled-JSON fixture regeneration.
- Ticket 003 owns strategy dispatch.
- Ticket 004 owns the deep-pass driver, trigger evaluation, coverage/advisory runtime fields, and ARVN witness.
- Archived Ticket 005 records the completed cookbook, benchmark report, and e2e fixture work.

Source-size ledger:

- `packages/engine/src/cnl/compile-agents.ts` was already over the repo guidance before this ticket. This ticket adds a tiny adjacent registry beside the existing hard-cap constant so the `standard256` relationship remains explicit; extracting the registry would obscure the ticket seam. No separate extraction successor is justified by this additive constant.

Verification results:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/architecture/preview-deepening/cap-class-registry.test.js` — passed (3 tests).
- `pnpm -F @ludoforge/engine test` — passed; schema artifacts checked and default lane reported 65/65 files passed.
- `pnpm turbo build` — passed; 3/3 tasks successful.
- `pnpm turbo test` — passed; 5/5 tasks successful, runner reported 205/205 files passed and engine default reported 65/65 files passed.
- `pnpm turbo lint` — passed; 2/2 tasks successful.
- `pnpm turbo typecheck` — passed; 3/3 tasks successful.
- `pnpm run check:ticket-deps` — passed; 5 active tickets and 2291 archived tickets checked.

Late-edit proof validity:

- No-invalidation: terminal status and proof transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the green final lanes.

## Acceptance Criteria

### Tests That Must Pass

1. New `cap-class-registry.test.ts` asserts the registry shape and `standard256 === INNER_PREVIEW_HARD_CAP` relationship.
2. Existing engine suite: `pnpm -F @ludoforge/engine test`.
3. Existing typecheck/lint: `pnpm turbo typecheck && pnpm turbo lint`.

### Invariants

1. `INNER_PREVIEW_HARD_CAP` value is unchanged (256). The amendment is purely additive.
2. The cap-class registry is a closed enumeration; adding a tier must touch both the type and the test in the same change.
3. Foundation #10 amendment sentence appears verbatim in `docs/FOUNDATIONS.md` and the Appendix line is recorded.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-deepening/cap-class-registry.test.ts` — architectural-invariant; asserts registry keys, values, and the `standard256 === INNER_PREVIEW_HARD_CAP` relationship.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/preview-deepening/cap-class-registry.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
