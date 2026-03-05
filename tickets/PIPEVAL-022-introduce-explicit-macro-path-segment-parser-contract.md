# PIPEVAL-022: Introduce explicit macro path-segment parser contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL path contract hardening for macro segment parsing/decoding
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-019-consolidate-cnl-diagnostic-path-codec.md`, `archive/tickets/PIPEVAL/PIPEVAL-021-unify-macro-path-segment-contract-between-expansion-and-codec.md`

## Problem

Macro segment handling is now shared, but detection still relies on a prefix/suffix heuristic (`[macro:` + `]`) instead of an explicit parse/decode contract. This leaves future drift risk if segment grammar evolves and keeps decoding logic implicit.

## Assumption Reassessment (2026-03-05)

1. Macro path segment render/append/strip now lives in `packages/engine/src/cnl/path-utils.ts`.
2. `stripMacroPathSegments(...)` currently identifies macro segments through `isMacroPathSegment(...)` string shape checks, not typed parse/decode.
3. Existing tests lock escaped rendering/stripping behavior, but there is no direct parser-level API contract test (parse success/failure + decoded payload) for macro segments.
4. Scope correction: add an explicit parser-backed macro-segment contract API and migrate stripping logic to consume it.

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

## Files to Touch

- `packages/engine/src/cnl/path-utils.ts` (modify)
- `packages/engine/test/unit/path-utils.test.ts` (modify)

## Out of Scope

- Macro expansion semantics
- Diagnostic severity/ranking changes
- Source-map span granularity changes

## Acceptance Criteria

### Tests That Must Pass

1. `parseMacroPathSegment(...)` deterministically accepts valid macro segments and rejects malformed ones.
2. `stripMacroPathSegments(...)` behavior remains correct and is parser-backed.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Macro segment grammar is defined and decoded in one explicit contract API.
2. CNL path behavior remains game-agnostic and independent of game-specific assets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/path-utils.test.ts` — parser acceptance/rejection/decode round-trip invariants.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/path-utils.test.js packages/engine/dist/test/unit/cnl/diagnostic-path-codec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
