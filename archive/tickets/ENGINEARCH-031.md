# ENGINEARCH-031: Complete discriminated scope contracts for setVar/addVar and varChange traces

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — AST/core types, zod schemas, trace contracts, validation tests
**Deps**: none

## Problem

`transferVar` and `resourceTransfer` now use discriminated endpoint contracts, but adjacent scope-shaped payloads still use permissive optional fields:
- AST `setVar`/`addVar` (`player?`/`zone?` regardless of `scope`)
- trace `varChange` (`player?`/`zone?` regardless of `scope`)

This leaves invalid states representable and creates uneven contract rigor across equivalent scope models.

## Assumption Reassessment (2026-02-25)

1. `types-ast.ts` and `schemas-ast.ts` still model `setVar`/`addVar` as broad shapes with optional scope-specific fields.
2. `types-core.ts` and `schemas-core.ts` still model `EffectTraceVarChange` with optional `player`/`zone` independent of scope.
3. `var-change-trace.ts` already uses discriminated helper input types internally, but the exported/public AST and core trace contracts remain permissive.
4. **Mismatch + correction**: previous strictness work landed for transfer endpoints (`transferVar`/`resourceTransfer`) but not for neighboring variable effects and var-change trace entries; this ticket closes that gap for architectural consistency.

## Architecture Check

1. Unifying all scope-shaped contracts under discriminated unions is cleaner and more extensible than mixing strict and permissive patterns for similar concepts.
2. Existing runtime code already branches by scope for `setVar`/`addVar` and var-change emission, so tightening contracts primarily removes invalid representable states rather than introducing new conceptual complexity.
3. This remains engine-agnostic contract hardening; no game-specific rules, `GameSpecDoc` data semantics, or `visual-config.yaml` concerns enter runtime/core types.
4. No backwards-compatibility aliasing/shims: permissive cross-scope field combinations become invalid by contract.

## What to Change

### 1. Harden AST scope contracts for variable effects

Introduce canonical discriminated endpoint/value contracts for:
- `setVar` scopes: `global`, `pvar`, `zoneVar`
- `addVar` scopes: `global`, `pvar`, `zoneVar`

Require only valid fields per scope and forbid invalid ones structurally in both TS and Zod.

### 2. Harden trace scope contracts for varChange

Replace permissive `EffectTraceVarChange` shape with discriminated scope branches:
- `global` branch: no `player`/`zone`
- `perPlayer` branch: required `player`
- `zone` branch: required `zone`

Mirror this in `schemas-core.ts` and schema artifacts.

### 3. Align validator/tests with strict contracts

Update/extend tests so structural scope-field invalid combinations are rejected at schema/type boundaries, while behavior validators continue handling semantic concerns.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifacts)
- `packages/engine/schemas/Trace.schema.json` (modify via artifacts)

## Out of Scope

- Transfer endpoint matrix expansion (`ENGINEARCH-029`)
- Runner endpoint rendering strictness (`EVTLOG-012`)
- Any game-specific `GameSpecDoc` or `visual-config.yaml` content changes

## Acceptance Criteria

### Tests That Must Pass

1. AST schema rejects `setVar`/`addVar` payloads with invalid scope-field combinations.
2. Trace schema rejects `varChange` payloads with invalid scope-field combinations.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scope-specific required/forbidden fields are unrepresentable in AST/core schema/type contracts for variable effects and traces.
2. Contract strictness remains uniform across related scope-based effect and trace models.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — negative matrix for `setVar`/`addVar` scope-field combinations.
2. `packages/engine/test/unit/json-schema.test.ts` — negative matrix for `varChange` trace endpoint shape by scope.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts test/unit/json-schema.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **Actually changed**:
  - Hardened `setVar`/`addVar` in `types-ast.ts` and `schemas-ast.ts` to discriminated scope contracts.
  - Hardened `EffectTraceVarChange` in `types-core.ts` and `schemas-core.ts` to discriminated scope contracts.
  - Regenerated schema artifacts (`GameDef.schema.json`, `Trace.schema.json`, `EvalReport.schema.json`).
  - Added explicit scope-field matrix tests for `setVar`/`addVar` and `varChange` shape drift.
  - Updated runtime/validator callsites for new narrowing (`effects-var.ts`, `var-change-trace.ts`, and `validate-gamedef-behavior.ts`).
- **Deviation vs original plan**:
  - Added explicit `zoneVar` zone-reference validation in `validate-gamedef-behavior.ts` for `setVar`/`addVar` while adapting to discriminated payloads; this was a direct consistency hardening uncovered by the contract change.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine schema:artifacts` ✅
  - `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts test/unit/json-schema.test.ts` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (278 passing)
  - `pnpm -F @ludoforge/engine lint` ✅
