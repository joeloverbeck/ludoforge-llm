# ENGINEARCH-101: Canonical GameSpec fragment entrypoints and composed production loading

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl` source loading + staged pipeline entrypoints; production spec test helpers
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/load-gamespec-source.ts`, `packages/engine/src/cnl/compose-gamespec.ts`, `packages/engine/src/cnl/staged-pipeline.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`

## Problem

Large production game specs are currently loaded as a single concatenated markdown blob and then parsed monolithically. FITL is already at the parser input ceiling and will continue to grow substantially as more event cards are implemented. This creates a brittle authoring model, makes parser-size limits operationally relevant, and forces artificial compression workarounds in game data.

## Assumption Reassessment (2026-03-11)

1. Current code already supports fragment composition via `composeGameSpec()`, but production FITL/Texas helpers still call `loadGameSpecSource(...).markdown` and then `runGameSpecStages(markdown)`.
2. `loadGameSpecSource()` currently concatenates all markdown files in a directory lexicographically, so directory-based production specs are still treated as one parser input.
3. The parser ceiling issue is real, not hypothetical: FITL crossed `CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED` during card-63 implementation even though behavior remained valid. The correction is to stop treating directory-backed production specs as monolithic parser inputs.

## Architecture Check

1. The clean design is to make composed multi-file `GameSpecDoc` loading the canonical production path, instead of increasing a monolithic size cap and continuing to parse one giant markdown string.
2. This keeps all game-specific data in `GameSpecDoc` fragments while preserving a fully game-agnostic `GameDef`, compiler core, simulator, runtime, and kernel.
3. No backwards-compatibility aliasing or parallel legacy path should remain. The production loading API should have one canonical behavior for fragment entrypoints rather than “sometimes concat, sometimes compose”.

## What to Change

### 1. Add canonical composed-source entrypoints in the CNL pipeline

Introduce an engine-level API that loads a GameSpec from an entrypoint file and composes imported fragments before validation/compilation. This API should:
- accept a file entrypoint, not a pre-concatenated markdown blob
- resolve `imports:` through repository-relative file loading
- parse fragments independently with existing per-fragment parser limits
- merge to one `GameSpecDoc` via `composeGameSpec()`
- feed the composed `GameSpecDoc` into existing validation and compile stages

### 2. Narrow `loadGameSpecSource()` responsibility

Refactor source-loading boundaries so `loadGameSpecSource()` is a raw file/directory reader only where appropriate, not the canonical production-spec path. Directory concatenation must no longer be the default way production games enter the pipeline.

### 3. Update production helpers and integration call sites

Refactor production-spec helpers and high-value integration tests to load production games through the new composed entrypoint pipeline rather than through monolithic markdown concatenation.

### 4. Keep parser guardrails per fragment

Retain `maxInputBytes`, `maxYamlBlocks`, and `maxBlockBytes` as parser-level protections, but apply them to individual fragments. Do not solve the architectural issue by merely increasing `DEFAULT_MAX_INPUT_BYTES`.

## Files to Touch

- `packages/engine/src/cnl/staged-pipeline.ts` (modify)
- `packages/engine/src/cnl/load-gamespec-source.ts` (modify)
- `packages/engine/src/cnl/compose-gamespec.ts` (modify)
- `packages/engine/src/cnl/index.ts` (modify)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/engine/test/unit/load-gamespec-source.test.ts` (modify)
- `packages/engine/test/unit/compose-gamespec.test.ts` (modify)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)
- `packages/engine/test/integration/compile-pipeline-compose.test.ts` (modify)

## Out of Scope

- Splitting FITL content files themselves
- Changing runtime/kernel behavior
- Adding any game-specific logic to the loader/compiler pipeline
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Production FITL and Texas helpers compile through a composed-entrypoint API without depending on directory concatenation.
2. Parser size limits are enforced per fragment, and a large multi-fragment game no longer fails solely because the combined logical game exceeds the old monolithic limit.
3. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. `GameSpecDoc` remains the sole home for game-specific rules/content; composition is a source-loading concern only.
2. `GameDef`, simulation, runtime, compiler core, and kernel remain game-agnostic and do not branch on FITL/Texas-specific identifiers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compose-gamespec.test.ts` — verify composed entrypoint behavior and import resolution remain deterministic.
2. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — verify large production games parse/validate/compile through composed entrypoints.
3. `packages/engine/test/helpers/production-spec-helpers.ts` consumers — ensure production helpers no longer rely on concatenated markdown.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compose-gamespec.test.js`
3. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm run check:ticket-deps`
