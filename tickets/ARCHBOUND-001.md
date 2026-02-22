# ARCHBOUND-001: Enforce GameSpecDoc vs Visual Config Data Boundaries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — compiler validation and schema guardrails
**Deps**: None

## Problem

The architecture requires game-specific simulation data in `GameSpecDoc` and presentation data in `visual-config.yaml`, but current tooling does not fully enforce this separation. Without explicit boundary checks, simulation logic can drift into visual config or visual-only data can leak into runtime-agnostic game contracts.

## Assumption Reassessment (2026-02-22)

1. Current runner tests validate visual config structure and runtime IDs, but do not fully enforce cross-file boundary ownership with compiler-level errors.
2. `GameDef` and simulation/kernel are intended to remain game-agnostic; no per-game schema ownership should leak into shared contracts.
3. Mismatch: architectural rule is clear, enforcement is partial; this ticket adds explicit validation failures and CI checks.

## Architecture Check

1. Explicit boundary validators are cleaner than relying on conventions and review discipline.
2. This protects the agnostic engine boundary by rejecting cross-layer leakage at compile/validation time.
3. No compatibility aliases should be introduced; invalid mixed-boundary data must fail fast.

## What to Change

### 1. Define enforceable boundary rules

- Formalize allowed categories for `GameSpecDoc` (simulation/rules/data assets) versus `visual-config.yaml` (presentation/layout/animation styling).
- Specify prohibited fields and patterns for each side.

### 2. Implement validation hooks

- Add compiler or preflight validators that fail when visual-only payload appears in GameSpecDoc or simulation-critical payload appears in visual config.
- Produce actionable error messages pointing to offending field paths.

### 3. Add representative fixtures and regression tests

- Add positive fixtures that respect boundaries and compile/run successfully.
- Add negative fixtures that intentionally violate boundaries and fail with deterministic diagnostics.

## Files to Touch

- `packages/engine/src/**` (modify — validation/compile pipeline files to be identified during assumption reassessment)
- `packages/engine/schemas/**` (modify — only if shared contracts need boundary metadata)
- `packages/runner/src/config/**` (modify — visual config validation entry points as needed)
- `packages/engine/test/**` (modify/add — boundary validation tests)
- `packages/runner/test/config/**` (modify/add — visual-config boundary tests)
- `docs/**` or `specs/**` (modify — contract documentation updates)

## Out of Scope

- New game-specific rule implementations.
- UI redesign work.
- Backward compatibility for previously invalid mixed-boundary configs.

## Acceptance Criteria

### Tests That Must Pass

1. Invalid boundary-crossing examples fail with precise diagnostics.
2. Existing canonical games pass validation unchanged when compliant.
3. Compiler/runtime tests confirm no game-specific branching was added to agnostic layers.
4. Existing suites: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/runner test`

### Invariants

1. `GameSpecDoc` remains the source of simulation/rules data required for execution.
2. `visual-config.yaml` remains presentation-only and non-authoritative for simulation behavior.
3. `GameDef` and simulation pipeline remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/**` — boundary violation compile/validation tests.
2. `packages/runner/test/config/**` — visual config ownership and prohibition tests.
3. Fixture updates in `packages/**/test/fixtures/**` as needed for positive/negative cases.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`
