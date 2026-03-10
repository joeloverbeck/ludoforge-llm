# ENGINEPIPE-001: Short-Circuit Validate/Compile After Parse Errors

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL staged pipeline helper, production/test helper entrypoints, and tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/parser.ts`, `packages/engine/src/cnl/compiler-core.ts`, `packages/engine/src/cnl/validate-spec-core.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/engine/test/helpers/diagnostic-helpers.ts`, `packages/engine/test/integration/parse-validate-full-spec.test.ts`, `packages/engine/test/integration/compile-pipeline.test.ts`

## Problem

Today, several helper paths continue into validation and compilation even when parsing has already failed. That behavior is technically usable for low-level debugging, but in realistic workflows it produces noisy follow-on diagnostics such as missing sections or unknown action mappings that obscure the first real cause.

The parser/linter defect above is the primary issue, but the pipeline ergonomics are still weak: parse-stage failures should be treated as blockers by the canonical staged workflow that most tests and tooling should use.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/test/helpers/production-spec-helpers.ts` currently parses, validates, and compiles unconditionally, even if `parsed.diagnostics` already contains fatal parser errors.
2. `packages/engine/src/cnl/compose-gamespec.ts` is not the architectural owner of this behavior. It merges imported sources and preserves parse diagnostics, but it is not the canonical parse/validate/compile pipeline entrypoint for plain markdown specs.
3. Existing tests such as `packages/engine/test/integration/compile-pipeline.test.ts` intentionally exercise low-level parse/validate/compile behavior on malformed docs. Those tests are still valuable and should remain available; the short-circuit policy belongs in a higher-level staged helper, not in the raw parse, validate, or compile primitives.
4. Existing helper assertions such as `assertNoErrors()` help disciplined call sites stop early, but they do not expose blocked-stage state or provide one authoritative staged pipeline contract.

## Architecture Check

1. A canonical staged pipeline helper in `packages/engine/src/cnl/` is cleaner than burying stop-on-parse policy inside ad hoc test helpers, because it centralizes stage gating while preserving the raw primitives for low-level diagnostics and debugging.
2. This remains entirely game-agnostic: it governs pipeline control flow for malformed `GameSpecDoc` input, not any Fire in the Lake rule.
3. No backwards-compatibility shim is required. Low-level parse/validate/compile functions should remain available as independent building blocks, but the recommended staged helper should block later stages once earlier stages have fatal errors.

## What to Change

### 1. Introduce a canonical staged spec-processing helper

Provide one authoritative helper/API for “parse -> validate -> compile” that:

- returns stage outputs explicitly
- treats parse errors as blocking validation/compile work by default
- makes blocked-stage status obvious to callers

This should live in shared CNL code so production-oriented helpers and tests consume the same contract instead of each inventing their own gating policy.

### 2. Update high-value consumers to use the staged contract

Adopt the new staged behavior in production-oriented helpers and focused integration coverage so malformed specs fail at the parser stage instead of burying the root cause under secondary compile errors.

### 3. Add regression tests around blocked-stage behavior

Pin the intended semantics:

- malformed spec with parse errors does not proceed to misleading compile assertions in canonical helper paths
- valid specs still run full parse/validate/compile successfully

## Files to Touch

- `packages/engine/src/cnl/` (new staged helper file and export wiring)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/engine/test/helpers/diagnostic-helpers.ts` (modify if needed for blocked-stage assertions)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify only if shared staged-helper coverage belongs there)

## Out of Scope

- Replacing low-level parse/validate/compile APIs with one monolithic mandatory path everywhere
- Game-specific event-card fixes
- YAML syntax-linting improvements themselves (covered by parser ticket)

## Acceptance Criteria

### Tests That Must Pass

1. Canonical staged helper returns parse errors and marks later stages blocked when markdown contains fatal parser errors.
2. Valid compilable inputs still reach validation and compilation successfully through the same helper path.
3. Existing low-level malformed-pipeline tests that intentionally call parse/validate/compile directly remain valid and deterministic.
4. Existing suite: `pnpm -F @ludoforge/engine build`
5. Existing suite: `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
6. Existing suite: `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`

### Invariants

1. The staged helper remains generic and reusable across games.
2. Later-stage diagnostics must not replace or obscure earlier fatal parse diagnostics in canonical workflows.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — add blocked-stage coverage for malformed parse input and success-path coverage for the shared staged helper using a compile-clean fixture.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — keep direct malformed parse/validate/compile coverage so the staged helper does not erase lower-level determinism tests.
3. `packages/engine/test/helpers/production-spec-helpers.ts` consumer coverage — ensure production helpers follow the new stop-on-parse-error contract once they adopt the shared helper.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm run check:ticket-deps`

## Outcome

Outcome amended: 2026-03-10

- Completion date: 2026-03-10
- What changed:
  - Added a shared CNL staged pipeline helper in `packages/engine/src/cnl/staged-pipeline.ts` that runs parse -> validate -> compile, blocks later stages on parse errors, and reports blocked-stage state explicitly.
  - Exported the staged helper from `packages/engine/src/cnl/index.ts`.
  - Updated `packages/engine/test/helpers/production-spec-helpers.ts` to use the shared staged helper instead of unconditionally validating/compiling after parse.
  - Added blocked-stage assertion helpers in `packages/engine/test/helpers/diagnostic-helpers.ts`.
  - Added staged-helper regression coverage in `packages/engine/test/integration/parse-validate-full-spec.test.ts` for both parser-fatal input and compile-clean input.
  - Refined the production-spec helper contract after archival so broken production specs now fail fast instead of receiving a fabricated empty compile result.
- Deviations from original plan:
  - `packages/engine/src/cnl/compose-gamespec.ts` was not changed because the reassessment confirmed it is not the correct owner for stop-on-parse policy.
  - `packages/engine/test/integration/compile-pipeline.test.ts` did not need changes; the existing direct malformed-pipeline coverage already preserved the intended low-level behavior and passed unchanged.
  - The staged-helper success-path test uses `compile-valid.md` instead of `full-valid-spec.md` because the latter is parse/validate-valid coverage, not a compile-clean fixture.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node packages/engine/dist/test/integration/parse-validate-full-spec.test.js` passed.
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed.
