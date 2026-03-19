# 15GAMAGEPOLIR-002: Lower Agent Parameters, Profiles, and Seat Bindings

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL lowering plus minimal runtime catalog typing/schema for non-expression policy structures
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-001-add-authored-agents-section-to-gamespecdoc.md

## Problem

`GameSpecDoc.agents` currently parses and validates as an authored surface, but compilation still drops it on the floor. The compiler accepts structurally valid parameters/profiles/bindings today and produces no runtime catalog, which leaves later policy-expression and runtime work without a normalized target.

## Assumption Reassessment (2026-03-19)

1. `GameSpecDoc.agents` types already exist in `packages/engine/src/cnl/game-spec-doc.ts`, and structural validation already runs through `packages/engine/src/cnl/validate-agents.ts` from `compiler-core.ts`.
2. The current authored-agents baseline test is `packages/engine/test/unit/compile-agents-authoring.test.ts`, not `packages/engine/test/unit/cnl/compile-agents.test.ts`.
3. `GameDef` currently has no `agents` field, and `GameDefSchema` is strict. If this ticket lowers a real catalog into `GameDef`, it must also add the minimal kernel type/schema shape needed to carry that catalog.
4. Spec 15 still treats parameters, flat profiles, and seat bindings as bounded data that should be normalized before expression type-checking, visibility analysis, and runtime execution.

## Architecture Check

1. Lowering the bounded catalog now is more robust than keeping `agents` as validator-only dead data; later tickets can extend one runtime contract instead of replacing a temporary compiler-only side path.
2. The compiled shape for this ticket should stay minimal and generic: parameter definitions, profile parameter values, ordered library-id references, and authored seat bindings only.
3. The binding map stays seat-based and authored, which preserves the generic runtime boundary.
4. No fallback to player-index-based binding, string parsing, or game-specific runtime branches should be introduced here.

## What to Change

### 1. Add compiler support for parameter definitions

Lower authored parameter definitions into normalized runtime records, including:

- required/default semantics
- allowed enum/id-order metadata
- finite bounds for tunable numeric parameters
- required/default resolution metadata

### 2. Lower flat profiles

Compile profile records into normalized data containing:

- resolved parameter overrides
- ordered library item ids by category
- duplicate-entry rejection for pruning rules, score terms, and tie-breakers
- rejection of missing required parameters and unknown parameter ids

### 3. Lower authored seat bindings

Add the initial bindings lowering pass and diagnostics for:

- unknown profile ids
- invalid/empty seat ids
- invalid/empty profile ids

Binding validation against resolved canonical seats is deferred to the seat-resolution prerequisite ticket.

### 4. Carry the lowered catalog through `GameDef`

Add the minimal `GameDef.agents` catalog shape required for this ticket's output and strict schema validation.

This ticket does not own fingerprints, dependency-ordered compiled expressions, visibility metadata, or final runtime evaluator structures. It does own the minimal generic JSON-serializable skeleton needed so compiled data is not discarded.

## File List

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (new)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify if needed)

## Out of Scope

- policy expression type-checking
- feature/aggregate dependency graphs
- preview-safety or visibility classification
- policy fingerprints and compiled expression/runtime dependency graphs
- `PolicyAgent` execution

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` lowers valid parameter definitions, profile parameter overrides, ordered library id selections, and seat bindings into a deterministic `GameDef.agents` skeleton.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` rejects out-of-bounds parameter overrides, invalid enum/id-order values, unknown parameter/profile references, missing required parameters, and duplicate profile list entries.
3. `packages/engine/test/unit/schemas-top-level.test.ts` proves the new minimal `GameDef.agents` shape passes strict `GameDefSchema` validation.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Profiles remain flat assemblies of named library ids plus parameter values; no inline authored logic is introduced.
2. Seat bindings remain authored as `seatId -> profileId`, not player-index contracts.
3. Parameter constraints remain explicit and bounded for future evolution.
4. Compiled agent data is JSON-serializable and travels through the same `GameDef` boundary as the rest of the compiler output.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — parameter/profile/binding lowering and validation.
2. `packages/engine/test/unit/schemas-top-level.test.ts` — strict `GameDefSchema` coverage for the minimal compiled agents catalog.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - added `compile-agents.ts` and integrated it into `compiler-core.ts`
  - lowered authored parameter definitions, flat profiles, and seat bindings into a minimal JSON-serializable `GameDef.agents` catalog
  - added minimal runtime typing/schema support for `GameDef.agents`
  - strengthened unit coverage for valid lowering, invalid parameter defaults/overrides, missing required parameters, duplicate profile list entries, unknown library ids, and unknown binding profiles
  - updated structured compiler section contract coverage and regenerated `GameDef.schema.json`
- Deviations from original plan:
  - the ticket originally treated runtime `GameDef` schema work as out of scope, but the existing strict `GameDefSchema` made a minimal type/schema change necessary to carry the lowered catalog through the real compile boundary
  - instead of adding `packages/engine/test/unit/cnl/compile-agents.test.ts`, the implementation extended the existing `packages/engine/test/unit/compile-agents-authoring.test.ts` baseline and added schema coverage where the strict boundary is enforced
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js`
  - `node --test packages/engine/dist/test/unit/schemas-top-level.test.js`
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js packages/engine/dist/test/integration/compiler-structured-results-production.test.js`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
