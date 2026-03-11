# ENGINEARCH-207: First-class GameSpec bundles and single-pass source fingerprints

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/cnl` source-loading + staged pipeline APIs; test/runner compile entrypoints
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-101-gamespec-fragment-entrypoints.md`, `archive/tickets/FITLSPEC-102-split-fitl-production-spec-into-imported-fragments.md`, `archive/tickets/ENGINEPIPE-001-short-circuit-validate-compile-after-parse-errors.md`, `packages/engine/src/cnl/load-gamespec-source.ts`, `packages/engine/src/cnl/staged-pipeline.ts`, `packages/engine/src/cnl/index.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/runner/test/config/visual-config-files.test.ts`

## Problem

The current composed GameSpec pipeline has the right high-level boundaries but the wrong operational shape for large production games. Production loading, source fingerprinting, parse/validate/compile, and test helper caching are entangled. The engine does not expose a first-class entrypoint bundle that carries ordered source metadata plus a canonical fingerprint, so callers that want both cache invalidation and staged compilation currently perform multiple full source passes inside one compile request. That is real architecture debt for split `GameSpecDoc` packages such as FITL and Texas.

## Assumption Reassessment (2026-03-11)

1. Current production compilation already uses markdown entrypoints rooted in `GameSpecDoc` imports, not directory concatenation. The architectural issue is no longer missing entrypoints; it is repeated source loading and repeated fingerprint work after the entrypoint migration.
2. `loadGameSpecEntrypoint()` currently returns a parsed result plus source order, but it does not expose source texts or a canonical source fingerprint. `runGameSpecStagesFromEntrypoint()` therefore remains an entrypoint convenience wrapper, not a reusable bundle surface.
3. `packages/engine/test/helpers/production-spec-helpers.ts` currently performs multiple source-loading/fingerprinting passes per compile request. FITL parses via `loadGameSpecEntrypoint()`, hashes via another full read, then recompiles via `runGameSpecStagesFromEntrypoint()`. Texas reads directory markdown separately, hashes the entrypoint separately, then recompiles through the staged entrypoint wrapper.
4. Eliminating all filesystem reads on every helper cache hit is not a realistic promise for content-invalidating helpers. This ticket should remove duplicate passes within one compile request and expose bundle metadata so higher-level suite fixtures can decide reuse policy. Suite-scoped zero-reload reuse belongs to `tickets/TESTINFRA-003-suite-scoped-compiled-game-fixtures-for-large-game-packages.md`.
5. Runner-side visual-config validation already keeps visual data outside engine compilation; its current issue is only that it compiles through the old entrypoint convenience wrapper instead of a first-class bundle surface.

## Architecture Check

1. The cleaner design is to make the parsed entrypoint bundle explicit: one CNL-owned artifact that carries canonical entry path, ordered source texts, parsed `GameSpecDoc`/source map/diagnostics, and a source fingerprint computed exactly once during load.
2. This preserves the intended ownership boundary:
   - `GameSpecDoc` remains the sole home for game-specific gameplay data and rules content.
   - `visual-config.yaml` remains runner-owned visual presentation input and is not part of engine compilation.
   - `GameDef`, compiler core, runtime, simulation, and kernel remain game-agnostic consumers of compiled output from that bundle.
3. A separate wrapper type for every later stage is not justified yet. Validation and compilation should consume the parsed bundle directly and return normal stage outputs rather than introducing ceremonial stage containers with no independent reuse story.
4. No backwards-compatibility aliases or dual entrypoint APIs should survive. Callers should migrate to the new bundle-first staged pipeline rather than preserving the current reload-heavy helper path.

## What to Change

### 1. Introduce a first-class parsed entrypoint bundle

Add an explicit CNL-owned bundle type for entrypoint-driven production compilation.

The bundle should carry:
- canonical entry path
- ordered source files/text
- source fingerprint
- parsed `GameSpecDoc`
- source map and parse diagnostics

### 2. Make source loading compute fingerprint exactly once

Replace `loadGameSpecEntrypoint()` with a bundle loader that captures each imported source exactly once, preserves deterministic source order, and computes a source fingerprint from that exact ordered source set.

### 3. Refactor staged compilation around bundle inputs

Refactor staged compilation so validation/compile operate on the parsed bundle instead of re-entering filesystem composition. The public architecture should support:
- load from entrypoint once
- validate/compile from the parsed bundle
- reuse an already loaded bundle without re-reading source files

### 4. Migrate engine and runner-side production compile call sites

Replace helper-level duplicate source reload logic with calls to the bundle-first pipeline. Test helpers and runner-side config validation should consume the same canonical compile surface so there is one architectural path for production game compilation.

### 5. Establish a clear engine/runner boundary for visual config

Ensure the bundle pipeline ends at parsed/compiled engine artifacts plus source metadata. Any `visual-config.yaml` loading/validation remains outside the engine pipeline and may only consume compiled game output, never inject visual concerns into `GameSpecDoc` or `GameDef`.

## Files to Touch

- `packages/engine/src/cnl/load-gamespec-source.ts` (modify)
- `packages/engine/src/cnl/gamespec-bundle.ts` (add)
- `packages/engine/src/cnl/staged-pipeline.ts` (modify)
- `packages/engine/src/cnl/index.ts` (modify)
- `packages/engine/test/unit/load-gamespec-source.test.ts` (modify)
- `packages/engine/test/unit/staged-pipeline.test.ts` (modify)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)

## Out of Scope

- Changing any game rules or FITL-specific content semantics
- Moving gameplay data out of `GameSpecDoc`
- Moving visual-config concerns into engine compilation
- CI workflow partitioning and test-runner topology changes

## Acceptance Criteria

### Tests That Must Pass

1. The CNL pipeline exposes a first-class bundle-oriented API where source fingerprinting happens once per load and is reused by later stages.
2. Production FITL and Texas compile helpers perform at most one full source read/fingerprint pass per compile request, then reuse that loaded bundle for staged validation/compilation.
3. Runner-side visual-config compilation checks consume the same compiled bundle architecture without mixing visual config into engine compilation.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `GameSpecDoc` remains gameplay-data-only; no visual presentation data migrates back into engine-owned spec compilation.
2. `GameDef`, simulation, runtime, and kernel remain fully game-agnostic and do not branch on game ids, file layouts, or per-game loader rules.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/load-gamespec-source.test.ts` — verify loaded bundles expose deterministic source order and a single canonical fingerprint for the source set.
2. `packages/engine/test/unit/staged-pipeline.test.ts` — verify later stages can consume preloaded bundles without reloading source files.
3. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — verify production entrypoint compilation continues to work through the new bundle surface and exposes stable source fingerprints.
4. `packages/runner/test/config/visual-config-files.test.ts` — verify visual-config validation consumes compiled game output without crossing ownership boundaries.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/load-gamespec-source.test.js`
3. `node --test packages/engine/dist/test/unit/staged-pipeline.test.js`
4. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/runner test`
7. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-11
- Actual changes:
  - Added a first-class parsed entrypoint bundle surface in `packages/engine/src/cnl/gamespec-bundle.ts`.
  - Replaced `loadGameSpecEntrypoint()` with `loadGameSpecBundleFromEntrypoint()`, which captures ordered source texts and computes a canonical source fingerprint once per load.
  - Replaced `runGameSpecStagesFromEntrypoint()` with `runGameSpecStagesFromBundle()`, so validation and compilation operate on a preloaded bundle without re-reading source files.
  - Migrated production compile helpers and runner visual-config tests to the bundle-first surface.
  - Strengthened unit/integration coverage for deterministic fingerprints, preloaded-bundle staging, and production entrypoint bundle compilation.
- Deviations from original plan:
  - Did not introduce separate validated/compiled wrapper types. A single parsed entrypoint bundle plus normal stage results was the cleaner architecture for the current codebase.
  - Narrowed the scope from “no reload on helper cache hits” to “single-pass loading/fingerprinting per compile request”; suite-scoped fixture reuse remains owned by `tickets/TESTINFRA-003-suite-scoped-compiled-game-fixtures-for-large-game-packages.md`.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/load-gamespec-source.test.js`
  - `node --test packages/engine/dist/test/unit/staged-pipeline.test.js`
  - `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm run check:ticket-deps`
