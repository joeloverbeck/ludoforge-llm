# PIPEVAL-019: Consolidate CNL diagnostic path codec into a single shared contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL diagnostic path encoding/normalization contract consolidation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-016-harden-named-set-collision-diagnostic-path-encoding.md`, `archive/tickets/PIPEVAL/PIPEVAL-018-align-diagnostic-source-map-with-encoded-keyed-paths.md`

## Problem

Diagnostic path handling is still split between three CNL call-site implementations:
- named-set keyed path emission in `named-set-utils.ts`
- compiler dedupe canonicalization in `compiler-core.ts`
- source-map lookup candidate transforms in `diagnostic-source-map.ts`

`PIPEVAL-018` already centralized low-level path parsing/tokenization in `path-utils.ts`, but diagnostic-specific contract rules are still duplicated across those call sites. That duplication keeps drift risk high when keyed path behavior evolves.

## Assumption Reassessment (2026-03-05)

1. `PIPEVAL-018` already introduced shared low-level path utilities in `packages/engine/src/cnl/path-utils.ts` (dot/bracket index normalization, quote-aware path-segment parsing, parent trimming).
2. Named-set keyed-path emission remains localized in `packages/engine/src/cnl/named-set-utils.ts` via `toNamedSetDiagnosticPath(...)`.
3. Compiler diagnostic dedupe canonicalization remains localized in `packages/engine/src/cnl/compiler-core.ts` via `normalizeDiagnosticPath(...)`.
4. Source-map lookup candidate generation remains localized in `packages/engine/src/cnl/diagnostic-source-map.ts` via `buildSourceLookupCandidates(...)`.
5. Existing tests already lock several keyed-path behaviors (`path-utils.test.ts`, `compiler-diagnostics.test.ts`, `compiler-api.test.ts`, `validate-spec.test.ts`) but there is no direct single-module contract test for shared diagnostic codec behavior.
6. Scope correction: this ticket should consolidate remaining diagnostic-specific rules on top of `path-utils.ts`, not re-implement low-level parsing already solved in `PIPEVAL-018`.

## Architecture Check

1. A dedicated diagnostic codec module that composes `path-utils.ts` is cleaner than scattering diagnostic-specific transforms across multiple call sites.
2. This is agnostic compiler/diagnostic infrastructure, with no game-specific data branching in GameDef/runtime/simulator/kernel.
3. No backwards-compatibility aliases/shims are introduced; callers migrate to one canonical path contract.

## What to Change

### 1. Introduce a shared diagnostic path codec module

Create one CNL utility that owns diagnostic-path contract composition (reusing `path-utils.ts` primitives):
- keyed segment encoding
- array-index normalization rules
- path canonicalization for compiler dedupe
- lookup candidates used by source-map resolution

### 2. Migrate call sites to codec helpers

Replace local/manual implementations in named-set utils, compiler core, and diagnostic source-map with codec API calls.

### 3. Add codec-focused contract tests

Add direct unit tests for codec behavior across keyed strings (including escaped quotes/brackets), array indices, `doc.` prefix canonicalization, macro-segment lookup candidate stripping, and dedupe/source-lookup expectations.

## Files to Touch

- `packages/engine/src/cnl/diagnostic-path-codec.ts` (new)
- `packages/engine/src/cnl/named-set-utils.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/diagnostic-source-map.ts` (modify)
- `packages/engine/test/unit/cnl/diagnostic-path-codec.test.ts` (new)
- `packages/engine/test/unit/named-set-utils.test.ts` (modify)
- `packages/engine/test/unit/compiler-diagnostics.test.ts` (modify)

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
2. `packages/engine/test/unit/named-set-utils.test.ts` — assert named-set diagnostics consume codec keyed-path encoding.
3. `packages/engine/test/unit/compiler-diagnostics.test.ts` — assert source lookup keyed candidate behavior remains aligned after codec migration.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/cnl/diagnostic-path-codec.test.js packages/engine/dist/test/unit/named-set-utils.test.js packages/engine/dist/test/unit/compiler-diagnostics.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-05
- What changed:
  - Added `packages/engine/src/cnl/diagnostic-path-codec.ts` as the shared diagnostic-path contract module for keyed-segment appending, canonicalization, and source-lookup candidate generation.
  - Migrated `named-set-utils.ts` to route keyed path emission through the codec.
  - Migrated `compiler-core.ts` to route diagnostic path canonicalization through the codec.
  - Migrated `diagnostic-source-map.ts` to route lookup candidate construction through the codec.
  - Added a direct codec contract suite at `packages/engine/test/unit/cnl/diagnostic-path-codec.test.ts`.
  - Strengthened surrounding regression coverage in `named-set-utils.test.ts` and `compiler-diagnostics.test.ts`.
- Scope corrections applied vs original plan:
  - The ticket was corrected before implementation to acknowledge that low-level parsing utilities had already been centralized in `path-utils.ts` by `PIPEVAL-018`.
  - Test-file scope shifted from `compiler-api.test.ts`/`validate-spec.test.ts` to tighter boundary tests (`named-set-utils.test.ts` and `compiler-diagnostics.test.ts`) because those are the direct ownership boundaries for the migrated logic.
- Verification:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/cnl/diagnostic-path-codec.test.js packages/engine/dist/test/unit/named-set-utils.test.js packages/engine/dist/test/unit/compiler-diagnostics.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
