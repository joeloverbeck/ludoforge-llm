# 160PEROPTPREV-003: `preview.inner` config schema, compiler validation, `INNER_PREVIEW_HARD_CAP`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `schemas/GameDef.schema.json`, `cnl/compile-agents.ts`, `agents/policy-evaluation-core.ts`
**Deps**: `specs/160-per-option-preview-inner-microturns.md`

## Problem

Spec 160 introduces an opt-in `preview.inner` configuration block that operators declare per profile to enable per-option preview at inner microturns. The block must:

- Live in the `preview` config schema alongside existing fields (`mode`, `completion`, `completionDepthCap`, etc.).
- Default to disabled — existing profiles must produce byte-identical traces compared to the pre-Spec-160 baseline.
- Enforce a triple-product hard cap (`maxOptions × chooseNBeamWidth × depthCap ≤ INNER_PREVIEW_HARD_CAP = 256`) at compile time so runtime cost is bounded by Foundation 10.

This ticket lands the schema, types, compile-time validation, and constant declaration. No runtime consumer reads the new fields yet — wiring lands in tickets 005-008.

## Assumption Reassessment (2026-05-06)

1. The current `preview` config in `packages/engine/schemas/GameDef.schema.json:2251-2338` carries `mode`, `completion`, `fallbackCompletionPolicy`, `completionDepthCap`, `budget`, `phase1`, `phase1CompletionsPerAction`. No `inner` field exists today.
2. `lowerPreviewConfig` is a module-private function at `packages/engine/src/cnl/compile-agents.ts:762`, called once at line 699 — the canonical place to extend.
3. The runtime preview config types live in `packages/engine/src/agents/policy-evaluation-core.ts` (per spec §1).
4. No constant `INNER_PREVIEW_HARD_CAP` exists today.

## Architecture Check

1. **Bounded computation** (Foundation 10): the triple-product hard cap is enforced at compile time, not runtime. Validated profiles cannot exceed the cap.
2. **No backwards compatibility** (Foundation 14): default `preview.inner.chooseOne: false` is a feature-flag default, not a shim. Existing profiles silently inherit defaults; no migration is required because no existing profile declares the field.
3. **Single source of truth**: the `INNER_PREVIEW_HARD_CAP = 256` constant lives in `compile-agents.ts` alongside existing preview-budget constants. `lowerPreviewConfig` is the sole consumer.

## What to Change

### 1. Schema additions to `GameDef.schema.json`

Add a `preview.inner` object property to the `preview` config schema at `packages/engine/schemas/GameDef.schema.json:2251`:

```json
"inner": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "chooseOne": { "type": "boolean", "default": false },
    "chooseNStep": { "type": "boolean", "default": false },
    "maxOptions": { "type": "integer", "minimum": 1 },
    "chooseNBeamWidth": { "type": "integer", "minimum": 1 },
    "depthCap": { "type": "integer", "minimum": 1 }
  }
}
```

### 2. Runtime types in `policy-evaluation-core.ts`

Extend the `CompiledAgentProfile['preview']` shape (or its nearest analog) to include an optional `inner` field with the same structure as the schema. Defaults are applied at lowering time.

### 3. `INNER_PREVIEW_HARD_CAP` constant in `compile-agents.ts`

Declare near other preview-budget constants in `packages/engine/src/cnl/compile-agents.ts`:

```ts
const INNER_PREVIEW_HARD_CAP = 256;
```

### 4. Extend `lowerPreviewConfig`

Extend the function at `packages/engine/src/cnl/compile-agents.ts:762` to:

- Read the `preview.inner` block (defaulting `chooseOne`/`chooseNStep` to `false`; `maxOptions`/`chooseNBeamWidth`/`depthCap` to sentinel `1` when absent so the triple product is well-defined).
- Compute `triple = maxOptions × chooseNBeamWidth × depthCap`.
- If `triple > INNER_PREVIEW_HARD_CAP`, push a compile-time error diagnostic with code `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` describing the overflow.
- Return the lowered `preview.inner` shape on the compiled profile.

### 5. Diagnostic code registration

Register `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` in the diagnostic-codes module (verify exact path during implementation; existing pattern lives near other `CNL_COMPILER_AGENT_PREVIEW_*` codes per the warning convention used in `validate-agents.ts:158-164`).

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify — add `preview.inner` block)
- `packages/engine/src/cnl/compile-agents.ts` (modify — extend `lowerPreviewConfig`; declare `INNER_PREVIEW_HARD_CAP`)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — extend `CompiledAgentProfile['preview']` shape)
- Diagnostic-codes module (modify — register new code; verify exact path during implementation, e.g., `packages/engine/src/cnl/diagnostic-codes.ts` or similar)
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (new — triple-product cap; default-off lowering)

## Out of Scope

- Compile-time warning for opt-in without consideration — ticket 008.
- Runtime consumption of `preview.inner` — tickets 005, 006, 007.
- `preview.option.*` ref family — ticket 004.

## Acceptance Criteria

### Tests That Must Pass

1. New: a profile with `preview.inner.maxOptions: 8, chooseNBeamWidth: 8, depthCap: 8` (= 512 > 256) fails compilation with the triple-product diagnostic.
2. New: a profile with `preview.inner.maxOptions: 4, chooseNBeamWidth: 4, depthCap: 4` (= 64) compiles successfully.
3. New: a profile without a `preview.inner` block compiles to a profile whose `preview.inner` is undefined (or default-off equivalent).
4. Existing `pnpm -F @ludoforge/engine test`.
5. `pnpm turbo schema:artifacts`.

### Invariants

1. (architectural-invariant) `INNER_PREVIEW_HARD_CAP === 256`. Updates require spec amendment.
2. (architectural-invariant) Schema validation rejects `preview.inner.maxOptions: 0` (must be ≥ 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (new) — `architectural-invariant`. Triple-product cap enforcement; default-off lowering invariance.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/compile-preview-inner.test.js`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test`
