# PIPEVAL-019: Consolidate CNL diagnostic path codec into a single shared contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL diagnostic path encoding/normalization contract consolidation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-016-harden-named-set-collision-diagnostic-path-encoding.md`, `tickets/PIPEVAL-018-align-diagnostic-source-map-with-encoded-keyed-paths.md`

## Problem

Path encoding and normalization logic is currently split across multiple modules (named-set diagnostics, compiler path normalization, parser/source-map lookup transforms). This duplication increases drift risk and makes future keyed-path evolution brittle.

## Assumption Reassessment (2026-03-05)

1. Named-set keyed-path emission is implemented in `named-set-utils.ts` via `toNamedSetDiagnosticPath(...)`.
2. Compiler dedupe normalization has separate bracket/index parsing behavior in `compiler-core.ts` (`normalizeDiagnosticPath(...)`).
3. `diagnostic-source-map.ts` uses independently defined candidate transforms for lookup (`buildSourceLookupCandidates(...)`).
4. Mismatch correction: path encoding/normalization should be owned by one shared codec utility consumed by emitters, normalizers, and source lookup logic.

## Architecture Check

1. A single codec module is cleaner and more extensible than several local path-transform implementations.
2. This is agnostic compiler/diagnostic infrastructure, with no game-specific data branching in GameDef/runtime/simulator/kernel.
3. No backwards-compatibility aliases/shims are introduced; callers migrate to one canonical path contract.

## What to Change

### 1. Introduce a shared diagnostic path codec module

Create one CNL utility that owns:
- keyed segment encoding
- array-index normalization rules
- path canonicalization for compiler dedupe
- lookup candidates used by source-map resolution

### 2. Migrate call sites to codec helpers

Replace local/manual implementations in named-set utils, compiler core, and diagnostic source-map with codec API calls.

### 3. Add codec-focused contract tests

Add direct unit tests for codec behavior across keyed strings (including escaped quotes/brackets), array indices, and canonicalization expectations used in dedupe/source lookup.

## Files to Touch

- `packages/engine/src/cnl/diagnostic-path-codec.ts` (new)
- `packages/engine/src/cnl/named-set-utils.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/diagnostic-source-map.ts` (modify)
- `packages/engine/test/unit/cnl/diagnostic-path-codec.test.ts` (new)
- `packages/engine/test/unit/compiler-api.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Named-set canonicalization semantics
- Non-CNL path formats in unrelated modules
- Visual config or runner rendering behavior

## Acceptance Criteria

### Tests That Must Pass

1. A direct codec test suite locks keyed-segment encoding, array-index normalization, and canonicalization invariants.
2. All migrated callers produce identical intended paths for existing covered behavior and improved correctness for keyed edge cases.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. CNL diagnostic path behavior is implemented through one shared contract utility.
2. GameDef/runtime/simulation remain game-agnostic and free of game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/diagnostic-path-codec.test.ts` — direct contract tests for encoding/canonicalization/lookup transforms.
2. `packages/engine/test/unit/compiler-api.test.ts` — assert compile diagnostics still emit canonical keyed paths under codec migration.
3. `packages/engine/test/unit/validate-spec.test.ts` — assert validator keyed-path behavior remains aligned with codec.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/cnl/diagnostic-path-codec.test.js packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
