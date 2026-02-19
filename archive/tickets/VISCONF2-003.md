# VISCONF2-003: Edge/Adjacency Styling + Canonical Edge Metadata Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — canonical adjacency contract migration
**Deps**: Spec 35-00 frontend roadmap (generic, data-driven runner)

## Problem

Adjacency rendering originally used hardcoded line styles and had no visual-config edge styling surface.

A deeper architectural gap also existed: adjacency in `GameDef`/`GameSpecDoc` was modeled as `string[]`, which prevented robust per-edge semantics and made future edge-level metadata brittle.

For a clean, extensible architecture aligned with generic GameDef/runner goals, adjacency needed to be canonicalized as object entries with strict schema ownership and no legacy alias paths.

## Assumption Reassessment (Code + Tests)

### Verified assumptions

1. Runner adjacency styling was hardcoded in `packages/runner/src/canvas/renderers/adjacency-renderer.ts`.
2. Runner visual-config schema lacked an `edges` section before this work.
3. Existing tests were coupled to default/highlight fallback line values.

### Corrected assumptions

1. The previous ticket assumption "`GameDef` has no per-edge metadata and should remain string adjacency" was not architecturally sufficient for long-term extensibility.
2. The architecture was updated to canonical edge entries:
   - `ZoneDef.adjacentTo: ZoneAdjacency[]`
   - `ZoneAdjacency` includes `to`, optional `category`, optional `attributes`
3. No backward compatibility or aliasing path was kept:
   - old string-array adjacency contract was removed from schemas/types and test fixtures.

## Architecture Decision

This change is more beneficial than the previous architecture.

1. It preserves game-agnostic engine/runtime behavior while letting `GameSpecDoc` express richer game-specific edge data.
2. It establishes a future-proof per-edge metadata contract without hardcoding game rules in engine/runner.
3. It removes ambiguous/legacy input forms and enforces one strict canonical path across compiler, validation, runtime schemas, and rendering.
4. It keeps layering clean:
   - compiler validates/normalizes edge data
   - engine consumes canonical graph semantics
   - runner resolves visual policy via visual config/provider

## Updated Scope

1. Add `edges` section in runner visual config schema/provider and wire renderer consumption.
2. Expand `RenderAdjacency` with category and style resolution precedence.
3. Migrate engine/cnl/kernel adjacency contracts from `string[]` to object entries:
   - core/runtime types
   - Zod schemas
   - GameSpecDoc compiler inputs
   - map asset lowering/macros
   - validation diagnostics paths
   - spatial graph construction and constraints
   - zobrist canonical hashing
4. Migrate FITL data assets and fixtures to canonical adjacency objects.
5. Update runner graph/layout/model logic to consume adjacency entries via `.to`.
6. Update and strengthen tests to assert canonical behavior and schema/type parity.

## Invariants

1. `adjacentTo` entries are canonical objects with a required `to` zone id.
2. Spatial constraints (self-loop, duplicate, dangling, sortedness) evaluate against `entry.to`.
3. No legacy adjacency aliasing (`string[]`) is accepted by runtime/compiler schemas.
4. Runner edge style precedence remains deterministic:
   - defaults -> category style -> highlighted override.
5. Engine and simulator remain game-agnostic; game-specific values stay in `GameSpecDoc`/assets/visual-config.
6. Canonical `GameDef` adjacency entries must declare explicit `direction` semantics (`bidirectional` or `unidirectional`).
7. Conflicting duplicate adjacency declarations (same `to`, different `direction`) are rejected.
8. Macro expansion preserves raw adjacency metadata values for validation; no silent string coercion of edge metadata.

## New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts`
2. `packages/engine/test/unit/json-schema.test.ts`
3. `packages/engine/test/unit/validate-spec.test.ts`
4. `packages/engine/test/unit/validate-gamedef.test.ts`
5. `packages/engine/test/integration/compile-pipeline.test.ts`
6. `packages/engine/test/integration/fitl-production-data-compilation.test.ts`
7. `packages/engine/test/unit/spatial-graph.test.ts`
8. `packages/engine/test/unit/spatial.golden.test.ts`
9. `packages/engine/test/unit/zobrist-table.test.ts`
10. `packages/runner/test/layout/build-layout-graph.test.ts`
11. `packages/runner/test/layout/compute-layout.test.ts`
12. `packages/runner/test/layout/aux-zone-layout.test.ts`
13. `packages/runner/test/layout/layout-cache.test.ts`
14. `packages/runner/test/model/derive-render-model-zones.test.ts`
15. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
16. `packages/runner/test/config/visual-config-provider.test.ts`
17. `packages/runner/test/config/visual-config-schema.test.ts`
18. `packages/runner/test/config/visual-config-files.test.ts`
19. `packages/engine/test/unit/compile-zones.test.ts`
20. `packages/engine/test/integration/spatial-kernel-integration.test.ts`

## Rationale Per Test Group

1. Schema tests: enforce canonical adjacency object shape and remove string-array acceptance.
2. Compiler/validation tests: verify diagnostics paths now target `adjacentTo[i].to` and keep strict reference checks.
3. Spatial tests: guarantee graph constraints remain correct under object-based adjacency.
4. Zobrist tests: lock deterministic hashing for canonicalized adjacency payloads.
5. Runner layout/model tests: ensure graph/build/layout and render-model derivation consume `.to` consistently.
6. Runner visual-config tests: preserve deterministic edge-style resolution and FITL config compatibility.
7. Direction semantics tests: enforce explicit direction requirement and reject conflicting duplicate direction declarations.
8. Integration regression test: ensure runtime movement/trigger flow still works with canonical explicit adjacency direction payloads.

## Verification

1. `pnpm turbo test` ✅
   - Engine: 250/250 pass
   - Runner: 97 files, 766 tests pass
2. `pnpm turbo lint` ✅
3. `pnpm turbo typecheck` ✅

## Outcome

- Completion date: 2026-02-19
- What was actually changed vs originally planned:
  - Delivered original runner `edges` styling scope.
  - Additionally closed the architectural gap by migrating adjacency to a canonical edge-object contract across engine/compiler/runner.
  - Removed legacy adjacency string-array contract (no backward compatibility path).
- Deviations from original plan:
  - Scope expanded from runner-only to cross-layer contract hardening to meet long-term extensibility requirements.
  - Updated tests/fixtures/data assets comprehensively to reflect canonical adjacency semantics.
- Verification results:
  - Full workspace test/lint/typecheck gates pass with the migrated architecture.
