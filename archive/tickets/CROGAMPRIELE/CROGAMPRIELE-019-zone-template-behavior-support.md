# CROGAMPRIELE-019: Add behavior field to zone templates

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cnl game-spec-doc types, zone template expansion
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-007-zone-behaviors-deck-semantics.md`

## Problem

`GameSpecZoneTemplateDef` (the `perSeat` zone template pattern) does not support the `behavior` field. Zone templates expand into `GameSpecZoneDef` entries in `expand-zone-templates.ts`, but the expansion (lines 104-117) copies only `owner`, `visibility`, `ordering`, `zoneKind`, `isInternal`, `category`, and `attributes` — not `behavior`. This means per-player decks (common in deckbuilder games) cannot use the zone template pattern and must be declared individually.

Since `behavior` was added to `GameSpecZoneDef` in CROGAMPRIELE-007, the template type should mirror this for parity. The expansion code already follows a consistent conditional-spread pattern for optional fields, so adding `behavior` is mechanical.

## Assumption Reassessment (2026-03-02)

1. `GameSpecZoneTemplateDef` is at `game-spec-doc.ts:73-85`. Confirmed: no `behavior` field.
2. `GameSpecZoneDef` has `behavior?` at `game-spec-doc.ts:66-70`. Confirmed: added by CROGAMPRIELE-007.
3. `expand-zone-templates.ts` expansion loop is at lines 103-119. Confirmed: constructs a `GameSpecZoneDef` object with conditional spreads for optional fields.
4. `compileBehavior` in `compile-zones.ts` already handles `behavior` on `GameSpecZoneDef` — no additional compiler changes needed. The expanded zones will flow through `materializeZoneDefs` normally.

## Architecture Check

1. This is a purely additive change — adding an optional field to a template type and propagating it during expansion. No existing templates break.
2. Zone templates are a `GameSpecDoc`-level construct. `behavior` on templates is resolved during expansion (before compilation), so the kernel and runtime remain agnostic.
3. No backwards-compatibility concern — `behavior` is optional on both the template and the expanded zone.

## What to Change

### 1. Add `behavior` to `GameSpecZoneTemplateDef.template` (`game-spec-doc.ts`)

Add the same `behavior?` field that exists on `GameSpecZoneDef`:

```typescript
readonly behavior?: {
  readonly type: string;
  readonly drawFrom?: string;
  readonly reshuffleFrom?: string;
};
```

### 2. Propagate `behavior` in the expansion loop (`expand-zone-templates.ts:104-117`)

Add a conditional spread for `behavior` alongside the existing optional fields:

```typescript
...(tmpl.behavior !== undefined ? { behavior: tmpl.behavior } : {}),
```

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add `behavior?` to `GameSpecZoneTemplateDef.template`)
- `packages/engine/src/cnl/expand-zone-templates.ts` (modify — propagate `behavior` in expansion loop)
- `packages/engine/test/unit/expand-zone-templates.test.ts` (modify — add test for behavior propagation)

### 3. Substitute `{seat}` in `behavior.reshuffleFrom` during expansion (`expand-zone-templates.ts`)

When propagating `behavior`, apply `{seat}` substitution to `reshuffleFrom` (if present) so per-player deck+discard combos work end-to-end. `drawFrom` is a draw direction (`'top'`/`'bottom'`), not a zone reference, so no substitution needed there.

## Out of Scope

- Compiler validation changes (already handled by `compileBehavior` in `compile-zones.ts`)
- Cross-validation changes (already handled for `reshuffleFrom` in `cross-validate.ts`)
- New behavior types beyond `'deck'`

## Acceptance Criteria

### Tests That Must Pass

1. Zone template with `behavior: { type: 'deck', drawFrom: 'top' }` expands to `GameSpecZoneDef` entries that each carry the `behavior` field.
2. Zone template without `behavior` expands identically to current behavior (no regression).
3. Expanded zones with `behavior` compile successfully through `materializeZoneDefs`.
4. Existing suite: `pnpm turbo test`

### Invariants

1. `behavior` is optional on templates — all existing templates continue to work.
2. Expansion is purely mechanical field propagation — no template-level behavior validation (that's the compiler's job).
3. Kernel and runtime remain agnostic to zone templates.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-zone-templates.test.ts` (modify) — add test that a template with `behavior` expands it to all seat instances. Rationale: confirms the new field is propagated during expansion.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-zone-templates.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

**Scope expanded** vs original plan: added `{seat}` substitution in `behavior.reshuffleFrom` during expansion (originally marked out of scope). This makes per-player deck+discard combos work end-to-end through templates.

**Files changed**:
- `packages/engine/src/cnl/game-spec-doc.ts` — extracted `GameSpecZoneBehavior` interface (DRY), used by both `GameSpecZoneDef` and `GameSpecZoneTemplateDef`
- `packages/engine/src/cnl/expand-zone-templates.ts` — propagate `behavior` in expansion loop with `{seat}` substitution in `reshuffleFrom`
- `packages/engine/test/unit/expand-zone-templates.test.ts` — 4 new tests (behavior propagation, reshuffleFrom substitution, literal reshuffleFrom, behavior-absent regression)

**Verification**: 3407 engine tests pass, typecheck clean, lint clean.
