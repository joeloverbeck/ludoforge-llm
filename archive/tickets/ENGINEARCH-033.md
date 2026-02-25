# ENGINEARCH-033: Unify scoped variable endpoint contracts across AST/schema/trace

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared contract module + type/schema callsite rewiring + trace emission alignment + tests
**Deps**: none

## Problem

Scoped variable endpoint contracts are stricter than before, but the same invariants are still re-described in multiple places across AST types/schemas, trace types/schemas, and trace-emission helper types. This duplication increases drift risk and makes future scope/field evolution brittle.

## Assumption Reassessment (2026-02-25)

1. `setVar`/`addVar`/`transferVar` AST payloads and trace `varChange`/`resourceTransfer` endpoints are all scope-discriminated, but their scope-field invariants are duplicated across multiple modules.
2. Duplication exists in both contract surfaces and nearby implementation helpers (not only schema/type definitions). In particular, `var-change-trace.ts` encodes its own scoped trace-entry shapes.
3. **Mismatch + correction**: previous scope emphasized `validate-gamedef-behavior.ts` as a primary contract owner. Validator logic should stay focused on semantic/reference validation; canonical contract ownership should be centralized in shared scoped-var contract definitions consumed by AST/core type+schema layers and trace helpers.

## Architecture Check

1. A canonical scoped-variable contract surface is cleaner and more extensible than repeating equivalent discriminated unions in multiple modules.
2. Centralization remains game-agnostic kernel contract logic; no game-specific behavior leaks into `GameDef`/runtime.
3. No backwards-compatibility aliases: callers adopt canonical contract exports directly.
4. Preferred architecture: one shared contract module defines scoped-var union building blocks for both TypeScript types and Zod schemas, and all consumers compose from it.

## What to Change

### 1. Introduce canonical scoped-var contract definitions

Create a shared kernel contract module for scoped variable endpoints/payloads that expresses:
- scope discriminants
- required/forbidden fields per scope
- AST and trace naming variants (`var` vs `varName`, `pvar` vs `perPlayer`)
- reusable type helpers and schema builders for scoped unions

### 2. Rewire AST/core schema/type surfaces to canonical contracts

Refactor callsites to consume canonical scoped-var contracts instead of redefining unions inline in:
- AST types/schemas (`transferVar`, `setVar`, `addVar`)
- trace types/schemas (`resourceTransfer` endpoint, `varChange`)
- trace helper payload typing (`var-change-trace.ts`)

Keep behavior unchanged while reducing duplication.

### 3. Strengthen anti-drift test coverage

Add or strengthen tests that fail if scoped-var contract drift appears between:
- AST schema behavior
- trace schema behavior
- validator/runtime trace emission expectations

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/var-change-trace.ts` (modify)
- `packages/engine/src/kernel/<new shared contract module>.ts` (new)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify if needed for parity assertions)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifacts if changed)
- `packages/engine/schemas/Trace.schema.json` (modify via artifacts if changed)

## Out of Scope

- Event-log runner rendering changes
- Game-specific data model changes in `GameSpecDoc` or `visual-config.yaml`
- Runtime effect semantics changes

## Acceptance Criteria

### Tests That Must Pass

1. Contract invariants for scoped var payloads/endpoints are defined once and consumed by AST/core schema/type layers and trace helper typings.
2. Existing schema/validator tests still pass and catch scope-shape drift.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped variable contracts are single-source-owned and reused, not copy-pasted across layers.
2. Any scoped-var contract drift causes failing tests in at least one consumer layer.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — retain/extend scope matrix coverage against canonical AST scoped-var contracts.
2. `packages/engine/test/unit/json-schema.test.ts` — retain/extend trace `resourceTransfer` and `varChange` scope matrix coverage against canonical trace scoped-var contracts.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — ensure semantic validation parity remains correct (no structural-schema diagnostic duplication).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts test/unit/json-schema.test.ts test/unit/validate-gamedef.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-25
- **What changed**:
  - Added canonical scoped-var contract module: `packages/engine/src/kernel/scoped-var-contract.ts`.
  - Rewired AST/core type surfaces to canonical contract helpers in `types-ast.ts` and `types-core.ts`.
  - Rewired AST/core Zod schema surfaces to canonical builder in `schemas-ast.ts` and `schemas-core.ts`.
  - Aligned `var-change-trace.ts` payload typing with canonical trace var-change contract.
  - Extended anti-drift test usage by driving endpoint scope matrices from canonical scope constants in `schemas-ast.test.ts` and `json-schema.test.ts`.
  - Updated one integration fixture to canonical scope literal (`perPlayer` -> `pvar`) in `executor-cross-faction-action.test.ts` to match no-alias contract policy.
- **Deviations from original plan**:
  - Ticket scope was corrected before implementation to include `var-change-trace.ts` as a duplicated contract owner.
  - `validate-gamedef-behavior.ts` was only lightly typed against canonical scope alias rather than structurally refactored, keeping validator focused on semantics.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine schema:artifacts` ✅
  - `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts test/unit/json-schema.test.ts test/unit/validate-gamedef.test.ts` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
