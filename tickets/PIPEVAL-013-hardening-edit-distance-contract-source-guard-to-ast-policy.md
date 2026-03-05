# PIPEVAL-013: Harden edit-distance contract source guard to AST policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test policy hardening in contracts/lint guard
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-010-consolidate-edit-distance-contract-utility.md`

## Problem

Current anti-drift guard for edit-distance ownership relies on raw string matching and symbol-name regex checks. This can miss structural duplication (for example reimplemented distance logic under different helper names) and can produce false confidence.

## Assumption Reassessment (2026-03-05)

1. `packages/engine/test/unit/lint/contracts-edit-distance-source-guard.test.ts` currently checks imports/call usage via `source.includes(...)`.
2. The same policy uses a name-based regex for local `levenshteinDistance` definitions, but does not detect semantically duplicated local distance logic under alternate names.
3. Existing repository lint policy patterns include AST-based ownership guards (for example linked-window guard), so this ticket should align to those stronger mechanisms.

## Architecture Check

1. AST-based policy checks are cleaner and more robust than string matching because they validate structure and call relationships, not incidental text.
2. This work is test-policy-only and does not introduce any game-specific logic into GameDef/runtime/simulation.
3. No backwards-compatibility aliases or shims are introduced; this tightens architectural enforcement only.

## What to Change

### 1. Replace string-based policy assertions with AST checks

Upgrade `contracts-edit-distance-source-guard.test.ts` to parse target files and enforce import ownership and disallowed local edit-distance implementations structurally.

### 2. Enforce non-canonical module ownership at contracts scope

Scan `src/contracts/*.ts` (excluding canonical `edit-distance-contract.ts`) and fail if local edit-distance implementations are present or if non-canonical modules bypass the shared utility.

## Files to Touch

- `packages/engine/test/unit/lint/contracts-edit-distance-source-guard.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify, if helper extraction is needed)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify, if helper extraction is needed)

## Out of Scope

- Changing edit-distance algorithm behavior
- Changing suggestion copy, diagnostic taxonomy, or ranking thresholds/limits
- Any GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Source guard fails when a non-canonical contract module introduces local edit-distance logic (even under non-`levenshteinDistance` names).
2. Source guard fails when canonical consumer modules stop importing/using shared edit-distance utilities.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Edit-distance ownership remains centralized in `src/contracts/edit-distance-contract.ts`.
2. Contracts policy enforcement remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/contracts-edit-distance-source-guard.test.ts` — replace text-fragile checks with AST-enforced ownership and anti-duplication checks.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/contracts-edit-distance-source-guard.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
