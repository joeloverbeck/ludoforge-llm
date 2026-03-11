# ENGINEARCH-207: First-class GameSpec bundles and single-pass source fingerprints

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/cnl` source-loading + staged pipeline APIs; test/runner compile entrypoints
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-101-gamespec-fragment-entrypoints.md`, `archive/tickets/FITLSPEC-102-split-fitl-production-spec-into-imported-fragments.md`, `archive/tickets/ENGINEPIPE-001-short-circuit-validate-compile-after-parse-errors.md`, `packages/engine/src/cnl/load-gamespec-source.ts`, `packages/engine/src/cnl/staged-pipeline.ts`, `packages/engine/src/cnl/index.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/runner/test/config/visual-config-files.test.ts`

## Problem

The current composed GameSpec pipeline has the right high-level boundaries but the wrong operational shape for large production games. Production loading, source fingerprinting, parse/validate/compile, and test-level caching are entangled. As a result, repeated access to one compiled production game still re-loads and re-fingerprints all source fragments before cache lookup, which scales poorly for large split GameSpecDoc packages such as FITL and will worsen as more games adopt the same package model.

## Assumption Reassessment (2026-03-11)

1. Current production compilation already uses markdown entrypoints rooted in `GameSpecDoc` imports, not directory concatenation. The architectural issue is no longer missing entrypoints; it is repeated source loading and repeated fingerprint work after the entrypoint migration.
2. `runGameSpecStagesFromEntrypoint()` currently reloads source text through `loadGameSpecEntrypoint()` and only then runs parse/validate/compile. There is no first-class loaded-source artifact that downstream callers can reuse.
3. `packages/engine/test/helpers/production-spec-helpers.ts` currently performs multiple source-loading/fingerprinting passes per `compileProductionSpec()` call before it can hit its in-process cache. This is a real architecture flaw, not just a FITL-specific test mistake.
4. The correct solution must stay generic for all large games and must not move any game-specific data out of `GameSpecDoc`, nor any visual data into engine compilation.

## Architecture Check

1. The cleaner design is to make loaded, parsed, validated, and compiled GameSpec bundles explicit CNL artifacts with a single source fingerprint computed once at load time and propagated downstream.
2. This preserves the intended ownership boundary:
   - `GameSpecDoc` remains the sole home for game-specific gameplay data and rules content.
   - `visual-config.yaml` remains runner-owned visual presentation input and is not part of engine compilation.
   - `GameDef`, compiler core, runtime, simulation, and kernel remain game-agnostic consumers of a compiled bundle.
3. No backwards-compatibility aliases or dual APIs should survive. Callers should migrate to the new bundle-first staged pipeline rather than preserving the current reload-heavy helper path.

## What to Change

### 1. Introduce first-class GameSpec bundle types

Add explicit CNL-owned types for the major stages of the pipeline, such as:
- loaded source bundle
- parsed GameSpec bundle
- validated GameSpec bundle
- compiled GameSpec bundle

Each bundle should carry:
- canonical entry path
- ordered source paths
- source fingerprint
- source-map/diagnostics payloads for its stage
- compiled `GameDef` where applicable

### 2. Make source loading compute fingerprint exactly once

Refactor `loadGameSpecEntrypoint()` so it returns a stable loaded-source artifact that includes both ordered source metadata and a source fingerprint derived from the actual composed source set. Downstream stages must reuse that fingerprint instead of re-reading all files to discover whether they changed.

### 3. Refactor staged compilation around bundle inputs

Refactor `runGameSpecStagesFromEntrypoint()` into a bundle-oriented pipeline. The public architecture should support:
- load from entrypoint once
- parse/validate/compile from the loaded bundle
- reuse an already loaded or parsed bundle without re-entering filesystem composition

### 4. Migrate engine and runner-side production compile call sites

Replace helper-level source reload logic with calls to the bundle-first pipeline. Test helpers and runner-side config validation should consume the same canonical compile surface so there is one architectural path for production game compilation.

### 5. Establish a clear engine/runner boundary for visual config

Ensure the bundle pipeline ends at a compiled `GameDef` plus source metadata. Any `visual-config.yaml` loading/validation remains outside the engine pipeline and may only consume compiled game output, never inject visual concerns into `GameSpecDoc` or `GameDef`.

## Files to Touch

- `packages/engine/src/cnl/load-gamespec-source.ts` (modify)
- `packages/engine/src/cnl/staged-pipeline.ts` (modify)
- `packages/engine/src/cnl/index.ts` (modify)
- `packages/engine/src/cnl/` (add new bundle types/helpers as needed)
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
2. Production FITL and Texas compile helpers can obtain a compiled bundle without repeated source reloading on cache hits.
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
3. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — verify production entrypoint compilation continues to work through the new bundle surface.
4. `packages/runner/test/config/visual-config-files.test.ts` — verify visual-config validation consumes compiled game output without crossing ownership boundaries.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/load-gamespec-source.test.js`
3. `node --test packages/engine/dist/test/unit/staged-pipeline.test.js`
4. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/runner test`
7. `pnpm run check:ticket-deps`
