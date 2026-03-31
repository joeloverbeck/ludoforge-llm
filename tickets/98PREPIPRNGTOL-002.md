# 98PREPIPRNGTOL-002: Compile and validate `preview.tolerateRngDivergence` from profile YAML

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL compiler and validator
**Deps**: 98PREPIPRNGTOL-001

## Problem

Profile YAML can now declare `preview: { tolerateRngDivergence: true }`, but the compiler doesn't read it and the validator doesn't know about the key. This ticket adds compilation and validation so the field flows from authored YAML to `CompiledAgentProfile.preview`.

## Assumption Reassessment (2026-03-31)

1. `compile-agents.ts` compiles `completionGuidance` via `lowerCompletionGuidance()` (line ~588-602) — the `preview` field follows the same pattern.
2. `validate-agents.ts:23` defines `AGENT_PROFILE_KEYS = ['params', 'use', 'completionGuidance']` — must add `'preview'` to allow the key.
3. `validate-agents.ts:192` calls `validateUnknownKeys(profileDef, AGENT_PROFILE_KEYS, ...)` — adding `'preview'` unblocks validation.
4. `GameSpecAgentProfileDef` in `game-spec-doc.ts` may need a `preview?` field if it's a typed interface (need to verify at implementation time).

## Architecture Check

1. **Follows existing pattern**: Mirrors `completionGuidance` compilation — a small lowering function that reads from authored YAML, validates field types, and produces the compiled config.
2. **Agnostic**: No game-specific logic. The compiler reads generic YAML fields.
3. **No shims**: Profiles without `preview` continue to compile identically — the field is optional with default `false`.

## What to Change

### 1. Add `'preview'` to `AGENT_PROFILE_KEYS` in `validate-agents.ts`

```typescript
const AGENT_PROFILE_KEYS = ['params', 'use', 'completionGuidance', 'preview'] as const;
```

### 2. Add `lowerPreviewConfig()` in `compile-agents.ts`

A small function mirroring `lowerCompletionGuidance`:
- Reads `profileDef.preview` if present
- Validates `tolerateRngDivergence` is a boolean (emit diagnostic if not)
- Returns `PreviewToleranceConfig | null`
- Called from the profile compilation loop, result spread into the compiled profile alongside `completionGuidance`

### 3. Update `GameSpecAgentProfileDef` if needed

Add `preview?: { tolerateRngDivergence?: boolean }` to the authored profile type in `game-spec-doc.ts` if it's a typed interface (vs untyped record).

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — if profile type is explicit)

## Out of Scope

- Type/schema definitions (done in 98PREPIPRNGTOL-001)
- Preview runtime behavior (policy-preview.ts) — that's 98PREPIPRNGTOL-003
- Input threading (policy-runtime.ts) — that's 98PREPIPRNGTOL-004
- FITL or Texas Hold'em profile YAML changes — that's 98PREPIPRNGTOL-005
- Any kernel effect execution or move enumeration changes

## Acceptance Criteria

### Tests That Must Pass

1. Profile YAML with `preview: { tolerateRngDivergence: true }` compiles to `CompiledAgentProfile` with `preview.tolerateRngDivergence === true`
2. Profile YAML without `preview` compiles to `CompiledAgentProfile` without `preview` field (or with `undefined`)
3. Profile YAML with `preview: { tolerateRngDivergence: 'not-a-bool' }` emits a compiler diagnostic
4. Profile YAML with `preview: { unknownKey: true }` emits an unknown-key diagnostic (if unknown-key validation is applied)
5. `pnpm turbo typecheck` passes
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Existing profiles without `preview` must compile identically — zero behavioral change
2. No game-specific branching in the compiler
3. The compiled field defaults to `false` when absent (at the consumption site, not stored as explicit `false`)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents.test.ts` — add cases for preview config compilation (present, absent, invalid). If this file doesn't exist, add cases to the nearest compile-agents test file.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern 'compile.*agent'` (or equivalent targeted run)
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
