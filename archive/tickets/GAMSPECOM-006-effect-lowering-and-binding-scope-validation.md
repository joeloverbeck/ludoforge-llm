# GAMSPECOM-006 - Effect Lowering and Binding Scope Validation

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Compile effect arrays into kernel AST while enforcing lexical binding rules for action params and nested binders that introduce nested effect blocks (`forEach`, `let`).

## Assumptions Reassessment (2026-02-10)
- `src/cnl/compiler.ts` currently performs macro expansion only. Full `GameSpecDoc -> GameDef` lowering is intentionally not implemented yet and still returns `CNL_COMPILER_NOT_IMPLEMENTED`.
- `src/cnl/compile-effects.ts` does not exist yet.
- Existing lowering helpers exist in `src/cnl/compile-conditions.ts`, `src/cnl/compile-selectors.ts`, and `src/cnl/compile-zones.ts`.
- Current unit tests live under `test/unit/` (not `test/unit/cnl/`).
- Current kernel `EffectAST` shape does not model nested effect arrays for `chooseOne`/`chooseN`; they are not lexical block binders in this codebase.

## Implementation Tasks
1. Create `compile-effects.ts` for deterministic effect-node lowering.
2. Implement lexical scope stack tracking for bound identifiers.
3. Validate reference usage and emit blocking diagnostics for unbound `$name`.
4. Emit `CNL_COMPILER_BINDING_SHADOWED` warnings on inner shadowing.
5. Add alternatives/suggestions for unbound names based on nearest in-scope bindings.
6. Add unit tests for nested valid scopes, unbound reference failures, and shadow warnings.

## Updated Scope For This Ticket
- In scope:
  - Lower supported effect nodes into kernel `EffectAST` using existing selector/condition/value/query lowering helpers.
  - Enforce lexical scope for action params + `forEach.bind` + `let.bind` across nested effect arrays.
  - Validate binding references in value/condition/query trees and binding-like effect fields (e.g. token selectors like `$tok`) when applicable.
  - Emit deterministic unbound diagnostics with deterministic alternatives ordering.
  - Emit warning-level shadow diagnostics when nested `forEach`/`let` binders shadow an existing in-scope name.
- Out of scope clarification:
  - Changing runtime semantics for `chooseOne`/`chooseN`.
  - Wiring full effect lowering into `compileGameSpecToGameDef` before subsequent tickets complete semantic compilation stages.

## File List (Expected to Touch)
- `src/cnl/compile-effects.ts` (new)
- `src/cnl/compile-conditions.ts`
- `src/cnl/index.ts`
- `test/unit/compile-bindings.test.ts` (new)
- `test/unit/compile-effects.test.ts` (new)

## Out of Scope
- Zone owner materialization.
- Board macro expansion.
- Action/trigger/end-condition top-level assembly.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compile-effects.test.js`
- `node --test dist/test/unit/cnl/compile-bindings.test.js`

### Corrected test paths
- `node --test dist/test/unit/compile-effects.test.js`
- `node --test dist/test/unit/compile-bindings.test.js`

### Invariants that must remain true
- Action parameters are visible only in that action’s `pre`, `cost`, and `effects` scopes.
- Binder scope is restricted to nested effect arrays and cannot leak outward.
- Unbound binding references are blocking errors and produce deterministic alternatives ordering.
- Shadowing is warning-level, not error-level.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added `src/cnl/compile-effects.ts` with deterministic lowering for supported effect nodes.
  - Added lexical binding scope validation for action-param/in-scope bindings and nested `forEach`/`let` binders.
  - Added warning diagnostic emission for binder shadowing (`CNL_COMPILER_BINDING_SHADOWED`).
  - Added blocking unbound-binding diagnostics with deterministic alternatives (`CNL_COMPILER_BINDING_UNBOUND`).
  - Extended `src/cnl/compile-conditions.ts` so `{ ref: "binding" }` checks optional in-scope bindings during lowering.
  - Exported the new lowering API from `src/cnl/index.ts`.
  - Added tests in `test/unit/compile-effects.test.ts` and `test/unit/compile-bindings.test.ts`.
- Deviations from original plan:
  - `chooseOne`/`chooseN` were not treated as nested lexical binders because current kernel AST/runtime does not model nested effect bodies for them.
  - `compileGameSpecToGameDef` integration remains out of scope for this ticket and is still handled by later compiler tickets.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/compile-effects.test.js`
  - `node --test dist/test/unit/compile-bindings.test.js`
  - `node --test dist/test/unit/compile-conditions.test.js`
  - `npm test`
