# 103ACTTAGCAN-007: Diagnostic codes, schema artifacts, and full verification

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `compiler-diagnostic-codes.ts`, schema artifacts
**Deps**: `archive/tickets/103ACTTAGCAN-001.md`, `tickets/103ACTTAGCAN-002.md`, `tickets/103ACTTAGCAN-003.md`, `tickets/103ACTTAGCAN-004.md`, `tickets/103ACTTAGCAN-005.md`, `tickets/103ACTTAGCAN-006.md`, `specs/103-action-tags-and-candidate-metadata.md`

## Problem

New diagnostic codes used by tag validation and compilation must be registered in the canonical diagnostic codes registry to pass the diagnostic registry audit test. Schema artifacts must be regenerated and verified idempotent. Full verification must pass.

## Assumption Reassessment (2026-04-01)

1. `compiler-diagnostic-codes.ts` exists with `COMPILER_DIAGNOSTIC_CODES_COMPILER_CORE` object — confirmed. New tag-related codes must be added here if they use the `CNL_COMPILER_*` prefix.
2. The diagnostic registry audit test (`compiler-diagnostic-registry-audit.test.ts`) forbids inline `CNL_COMPILER_*` diagnostic string literals outside canonical registries — confirmed.
3. `schema:artifacts:check` validates schema artifacts are in sync — confirmed.
4. `CNL_VALIDATOR_*` codes (used in validation) do not need registry entries — confirmed from Spec 106 experience.

## Architecture Check

1. All `CNL_COMPILER_*` diagnostic codes registered in the canonical registry — consistent with codebase conventions.
2. Schema artifacts regenerated from Zod schemas — the action tag types added in tickets 001-002 automatically flow into the JSON schema.
3. Full verification is the final gate before the spec is considered complete.

## What to Change

### 1. Register diagnostic codes in `compiler-diagnostic-codes.ts`

Add any new `CNL_COMPILER_*` codes emitted by tag compilation (ticket 003) or ref resolution (ticket 005). Exact codes depend on implementation — typical candidates:
- `CNL_COMPILER_ACTION_TAG_EMPTY` — empty tag string
- `CNL_COMPILER_ACTION_TAG_DUPLICATE` — duplicate tag on same action
- `CNL_COMPILER_ACTION_TAG_INVALID_FORMAT` — tag name not kebab-case
- `CNL_COMPILER_CANDIDATE_TAG_DEAD_REF` — tag ref to nonexistent tag (warning)

### 2. Regenerate schema artifacts

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

### 3. Update golden fixtures

Update any golden fixtures affected by:
- New `actionTagIndex` field on compiled GameDef
- Changed agent profile shape (removed `is<Action>` features)
- Updated `AGENT_POLICY_CANDIDATE_INTRINSICS` (removed `isPass`)

### 4. Full verification

Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify — if affected)
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (modify — if affected)
- `packages/engine/test/fixtures/trace/*.golden.json` (modify — if affected)

## Out of Scope

- New feature work — this is a cleanup/verification ticket
- Runner or simulator changes

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostic registry audit test passes (no inline `CNL_COMPILER_*` literals outside canonical registries)
2. `schema:artifacts:check` passes (idempotent)
3. `pnpm turbo build` — build succeeds
4. `pnpm turbo test` — all tests pass
5. `pnpm turbo lint` — lint passes (0 warnings)
6. `pnpm turbo typecheck` — typecheck passes

### Invariants

1. All `CNL_COMPILER_*` diagnostic codes are in the canonical registry
2. Schema artifacts are always in sync with Zod schemas

## Test Plan

### New/Modified Tests

1. No new test files — verification of existing tests and diagnostic audit

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate schemas
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` — full verification
