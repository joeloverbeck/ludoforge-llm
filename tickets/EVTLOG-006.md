# EVTLOG-006: Enforce compiler-owned macroOrigin boundary in effect lowering

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering validation, diagnostics, control-flow provenance boundary
**Deps**: None

## Problem

`macroOrigin` is intended to be compiler-internal provenance emitted by macro expansion, but the current lowering path accepts any `macroOrigin` object present in source effect nodes. That allows hand-authored GameSpecDoc content to inject trace provenance data, weakening engine contract integrity and blurring compiler/runtime boundaries.

## Assumption Reassessment (2026-02-20)

1. `compile-effects.ts` currently reads `source.macroOrigin` via `readMacroOrigin(...)` for both `forEach` and `reduce` and forwards it if shape-valid.
2. Invalid `macroOrigin` shape is silently ignored (no diagnostic), rather than rejected.
3. `expand-effect-macros.ts` now emits `macroOrigin` on macro-expanded `forEach`/`reduce`, so compiler-origin metadata exists and can be validated strictly.
4. Current tests cover positive propagation but do not cover malformed or user-authored `macroOrigin` rejection semantics.

## Architecture Check

1. Treating provenance as compiler-owned data is cleaner than accepting user-authored provenance in DSL input; it prevents semantic spoofing and keeps trust boundaries explicit.
2. This preserves game-agnostic runtime and compiler contracts: GameSpecDoc remains declarative game behavior data, while provenance remains infrastructure metadata.
3. No backward-compatibility shims: invalid or unauthorized provenance should hard-fail with deterministic diagnostics.

## What to Change

### 1. Make provenance acceptance strict in lowering

- In `compile-effects.ts`, reject malformed `macroOrigin` on `forEach`/`reduce` with deterministic `CNL_COMPILER_MISSING_CAPABILITY` (or dedicated diagnostic code) instead of silently dropping it.
- Add explicit guard that only compiler-originated provenance markers are accepted (implementation detail may rely on follow-up metadata channel from EVTLOG-007; until then, explicitly reject provenance in user-specified sections where origin cannot be trusted).

### 2. Add deterministic diagnostics for boundary violations

- Emit stable path-specific diagnostics for:
  - malformed `macroOrigin` payload
  - unauthorized/user-authored `macroOrigin` payload

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify — strict validation + diagnostics)
- `packages/engine/test/unit/compile-effects.test.ts` (modify — malformed/unauthorized provenance tests)
- `packages/engine/test/integration/effect-macro-compile.test.ts` (modify — compiler-emitted provenance still passes end-to-end)

## Out of Scope

- Redesigning provenance storage format across compiler stages (covered by EVTLOG-007)
- Expanding provenance to non-control-flow effects

## Acceptance Criteria

### Tests That Must Pass

1. Lowering rejects malformed `forEach.macroOrigin` and `reduce.macroOrigin` with deterministic diagnostics.
2. Lowering rejects unauthorized/user-authored provenance payloads.
3. Compiler-emitted provenance from macro expansion still propagates successfully.
4. Existing suites: `pnpm turbo test`

### Invariants

1. Provenance fields in effect AST are compiler-owned; user-authored GameSpec content cannot spoof them.
2. Invalid provenance never fails open; it always surfaces deterministic diagnostics.
3. Runtime trace semantics remain game-agnostic and independent from presentation-layer conventions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — add rejection tests for malformed/unauthorized provenance payloads.
2. `packages/engine/test/integration/effect-macro-compile.test.ts` — add regression that macro-emitted provenance still lowers and compiles.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/unit/compile-effects.test.ts test/integration/effect-macro-compile.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

