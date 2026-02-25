# ENGINEARCH-033: Unify scoped variable endpoint contracts across AST/schema/trace

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared contract module + type/schema callsite rewiring + tests
**Deps**: none

## Problem

Scoped variable endpoint contracts are now stricter, but contract definitions are still duplicated across AST payload types, Zod schemas, trace types, and validator logic. This duplication risks drift and inconsistent invariants over time.

## Assumption Reassessment (2026-02-25)

1. `setVar`/`addVar` and trace `varChange` are now discriminated by scope, but each layer defines scope-field constraints independently.
2. Validation and schema tests currently enforce behavior, but they rely on repeated local definitions rather than a canonical scoped-var contract source.
3. **Mismatch + correction**: architecture rigor improved, but DRY contract ownership is still fragmented; this ticket centralizes contract ownership.

## Architecture Check

1. A canonical scoped-variable contract surface is cleaner and more extensible than repeating equivalent unions in multiple modules.
2. Centralization remains game-agnostic and purely kernel contract logic; no game-specific behavior leaks into `GameDef`/runtime.
3. No backwards-compatibility aliases: callers adopt canonical contract types directly.

## What to Change

### 1. Introduce canonical scoped-var contract definitions

Create a shared kernel contract module for scoped variable endpoints/payloads that expresses:
- scope discriminants
- required/forbidden fields per scope
- read/write/trace variants where field naming differs (`var` vs `varName`, `pvar` vs `perPlayer` mapping when applicable)

### 2. Rewire AST/core schema/type surfaces to canonical contracts

Refactor callsites to import canonical scoped-var contracts instead of redefining unions inline in:
- AST types/schemas
- trace types/schemas
- validator helpers

Keep behavior unchanged while reducing duplication.

### 3. Strengthen anti-drift test coverage

Add tests that fail if canonical contract changes are not reflected in all consumers (schema artifacts + validator + runtime trace shape).

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/<new shared contract module>.ts` (new)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifacts)
- `packages/engine/schemas/Trace.schema.json` (modify via artifacts)

## Out of Scope

- Event-log runner rendering changes
- Game-specific data model changes in `GameSpecDoc` or `visual-config.yaml`
- Runtime effect semantics changes

## Acceptance Criteria

### Tests That Must Pass

1. Contract invariants for scoped var payloads are defined once and consumed by AST/core schema/type layers.
2. Existing schema/validator tests still pass and catch scope-shape drift.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped variable contracts are single-source-owned and reused, not copy-pasted across layers.
2. Any contract drift causes failing tests in at least one consumer layer.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — retain/extend scope matrix coverage against canonical contracts.
2. `packages/engine/test/unit/json-schema.test.ts` — retain/extend trace scope matrix coverage against canonical contracts.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — validator parity checks remain aligned with canonical scoped-var rules.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts test/unit/json-schema.test.ts test/unit/validate-gamedef.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
