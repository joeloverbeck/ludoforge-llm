# 15GAMAGEPOLIR-002: Lower Agent Parameters, Profiles, and Seat Bindings

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL lowering for non-expression policy structures
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-001-add-authored-agents-section-to-gamespecdoc.md

## Problem

After the authored section exists, the compiler still needs a deterministic lowering path for parameter definitions, flat profiles, and seat bindings. Without that, later expression and runtime work has no normalized profile catalog to target.

## Assumption Reassessment (2026-03-19)

1. The compiler entrypoints already centralize GameSpec lowering in `compiler-core.ts`, so agent lowering should plug into that flow instead of creating a side compiler.
2. Spec 15 treats parameters, profiles, and bindings as explicit bounded data; they should be lowered before deeper expression semantics.
3. Corrected scope: this ticket should compile the non-expression catalog skeleton, but not yet type-check library expressions or execute policies.

## Architecture Check

1. Lowering profiles and bindings separately from expression semantics keeps compile failures narrow and easier to review.
2. The binding map stays seat-based and authored, which preserves the generic runtime boundary.
3. No fallback to player-index-based binding or string parsing should be introduced here.

## What to Change

### 1. Add compiler support for parameter definitions

Lower authored parameter definitions into normalized parameter records, including:

- required/default semantics
- allowed enum/id-order metadata
- finite bounds for tunable numeric parameters

### 2. Lower flat profiles

Compile profile records into normalized data containing:

- resolved parameter overrides
- ordered library item ids by category
- duplicate-entry rejection for pruning rules, score terms, and tie-breakers

### 3. Lower authored seat bindings

Add the initial bindings lowering pass and diagnostics for:

- unknown profile ids
- duplicate seat keys
- incomplete profile references

Binding validation against resolved canonical seats is deferred to the seat-resolution prerequisite ticket.

## File List

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (new)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/cnl/compile-agents.test.ts` (new)

## Out of Scope

- policy expression type-checking
- feature/aggregate dependency graphs
- preview-safety or visibility classification
- runtime `GameDef.agents` schemas and serialization
- `PolicyAgent` execution

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/cnl/compile-agents.test.ts` lowers valid parameter definitions, profile parameter overrides, and seat bindings into a deterministic catalog skeleton.
2. `packages/engine/test/unit/cnl/compile-agents.test.ts` rejects out-of-bounds parameter overrides, invalid enum/id-order values, unknown profile references, and duplicate profile list entries.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Profiles remain flat assemblies of named library ids plus parameter values; no inline authored logic is introduced.
2. Seat bindings remain authored as `seatId -> profileId`, not player-index contracts.
3. Parameter constraints remain explicit and bounded for future evolution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents.test.ts` — parameter/profile/binding lowering and validation.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
