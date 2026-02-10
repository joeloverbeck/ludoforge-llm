# GAMSPECOM-006 - Effect Lowering and Binding Scope Validation

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Compile effect arrays into kernel AST while enforcing lexical binding rules for params and nested binders (`forEach`, `let`, `chooseOne`, `chooseN`).

## Implementation Tasks
1. Create `compile-effects.ts` for deterministic effect-node lowering.
2. Implement lexical scope stack tracking for bound identifiers.
3. Validate reference usage and emit blocking diagnostics for unbound `$name`.
4. Emit `CNL_COMPILER_BINDING_SHADOWED` warnings on inner shadowing.
5. Add alternatives/suggestions for unbound names based on nearest in-scope bindings.
6. Add unit tests for nested valid scopes, unbound reference failures, and shadow warnings.

## File List (Expected to Touch)
- `src/cnl/compile-effects.ts` (new)
- `src/cnl/compiler.ts`
- `src/cnl/compiler-diagnostics.ts`
- `test/unit/cnl/compile-bindings.test.ts` (new)
- `test/unit/cnl/compile-effects.test.ts` (new)

## Out of Scope
- Zone owner materialization.
- Board macro expansion.
- Action/trigger/end-condition top-level assembly.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compile-effects.test.js`
- `node --test dist/test/unit/cnl/compile-bindings.test.js`

### Invariants that must remain true
- Action parameters are visible only in that action’s `pre`, `cost`, and `effects` scopes.
- Binder scope is restricted to nested effect arrays and cannot leak outward.
- Unbound binding references are blocking errors and produce deterministic alternatives ordering.
- Shadowing is warning-level, not error-level.
