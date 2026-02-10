# GAMSPECOM-005 - Condition/Value/Query Lowering

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Lower CNL shorthand condition/value/query nodes into kernel-compatible AST forms with deterministic diagnostics for unsupported constructs.

## Implementation Tasks
1. Implement `compile-conditions.ts` with pure lowering helpers for condition/value/query nodes used by effects and action guards.
2. Canonicalize references and selector-bearing query nodes via shared selector utilities.
3. Detect non-representable source constructs and emit `CNL_COMPILER_MISSING_CAPABILITY` with alternatives when available.
4. Add focused unit tests covering valid lowering and missing-capability paths.

## File List (Expected to Touch)
- `src/cnl/compile-conditions.ts` (new)
- `src/cnl/compiler.ts`
- `src/cnl/compiler-diagnostics.ts`
- `test/unit/cnl/compile-conditions.test.ts` (new)

## Out of Scope
- Effect/control-flow lowering (`if`, `forEach`, `let`, `choose*`).
- Binding scope validation.
- Top-level action/trigger assembly.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compile-conditions.test.js`

### Invariants that must remain true
- Lowering functions are deterministic and side-effect free.
- No kernel AST node is produced with unresolved shorthand-only fields.
- Missing-capability diagnostics always include `code`, `path`, `severity`, and `message`.
