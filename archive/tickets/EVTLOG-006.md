# EVTLOG-006: Enforce compiler-owned `macroOrigin` trust boundary in effect lowering

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL macro expansion trust marker, lowering validation, diagnostics, control-flow provenance boundary
**Deps**: None

## Problem

`macroOrigin` is intended to be compiler-internal provenance emitted by macro expansion, but the current lowering path accepts any `macroOrigin` object present in source effect nodes. That allows hand-authored GameSpecDoc content to inject trace provenance data, weakening engine contract integrity and blurring compiler/runtime boundaries.

## Assumption Reassessment (2026-02-20)

1. `compile-effects.ts` currently reads `source.macroOrigin` via `readMacroOrigin(...)` for both `forEach` and `reduce` and forwards it if shape-valid.
2. Invalid `macroOrigin` shape is silently ignored (no diagnostic), rather than rejected.
3. `expand-effect-macros.ts` emits `macroOrigin` on macro-expanded `forEach`/`reduce`, but there is no trusted marker that distinguishes compiler-emitted provenance from user-authored payloads.
4. Existing tests cover positive propagation and macro-origin annotation, but do not enforce trust-boundary rejection semantics (malformed and unauthorized user-authored provenance).

## Architecture Check

1. Treating provenance as compiler-owned data is cleaner than accepting user-authored provenance in DSL input; it prevents semantic spoofing and keeps trust boundaries explicit.
2. Lowering-only validation is insufficient without a trusted source marker; compiler-emitted provenance must be marked before lowering to preserve legitimate trace metadata.
3. This preserves game-agnostic runtime and compiler contracts: GameSpecDoc remains declarative game behavior data, while provenance remains infrastructure metadata.
4. No backward-compatibility shims: invalid or unauthorized provenance should hard-fail with deterministic diagnostics.

## What to Change

### 1. Add compiler-only trust marker during macro expansion

- In `expand-effect-macros.ts`, mark compiler-emitted control-flow provenance with an internal-only trust marker (non-DSL channel).
- Ensure only expansion-authored `macroOrigin` gets the trust marker; user-authored source nodes must not be implicitly trusted.

### 2. Make provenance acceptance strict in lowering

- In `compile-effects.ts`, reject malformed `macroOrigin` on `forEach`/`reduce` with deterministic diagnostics instead of silently dropping it.
- Accept `macroOrigin` only when both shape-valid and trust-marked by compiler expansion.

### 3. Add deterministic diagnostics for boundary violations

- Emit stable path-specific diagnostics for:
  - malformed `macroOrigin` payload
  - unauthorized/untrusted `macroOrigin` payload

## Files to Touch

- `packages/engine/src/cnl/expand-effect-macros.ts` (modify — add trust marker to compiler-emitted provenance)
- `packages/engine/src/cnl/compile-effects.ts` (modify — strict validation + trust gating + diagnostics)
- `packages/engine/src/cnl/macro-origin-trust.ts` (new — shared internal trust-marker helpers)
- `packages/engine/test/unit/compile-effects.test.ts` (modify — malformed/unauthorized provenance tests)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify — assert trust marker is set for compiler-emitted provenance)
- `packages/engine/test/integration/effect-macro-compile.test.ts` (modify — compiler-emitted provenance still passes end-to-end)

## Out of Scope

- Redesigning provenance storage format across compiler stages (covered by EVTLOG-007)
- Expanding provenance to non-control-flow effects

## Acceptance Criteria

### Tests That Must Pass

1. Lowering rejects malformed `forEach.macroOrigin` and `reduce.macroOrigin` with deterministic diagnostics.
2. Lowering rejects untrusted/user-authored provenance payloads.
3. Compiler-emitted provenance from macro expansion remains accepted and propagates successfully.
4. Existing suites: `pnpm turbo lint` and `pnpm turbo test`

### Invariants

1. Provenance fields in effect AST are compiler-owned; user-authored GameSpec content cannot spoof them.
2. Invalid or untrusted provenance never fails open; it always surfaces deterministic diagnostics.
3. Runtime trace semantics remain game-agnostic and independent from presentation-layer conventions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — add rejection tests for malformed/untrusted provenance payloads and acceptance for trusted provenance.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — assert compiler expansion marks provenance as trusted.
3. `packages/engine/test/integration/effect-macro-compile.test.ts` — add regression that macro-emitted provenance still lowers and compiles through pipeline.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/unit/expand-effect-macros.test.ts test/unit/compile-effects.test.ts test/integration/effect-macro-compile.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Added a compiler-only trust marker helper in `packages/engine/src/cnl/macro-origin-trust.ts`.
  - Updated `packages/engine/src/cnl/expand-effect-macros.ts` to mark compiler-emitted `forEach`/`reduce` provenance as trusted and preserve symbol-keyed internal metadata during recursive expansion.
  - Updated `packages/engine/src/cnl/compile-effects.ts` to enforce strict `macroOrigin` validation and trust gating with deterministic diagnostics:
    - `CNL_COMPILER_MACRO_ORIGIN_INVALID`
    - `CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED`
  - Added/updated tests in:
    - `packages/engine/test/unit/compile-effects.test.ts`
    - `packages/engine/test/unit/expand-effect-macros.test.ts`
    - `packages/engine/test/integration/effect-macro-compile.test.ts`
- Deviations from original plan:
  - To make trust markers survive macro recursion, `expandEffectsInNode` had to preserve symbol-keyed properties; this was not explicitly called out in the original ticket text.
  - The ticket’s targeted command using `.ts` paths was incompatible with the repo’s dist-based test runner, so targeted verification was run against compiled `dist` tests after build.
- Verification results:
  - Targeted compiled tests passed:
    - `node --test dist/test/unit/expand-effect-macros.test.js dist/test/unit/compile-effects.test.js dist/test/integration/effect-macro-compile.test.js`
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
