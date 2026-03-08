# FITLEVENTARCH-005: Event Target Contract Parity Across Runtime and Exported JSON Schema

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — event-target schema modeling and artifact parity
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, packages/engine/schemas/GameDef.schema.json

## Problem

Runtime/Zod validation enforces `application: each` requires non-empty `targets[].effects`, but generated `GameDef.schema.json` does not currently encode that conditional. External schema consumers can accept canonical event targets that runtime rejects.

## Assumption Reassessment (2026-03-08)

1. Confirmed: `EventCardTargetSchema` uses `superRefine` to enforce `application === "each" -> effects required`.
2. Confirmed: generated `GameDef.schema.json` includes `application` and optional `effects`, but no `if/then` or union branch that requires `effects` for `application: "each"`.
3. Confirmed: tests currently cover valid/invalid event deck payload structure and artifact sync, but do not assert exported JSON schema rejection for `application: "each"` without `effects`.
4. Discrepancy from original scope: relying on post-generation patching in artifact code would duplicate contract semantics and increase drift risk.

## Architecture Decision

1. Model event-target invariants structurally in Zod (discriminated union by `application`) instead of relying on `superRefine` for this rule.
2. Keep one canonical contract source so runtime parse behavior and exported JSON schema remain aligned automatically.
3. Avoid ad-hoc schema artifact mutation for this rule.
4. No backwards compatibility/aliasing: canonical strict contract is the source of truth.

## What to Change

### 1. Reshape event target contract for structural parity

Refactor `EventCardTargetSchema` into a shared base + discriminated union:
- `application: "each"` branch requires `effects` with `minItems: 1`
- `application: "aggregate"` branch keeps `effects` optional (`minItems: 1` when present)

### 2. Add explicit runtime and exported-schema parity tests

Add tests that assert both runtime Zod and exported `GameDef.schema.json` reject event targets with `application: "each"` and missing `effects`.

### 3. Regenerate and verify schema artifacts deterministically

Regenerate `GameDef.schema.json` via standard artifact workflow and ensure sync checks pass.

## Files to Touch

- `packages/engine/src/kernel/schemas-extensions.ts`
- `packages/engine/test/unit/schemas-top-level.test.ts`
- `packages/engine/test/unit/json-schema.test.ts`
- `packages/engine/schemas/GameDef.schema.json` (via artifact generation)

## Out of Scope

- Event execution/runtime behavior changes beyond schema contract modeling
- FITL card content migrations
- Runner validation UX changes
- Separate cardinality relation rule (`min <= max`) JSON-schema parity (draft-7 cannot express this cross-field relation without non-standard extensions)

## Acceptance Criteria

### Tests That Must Pass

1. Runtime schema rejects event targets with `application: each` and missing `effects`.
2. Generated `GameDef.schema.json` rejects the same invalid payload through AJV validation.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime and exported schema contracts remain aligned for event-target `application` semantics.
2. Contract remains generic and game-agnostic.
3. Artifact generation remains deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` — add negative parse case for `application: each` without effects.
2. `packages/engine/test/unit/json-schema.test.ts` — add AJV rejection case for exported `GameDef.schema.json` with `application: each` and missing effects.
3. `packages/engine/test/unit/schema-artifacts-sync.test.ts` — unchanged unless deterministic sync assertions need extension.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/schemas-top-level.test.js`
4. `node --test packages/engine/dist/test/unit/json-schema.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm -F @ludoforge/engine typecheck`

## Outcome

1. Implemented as planned with one architectural tightening: `EventCardTargetSchema` now uses a discriminated union on `application` (instead of `superRefine`) so the invariant is structural.
2. Added both runtime and exported-schema regression coverage for `application: each` without `effects`.
3. Regenerated `GameDef.schema.json` from updated `dist` contracts; exported schema now encodes branch-level `effects` requirement for `application: each`.
4. Full engine quality gates passed: test, lint, and typecheck.
