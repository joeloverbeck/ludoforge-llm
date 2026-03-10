# ENGINEPIPE-001: Short-Circuit Validate/Compile After Parse Errors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL pipeline/helper entrypoints and tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/parser.ts`, `packages/engine/src/cnl/compose-gamespec.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/engine/test/helpers/diagnostic-helpers.ts`, `packages/engine/test/integration/parse-validate-full-spec.test.ts`

## Problem

Today, several helper paths continue into validation and compilation even when parsing has already failed. That behavior is technically usable for low-level debugging, but in realistic workflows it produces noisy follow-on diagnostics such as missing sections or unknown action mappings that obscure the first real cause.

The parser/linter defect above is the primary issue, but the pipeline ergonomics are still weak: parse-stage failures should be treated as blockers by the canonical staged workflow that most tests and tooling should use.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/test/helpers/production-spec-helpers.ts` currently parses, validates, and compiles unconditionally, even if `parsed.diagnostics` contains errors.
2. `packages/engine/src/cnl/compose-gamespec.ts` already preserves parse diagnostics, but it does not define a canonical “stop after parse errors” policy for downstream consumers.
3. Existing test helpers such as `assertNoErrors()` make it easy for disciplined call sites to stop early, but they do not provide a single authoritative staged pipeline contract.

## Architecture Check

1. A canonical staged pipeline is cleaner than leaving every caller to decide independently whether to validate/compile after parse failures.
2. This remains entirely game-agnostic: it governs pipeline control flow for malformed `GameSpecDoc` input, not any Fire in the Lake rule.
3. No backwards-compatibility shim is required. Low-level parse/validate/compile functions may remain available, but the recommended pipeline should block later stages once earlier stages have fatal errors.

## What to Change

### 1. Introduce or standardize a canonical staged spec-processing helper

Provide one authoritative helper/API for “parse -> validate -> compile” that:

- returns stage outputs explicitly
- treats parse errors as blocking validation/compile work by default
- makes blocked-stage status obvious to callers

This can be a new helper or a refactor of existing helper entrypoints, but the contract should be explicit and reusable.

### 2. Update high-value consumers to use the staged contract

Adopt the new staged behavior in production-oriented helpers and tests so malformed specs fail at the parser stage instead of burying the root cause under secondary compile errors.

### 3. Add regression tests around blocked-stage behavior

Pin the intended semantics:

- malformed spec with parse errors does not proceed to misleading compile assertions in canonical helper paths
- valid specs still run full parse/validate/compile successfully

## Files to Touch

- `packages/engine/src/cnl/compose-gamespec.ts` (modify or reference from new helper)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/engine/test/helpers/diagnostic-helpers.ts` (modify if needed for blocked-stage assertions)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)
- `packages/engine/src/cnl/` (new helper file if preferred)

## Out of Scope

- Replacing low-level parse/validate/compile APIs with one monolith everywhere
- Game-specific event-card fixes
- YAML syntax-linting improvements themselves (covered by parser ticket)

## Acceptance Criteria

### Tests That Must Pass

1. Canonical staged helper returns parse errors and marks later stages blocked when markdown contains fatal YAML parse failures.
2. Valid full-spec inputs still reach validation and compilation successfully through the same helper path.
3. Existing suite: `pnpm -F @ludoforge/engine build`
4. Existing suite: `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`

### Invariants

1. The staged helper remains generic and reusable across games.
2. Later-stage diagnostics must not replace or obscure earlier fatal parse diagnostics in canonical workflows.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — add blocked-stage coverage for malformed parse input and success-path coverage for valid input.
2. `packages/engine/test/helpers/production-spec-helpers.ts` consumer coverage — ensure production helpers follow the new stop-on-parse-error contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
3. `pnpm run check:ticket-deps`
