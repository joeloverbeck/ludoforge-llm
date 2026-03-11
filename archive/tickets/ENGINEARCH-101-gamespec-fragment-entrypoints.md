# ENGINEARCH-101: Canonical GameSpec fragment entrypoints and composed production loading

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl` source loading + staged pipeline entrypoints; production spec data entrypoints; production spec test helpers
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/load-gamespec-source.ts`, `packages/engine/src/cnl/compose-gamespec.ts`, `packages/engine/src/cnl/staged-pipeline.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/runner/test/config/visual-config-files.test.ts`, `data/games/fire-in-the-lake.game-spec.md`, `data/games/texas-holdem.game-spec.md`

## Problem

Large production game specs are currently loaded as a single concatenated markdown blob and then parsed monolithically. FITL is already at the parser input ceiling and will continue to grow substantially as more event cards are implemented. This creates a brittle authoring model, makes parser-size limits operationally relevant, and forces artificial compression workarounds in game data.

## Assumption Reassessment (2026-03-11)

1. Current code has two separate source-loading models:
   - `composeGameSpec()` can compose an import graph rooted at a file entrypoint.
   - `loadGameSpecSource()` can read a single file or concatenate all markdown files in a directory lexicographically.
   Production FITL/Texas helpers, and the runner visual-config compile helper, still use the second path and then pass a single concatenated markdown string into `runGameSpecStages()` or `parseGameSpec()`.
2. The production game data under `data/games/fire-in-the-lake/` and `data/games/texas-holdem/` is not yet modeled as import-rooted entrypoint files. It is a flat directory of numbered fragments with no `imports:` block today, so a new composed-entrypoint API alone would not switch production loading unless the ticket also adds explicit root entrypoint files.
3. `composeGameSpec()` is not yet fully production-ready as-is. It currently omits `victoryStandings` from its singleton merge handling even though FITL already stores `victoryStandings` in a dedicated fragment. The ticket must harden composition correctness, not just rewire call sites.
4. The parser ceiling issue is real, not hypothetical: FITL already hit `CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED` during recent content growth. The architectural correction is to stop treating directory-backed production specs as one parser input, not to raise the monolithic limit.

## Architecture Check

1. The clean design is to make import-rooted composed `GameSpecDoc` loading the canonical production path, instead of increasing a monolithic size cap and continuing to parse one giant concatenated markdown string.
2. Production game directories should expose a single explicit markdown entrypoint file whose only responsibility is to declare imports. The numbered fragment files remain the content units; composition order becomes declarative instead of depending on directory concatenation semantics.
3. This keeps all game-specific data in `GameSpecDoc` fragments while preserving a fully game-agnostic `GameDef`, compiler core, simulator, runtime, and kernel.
4. No backwards-compatibility aliasing or parallel legacy production path should remain. Production helpers should compile from entrypoint files, not from directory concatenation. `loadGameSpecSource()` may remain as a raw loader for non-production fixture reading, but it must no longer be the production-spec architecture.

## What to Change

### 1. Add canonical composed-source entrypoints in the CNL pipeline

Introduce an engine-level API that loads a GameSpec from an entrypoint file and composes imported fragments before validation/compilation. This API should:
- accept a file entrypoint, not a pre-concatenated markdown blob
- resolve `imports:` through filesystem-relative file loading from the importer file
- parse fragments independently with existing per-fragment parser limits
- merge to one `GameSpecDoc` via `composeGameSpec()`
- feed the composed `GameSpecDoc` into existing validation and compile stages
- expose source-order/source-map information needed by downstream diagnostics and tests

### 2. Narrow `loadGameSpecSource()` responsibility

Refactor source-loading boundaries so `loadGameSpecSource()` is a raw file/directory reader only where appropriate, not the canonical production-spec path. Directory concatenation must no longer be the default way production games enter the pipeline.

### 3. Add explicit production entrypoint files

Add canonical markdown entrypoint files for FITL and Texas that declare imports for the existing numbered fragments. Do not rewrite or inline the content fragments themselves unless required for correctness. The numbered fragments remain the source of truth for game content.

### 4. Harden composition correctness before adopting it in production

Ensure composed loading preserves all canonical `GameSpecDoc` sections, including singleton sections such as `victoryStandings`, and that source-map remapping remains deterministic after composition.

### 5. Update production helpers and integration/runner call sites

Refactor production-spec helpers and the runner visual-config compile helper to load production games through the new composed entrypoint pipeline rather than through monolithic markdown concatenation.

### 6. Keep parser guardrails per fragment

Retain `maxInputBytes`, `maxYamlBlocks`, and `maxBlockBytes` as parser-level protections, but apply them to individual fragments. Do not solve the architectural issue by merely increasing `DEFAULT_MAX_INPUT_BYTES`.

## Files to Touch

- `packages/engine/src/cnl/staged-pipeline.ts` (modify)
- `packages/engine/src/cnl/load-gamespec-source.ts` (modify)
- `packages/engine/src/cnl/compose-gamespec.ts` (modify)
- `packages/engine/src/cnl/index.ts` (modify)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `data/games/fire-in-the-lake/*.md` (modify minimally to add a root entrypoint file)
- `data/games/texas-holdem/*.md` (modify minimally to add a root entrypoint file)
- `packages/engine/test/unit/load-gamespec-source.test.ts` (modify)
- `packages/engine/test/unit/compose-gamespec.test.ts` (modify)
- `packages/engine/test/unit/staged-pipeline.test.ts` (add or modify if present)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)
- `packages/engine/test/integration/compile-pipeline-compose.test.ts` (modify)

## Out of Scope

- Rewriting existing numbered production fragments beyond the minimal addition of explicit root entrypoint files
- Changing runtime/kernel behavior
- Adding any game-specific logic to the loader/compiler pipeline
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Production FITL and Texas helpers compile through a composed-entrypoint API rooted at explicit markdown entrypoint files, without depending on directory concatenation.
2. The runner visual-config production compile helper also compiles FITL/Texas through the same composed-entrypoint path.
3. Parser size limits are enforced per fragment, and a large multi-fragment game no longer fails solely because the combined logical game exceeds the old monolithic limit.
4. Composition preserves all canonical sections used by production specs, including `victoryStandings`.
5. Existing suites remain green:
   - `pnpm -F @ludoforge/engine test:integration`
   - `pnpm -F @ludoforge/runner test`

### Invariants

1. `GameSpecDoc` remains the sole home for game-specific rules/content; composition is a source-loading concern only.
2. `GameDef`, simulation, runtime, compiler core, and kernel remain game-agnostic and do not branch on FITL/Texas-specific identifiers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compose-gamespec.test.ts` — verify composed entrypoint behavior remains deterministic and preserves singleton sections used by production, including `victoryStandings`.
2. `packages/engine/test/unit/load-gamespec-source.test.ts` — keep coverage for raw file/directory loading while documenting that directory concatenation is no longer the production path.
3. `packages/engine/test/unit/staged-pipeline.test.ts` — verify the new entrypoint-based staged API composes fragments, carries source maps, and enforces parser limits per fragment.
4. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — verify large multi-fragment specs parse/validate/compile through composed entrypoints.
5. `packages/engine/test/integration/compile-pipeline-compose.test.ts` — verify composed entrypoint compilation remains equivalent to monolithic compilation where logically equivalent.
6. `packages/runner/test/config/visual-config-files.test.ts` — verify runner-side production compilation uses the canonical composed-entrypoint path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/load-gamespec-source.test.js`
3. `node --test packages/engine/dist/test/unit/compose-gamespec.test.js`
4. `node --test packages/engine/dist/test/unit/staged-pipeline.test.js`
5. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
6. `node --test packages/engine/dist/test/integration/compile-pipeline-compose.test.js`
7. `pnpm -F @ludoforge/engine test:integration`
8. `pnpm -F @ludoforge/runner test`
9. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-11
- Actual changes:
  - Added canonical file-entrypoint loading via `loadGameSpecEntrypoint()` and `runGameSpecStagesFromEntrypoint()`.
  - Hardened `composeGameSpec()` so singleton composition now preserves `victoryStandings`.
  - Added explicit production entrypoint files at `data/games/fire-in-the-lake.game-spec.md` and `data/games/texas-holdem.game-spec.md`.
  - Switched production engine helpers and runner visual-config compilation to the entrypoint-based composed pipeline.
  - Added regression coverage for filesystem entrypoints, per-fragment parser limits, and production entrypoint compilation.
- Deviations from original plan:
  - The entrypoint files were added adjacent to the production directories instead of inside them so raw directory concatenation helpers used by existing structure tests could remain stable during the migration.
  - A small unrelated engine lint issue in `fitl-events-fact-finding.test.ts` was cleaned up to leave the touched package lint-green.
- Verification results:
  - `node --test dist/test/unit/load-gamespec-source.test.js dist/test/unit/compose-gamespec.test.js dist/test/unit/staged-pipeline.test.js dist/test/integration/parse-validate-full-spec.test.js dist/test/integration/compile-pipeline-compose.test.js` ✅
  - `pnpm -F @ludoforge/engine test:integration` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm run check:ticket-deps` ✅
