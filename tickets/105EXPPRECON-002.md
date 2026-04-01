# 105EXPPRECON-002: Update compiler to validate preview.mode enum

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compile-agents, compiler-diagnostic-codes
**Deps**: `tickets/105EXPPRECON-001.md`, `specs/105-explicit-preview-contracts.md`

## Problem

The compiler currently validates `preview.tolerateRngDivergence` as a boolean. After ticket 001 introduces `AgentPreviewMode`, the compiler must validate `preview.mode` as an enum, reject reserved modes with descriptive errors, and error when `preview` is present but `mode` is missing.

## Assumption Reassessment (2026-04-01)

1. `compile-agents.ts` has `lowerPreviewConfig()` at ~line 652 that reads `authored.tolerateRngDivergence` and validates as boolean — confirmed.
2. Current error uses `CNL_COMPILER_AGENT_POLICY_EXPR_INVALID` for preview validation — confirmed.
3. `compiler-diagnostic-codes.ts` has one preview code: `CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED` — confirmed. No mode-specific codes exist.
4. When `preview` is omitted, `lowerPreviewConfig` returns `undefined` — compiler currently provides no default. Ticket 001 makes `preview` optional on `CompiledAgentProfile`; the default `{ mode: 'exactWorld' }` must be set here.

## Architecture Check

1. Mode validation is a compile-time concern (Foundation 12: Compiler-Kernel Boundary) — the runtime trusts compiled modes without re-validation.
2. Reserved mode rejection provides forward-compatible extensibility without backwards-compatibility shims (Foundation 14).
3. No game-specific logic — mode validation is generic across all profiles.

## What to Change

### 1. Add new diagnostic codes to `compiler-diagnostic-codes.ts`

```typescript
CNL_COMPILER_AGENT_PREVIEW_MODE_INVALID: 'CNL_COMPILER_AGENT_PREVIEW_MODE_INVALID',
CNL_COMPILER_AGENT_PREVIEW_MODE_RESERVED: 'CNL_COMPILER_AGENT_PREVIEW_MODE_RESERVED',
CNL_COMPILER_AGENT_PREVIEW_MODE_MISSING: 'CNL_COMPILER_AGENT_PREVIEW_MODE_MISSING',
```

### 2. Rewrite `lowerPreviewConfig()` in `compile-agents.ts`

Replace the `tolerateRngDivergence` boolean validation with:

1. If `authored.preview` is `undefined` → return `{ mode: 'exactWorld' }` (default).
2. If `authored.preview` is present but `mode` is missing → emit `CNL_COMPILER_AGENT_PREVIEW_MODE_MISSING` diagnostic, return `undefined`.
3. If `mode` is not a string or not in the valid set (`exactWorld`, `tolerateStochastic`, `disabled`) → emit `CNL_COMPILER_AGENT_PREVIEW_MODE_INVALID`.
4. If `mode` is a reserved value (`infoSetSample`, `enumeratePublicChance`) → emit `CNL_COMPILER_AGENT_PREVIEW_MODE_RESERVED` with message explaining the mode is not yet implemented.
5. Otherwise → return `{ mode }`.

### 3. Update profile lowering call site

Where `lowerPreviewConfig` is called inside `lowerProfiles`, ensure the result is always set on the compiled profile (since the default is now `{ mode: 'exactWorld' }` rather than `undefined`).

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)

## Out of Scope

- Runtime mode-based branching in `policy-preview.ts` (ticket 003)
- Trace changes (ticket 004)
- YAML data migration (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. Reserved mode (`infoSetSample`) produces compile error with descriptive message
2. Invalid mode value (e.g., `"foo"`) produces compile error
3. `preview` present without `mode` produces compile error
4. `preview.mode: 'exactWorld'` compiles successfully
5. `preview.mode: 'tolerateStochastic'` compiles successfully
6. `preview.mode: 'disabled'` compiles successfully
7. Omitted `preview` defaults to `{ mode: 'exactWorld' }`
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All three new diagnostic codes are used and tested
2. Default mode is `exactWorld` when `preview` is omitted — strictest default
3. No backwards-compatibility path for `tolerateRngDivergence` — it is fully removed

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-authoring.test.ts` — replace `tolerateRngDivergence` compilation tests with mode validation tests (reserved, invalid, missing, valid modes, default)

### Commands

1. `node --test packages/engine/dist/test/unit/cnl/compile-agents-authoring.test.js`
2. `pnpm turbo build && pnpm turbo test`
