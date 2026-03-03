# TESTINFRA-002: Add CNL visual-config import boundary guard

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL/source-guard test policy
**Deps**: None

## Problem

There is no explicit source-level guard that prevents CNL/compiler/kernel/simulator modules from importing game-specific visual configuration modules. Without a guard, architecture drift can couple game-agnostic execution layers to visual-config concerns.

## Assumption Reassessment (2026-03-03)

1. Current architecture contract states `GameSpecDoc` carries game-specific data while `GameDef` and simulation/runtime/kernel remain game-agnostic. Verified in `tickets/README.md`.
2. Existing lint/AST guard tests enforce multiple CNL/kernel boundaries, but there is no dedicated guard for visual-config import separation. Verified by current `packages/engine/test/unit/lint/*` and `eslint.config.js`.
3. `visual-config` ownership surfaces currently live in runner (`packages/runner/src/config/*`), and there are no direct imports from `packages/engine/src/{cnl,kernel,sim}` at present. Verified by source scan.
4. Scope correction: this ticket is guard-only test infrastructure. No engine source remediation is expected unless the new guard finds violations.

## Architecture Check

1. A focused source guard is cleaner than relying on review discipline because it makes boundary violations fail fast in CI.
2. This directly preserves the `GameSpecDoc` (game-specific) vs `GameDef`/runtime/simulator (game-agnostic) ownership contract.
3. No backwards-compatibility aliasing/shims: enforce canonical boundary now and fail direct violations.

## What to Change

### 1. Add boundary policy test

1. Add a lint/source guard test that scans engine CNL/kernel/sim modules for imports from visual-config ownership surfaces.
2. Keep rule deterministic and narrowly scoped to disallow game-specific visual-config coupling in agnostic layers.

### 2. Align module ownership and references

1. If any violating imports are found, migrate them to approved agnostic contracts or move the logic to non-agnostic ownership (no changes expected from current scan).
2. Ensure the guard test uses canonical ownership boundaries, not brittle filename substrings only.

## Files to Touch

- `packages/engine/test/unit/lint/` (modify/add boundary policy test)
- `packages/engine/src/cnl/` (modify only if violations are discovered by the new guard)
- `packages/engine/src/kernel/` (modify only if violations are discovered by the new guard)
- `packages/engine/src/sim/` (modify only if violations are discovered by the new guard)

## Out of Scope

- Game-specific visual presentation behavior changes
- Any GameSpecDoc schema migration unrelated to import-boundary enforcement
- Runtime behavior changes not needed to remove boundary violations

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when CNL/kernel/sim directly import visual-config ownership modules.
2. Guard test passes under the current intended architecture after remediation (if needed).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Engine agnostic layers (`cnl`, `kernel`, `sim`) do not import visual-config-specific ownership surfaces.
2. Game-specific data boundaries remain explicit: game data in `GameSpecDoc`; visual presentation data in visual-config; execution contracts remain agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/engine-agnostic-visual-config-import-boundary-policy.test.ts` — source-level contract guard for visual-config import separation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/engine-agnostic-visual-config-import-boundary-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What actually changed**:
  - Reassessed and corrected ticket assumptions/scope before implementation:
    - removed unnecessary dependency on `SEATRES-070` because this guard is implementable with existing test helpers
    - documented that this is a guard-only test-infra ticket (no current engine-source violations found)
  - Added `packages/engine/test/unit/lint/engine-agnostic-visual-config-import-boundary-policy.test.ts`.
    - The test scans `packages/engine/src/cnl`, `packages/engine/src/kernel`, and `packages/engine/src/sim`.
    - It fails on any static import, re-export import source, or dynamic import that resolves to runner visual-config ownership surfaces under `packages/runner/src/config` (including `@ludoforge/runner/.../config` style specifiers).
  - Post-completion architecture refinement:
    - extracted reusable source-import boundary helpers into `packages/engine/test/helpers/lint-policy-helpers.ts`:
      - `findModuleSpecifiers(source)` for shared import/re-export/dynamic-import source extraction
      - `findImportBoundaryViolations(files, predicate)` for shared boundary violation scanning
    - refactored the visual-config boundary test to use shared helpers, reducing duplicated regex/parsing logic for future boundary-policy tests.
- **Deviations from original plan**:
  - No engine source files in `cnl/kernel/sim` required remediation because no violations were present.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/lint/engine-agnostic-visual-config-import-boundary-policy.test.js` ✅
  - `node --test packages/engine/dist/test/unit/lint/cnl-contract-import-boundary-lint-policy.test.js packages/engine/dist/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.js packages/engine/dist/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.js packages/engine/dist/test/unit/lint/engine-agnostic-visual-config-import-boundary-policy.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`# pass 363`, `# fail 0`)
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
