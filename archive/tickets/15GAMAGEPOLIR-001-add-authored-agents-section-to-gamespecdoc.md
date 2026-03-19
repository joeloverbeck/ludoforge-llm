# 15GAMAGEPOLIR-001: Add Authored `agents` Section to `GameSpecDoc`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL authoring schema, parser section registration, and validation surface only
**Deps**: specs/15-gamespec-agent-policy-ir.md, specs/14-evolution-pipeline.md

## Problem

`GameSpecDoc` cannot currently author first-class policy data. Until the authoring surface exists as a bounded typed section, every later compiler/runtime task would be forced to invent ad hoc shapes or leak game-specific policy logic outside authored game data.

## Assumption Reassessment (2026-03-19)

1. The current repo has an explicit top-level section pipeline: `GameSpecDoc`, `parseGameSpec()`, `section-identifier.ts`, and `yaml-linter.ts` each maintain canonical section allowlists. There is no authored `agents` section in any of those surfaces today.
2. The current validator is split across targeted modules plus `validate-spec-core.ts`; shape validation for `agents` should therefore be introduced as a dedicated validation surface and invoked from the core validator, rather than hidden inside compiler lowering.
3. The current compiler does not yet expose any `GameDef.agents` runtime IR. Corrected scope: this ticket should only add the authored model, parser recognition, and structural validation. It must not lower policies into runtime IR or implement evaluation behavior.
4. The current test architecture is a mix of direct unit tests plus existing parser/compiler golden fixtures. This ticket should add focused unit coverage first and use fixtures only where they prove parser/compiler entrypoint behavior better than inline docs.

## Architecture Check

1. Adding a dedicated `agents` authoring section is cleaner than smuggling policy knobs into `metadata`, scenarios, or runtime-only agent config because it keeps the mutation surface explicit, typed, and isolated.
2. A dedicated `validate-agents` boundary is more robust than letting generic compiler code discover malformed shapes later. It keeps authoring errors local, keeps the compiler agnostic, and leaves room for later lowering without reworking diagnostics ownership.
3. This preserves the agnostic-engine boundary by keeping game-specific policy declarations inside `GameSpecDoc` instead of runtime code branches.
4. No backwards-compatibility alias path should be added for older ad hoc bot configuration names or alternative top-level keys.

## What to Change

### 1. Extend the public `GameSpecDoc` authoring types

Add the new top-level `agents` section and the Spec 15 authoring types for:

- parameter definitions
- library collections
- flat profile definitions
- seat-to-profile bindings
- policy-expression authoring nodes

### 2. Register `agents` as a canonical top-level section

Update the parser-facing section registry so authored `agents` content is treated as a first-class `GameSpecDoc` section:

- `GameSpecDoc` empty-doc shape includes `agents: null`
- parser merge logic accepts `agents` as a singleton section
- section-identification and YAML top-level allowlists recognize `agents`
- source-map anchoring works for authored `agents` paths

### 3. Add structural validation for the new section

Validate shape-level rules that do not require full lowering yet:

- collections are maps keyed by ids
- profiles contain only `params` and ordered `use` lists
- bindings are `seatId -> profileId`
- inline anonymous logic inside profiles is rejected at the authoring-validation boundary

### 4. Add focused parser/validator coverage for valid and invalid authored shapes

Add the minimum test coverage that proves:

- the parser accepts and anchors a valid `agents` block
- the validator rejects malformed authored shapes with explicit diagnostics
- the compile entrypoint still accepts specs where `agents` is absent
- a compile-ready spec with a valid `agents` block still compiles without introducing `GameDef.agents` yet

## File List

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/parser.ts` (modify)
- `packages/engine/src/cnl/section-identifier.ts` (modify)
- `packages/engine/src/cnl/yaml-linter.ts` (modify)
- `packages/engine/src/cnl/validate-spec-core.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (new)
- `packages/engine/test/unit/game-spec-doc.test.ts` (modify)
- `packages/engine/test/unit/parser.test.ts` (modify)
- `packages/engine/test/unit/section-identifier.test.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (new)
- `packages/engine/test/fixtures/cnl/compiler/compile-agents-authoring-valid.md` (optional; add only if needed for parser/compiler entrypoint coverage)
- `packages/engine/test/fixtures/cnl/compiler/compile-agents-authoring-invalid.md` (optional; add only if needed for parser/compiler entrypoint coverage)

## Out of Scope

- lowering `agents` into `GameDef.agents`
- adding `agents` to `GameDef`
- expression type-checking or dependency analysis
- policy runtime, preview, traces, runner, or CLI changes
- authored FITL or Texas Hold'em policy content

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves a minimal valid `agents` section reaches validation and compilation without introducing `GameDef.agents`.
2. `packages/engine/test/unit/parser.test.ts` and `packages/engine/test/unit/section-identifier.test.ts` prove `agents` is a registered canonical section with stable source-map anchoring and section resolution.
3. `packages/engine/test/unit/compile-agents-authoring.test.ts` rejects malformed collection shapes, inline anonymous profile logic, and non-map bindings with explicit diagnostics.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `GameSpecDoc` remains the only place where game-specific authored policy data is introduced.
2. No runtime-only containers or executable policy behavior are added to authoring types.
3. Existing non-agent game specs continue compiling unchanged when `agents` is absent.
4. Valid authored `agents` content is preserved at the authoring boundary only; it does not leak partial runtime IR into `GameDef`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/game-spec-doc.test.ts` — empty-doc shape includes `agents: null`.
2. `packages/engine/test/unit/parser.test.ts` — parser section registration and source-map anchoring for `agents`.
3. `packages/engine/test/unit/section-identifier.test.ts` — canonical section resolution for `agents`.
4. `packages/engine/test/unit/compile-agents-authoring.test.ts` — authoring-shape acceptance and rejection coverage.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`

## Outcome

- **Completion date**: 2026-03-19
- **What actually changed**: Added a first-class authored `agents` section to `GameSpecDoc`; registered it in parser section resolution and YAML top-level hardening; added a dedicated `validate-agents` structural validator; ensured the compile path also rejects malformed authored `agents` data instead of silently ignoring it; added focused unit coverage for doc defaults, parser anchoring, section resolution, compile acceptance, malformed-shape rejection, and updated the parser golden doc shape.
- **Deviations from original plan**: The original ticket underestimated the parser-facing work and overfit the change to validator-only files. The final implementation also touched `parser.ts`, `section-identifier.ts`, and `yaml-linter.ts`. It did not add new markdown compiler fixtures because the existing direct unit coverage plus the updated parser golden covered the boundary more cleanly.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/game-spec-doc.test.js packages/engine/dist/test/unit/parser.test.js packages/engine/dist/test/unit/section-identifier.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
