# PIPEVAL-022: Introduce explicit macro path-segment parser contract

**Status**: COMPLETED (2026-03-05)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL path contract hardening for macro segment parsing/decoding
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-019-consolidate-cnl-diagnostic-path-codec.md`, `archive/tickets/PIPEVAL/PIPEVAL-021-unify-macro-path-segment-contract-between-expansion-and-codec.md`

## Problem

Macro segment handling is now shared, but detection still relies on a prefix/suffix heuristic (`[macro:` + `]`) instead of an explicit parse/decode contract. This leaves future drift risk if segment grammar evolves and keeps decoding logic implicit.

## Assumption Reassessment (2026-03-05)

1. Macro path segment render/append/strip now lives in `packages/engine/src/cnl/path-utils.ts`.
2. `stripMacroPathSegments(...)` currently identifies macro segments through `isMacroPathSegment(...)` string shape checks, not typed parse/decode.
3. Existing tests lock escaped rendering/stripping behavior in `path-utils.test.ts`, and `diagnostic-path-codec.test.ts` already asserts macro-stripped lookup fallbacks indirectly.
4. There is still no direct parser-level API contract test (parse success/failure + decoded payload) for macro segments.
5. Scope correction: add an explicit parser-backed macro-segment contract API and migrate stripping logic to consume it while preserving diagnostic lookup behavior.

## Architecture Check

1. A dedicated parser API (`parseMacroPathSegment`) is cleaner and more robust than ad-hoc string shape checks.
2. This remains generic CNL infrastructure and preserves game-agnostic GameDef/runtime/simulator behavior.
3. No compatibility aliases/shims are introduced; one canonical segment grammar is enforced.

## What to Change

### 1. Add explicit macro segment parser/decoder in path utils

Introduce a typed parser that:
- validates macro segment grammar
- decodes escaped payload (`\\`, `\]`)
- returns `undefined` for non-macro or malformed segments

### 2. Migrate stripping logic to parser-backed detection

Replace `isMacroPathSegment(...)` heuristic usage in `stripMacroPathSegments(...)` with `parseMacroPathSegment(...)`.

### 3. Add parser contract tests

Add direct tests for:
- valid encoded segments
- malformed segments (unterminated/invalid escapes)
- decode round-trip with render helper
- preservation of existing diagnostic lookup candidate behavior that depends on macro stripping

## Files to Touch

- `packages/engine/src/cnl/path-utils.ts` (modify)
- `packages/engine/test/unit/path-utils.test.ts` (modify)
- `packages/engine/test/unit/cnl/diagnostic-path-codec.test.ts` (verify no regression; modify only if required for clearer contract coverage)

## Out of Scope

- Macro expansion semantics
- Diagnostic severity/ranking changes
- Source-map span granularity changes

## Acceptance Criteria

### Tests That Must Pass

1. `parseMacroPathSegment(...)` deterministically accepts valid macro segments and rejects malformed ones.
2. `stripMacroPathSegments(...)` behavior remains correct and is parser-backed.
3. Existing diagnostic lookup candidate behavior remains deterministic after parser migration.
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. Macro segment grammar is defined and decoded in one explicit contract API.
2. CNL path behavior remains game-agnostic and independent of game-specific assets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/path-utils.test.ts` — parser acceptance/rejection/decode round-trip invariants.
2. `packages/engine/test/unit/cnl/diagnostic-path-codec.test.ts` — confirm macro-stripped candidate invariants remain intact.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/path-utils.test.js packages/engine/dist/test/unit/cnl/diagnostic-path-codec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

Implemented exactly the parser-contract hardening and test expansion planned for this ticket:

1. Added `parseMacroPathSegment(...)` to `packages/engine/src/cnl/path-utils.ts` as the single parser/decoder contract for macro path segments, including strict escape validation for `\\` and `\]`.
2. Migrated `stripMacroPathSegments(...)` to parser-backed detection and removed heuristic-only macro detection.
3. Expanded `packages/engine/test/unit/path-utils.test.ts` with direct parser acceptance/rejection/round-trip coverage plus malformed macro-like segment stripping guardrails.
4. Preserved existing `diagnostic-path-codec` lookup behavior without additional code changes in that module.
5. Verified with: `pnpm turbo build`, focused `node --test` for path/codec suites, `pnpm turbo test --force`, and `pnpm turbo lint` (all passing).
