# GAMESPECDOC-001: Strict Binding Identity Contract (No Aliasing)

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Backwards Compatibility**: None (intentional strictness increase)

## Assumption Reassessment (2026-02-15)

### What the codebase does today

1. There is already **no implicit aliasing** between `name` and `$name` at runtime lookup.
2. Compiler binding-scope validation is **inconsistent by surface**:
   - `{ ref: 'binding', name: ... }` and `{ query: 'binding', name: ... }` are scope-validated.
   - Several string binding surfaces in effects/selectors validate only when the value starts with `$`, which lets some unbound non-`$` references pass compile-time and fail later.
3. First-party specs/tests currently use **both** prefixed and non-prefixed binding declarations intentionally.

### Architectural decision

The previous suggested rule (`all declarations must start with $`) is a style migration, not the core correctness contract.

For long-term robustness, this ticket will enforce the deeper invariant instead:
- **Binding identity is exact string equality across compile-time and runtime.**
- **All binding references must be validated at compile-time on every binding-aware surface.**
- **No normalization, aliasing, or prefix-based fallback anywhere.**

This provides deterministic behavior and compiler/runtime parity without a large syntax churn across unrelated game data.

## What To Change / Add

1. Enforce a single identity contract for all bindings:
   - Declarations (`params[].name`, `bind`, `countBind`, `remainingBind`, etc.) create exact binding identifiers.
   - References must match the exact declared identifier.
2. Remove prefix-gated validation behavior so binding validation is strict and uniform regardless of identifier style.
3. Add compiler diagnostics for unknown binding references on all binding-aware string surfaces with actionable alternatives.
4. Update docs/spec comments in this ticket to make the exact-name contract normative.

## Invariants

1. Compile-time and runtime binding lookup semantics are identical.
2. No implicit conversion between any binding spellings exists anywhere.
3. Any binding reference that does not exactly match a declared in-scope binding fails deterministically at compile-time.
4. Diagnostics for binding mismatches are stable and explicit.

## Tests

1. **Unit**: valid action/effect using exact matching declarations/references compiles and executes.
2. **Unit**: unbound binding on a binding-aware string surface (for example token-binding fields) is rejected at compile-time even when not `$`-prefixed.
3. **Unit**: mismatch (`$x` declared, `x` referenced or inverse) is rejected.
4. **Unit**: nested scope shadowing still resolves by exact name and scope.
5. **Integration**: production spec compile remains green after strict validation changes (no alias path introduced).

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Compiler binding validation on binding-only string surfaces now enforces exact in-scope identifier matching for all names (not only `$`-prefixed names).
  - Added unit coverage for non-`$` binding validation behavior and explicit `$x` vs `x` mismatch rejection.
  - Updated one production event-card effect to use explicit bound-token movement (`forEach` + `moveToken`) instead of a raw token literal, aligning production data with the strict binding contract.
- **Deviations from original plan**:
  - Did **not** enforce a global "`$`-prefix-only" naming style across all declarations. Reassessment showed this would be a large syntax migration without adding core semantic guarantees beyond exact-name identity.
  - Focused scope on architectural correctness: deterministic compile/runtime identity contract and uniform compiler enforcement.
- **Verification**:
  - `node --test dist/test/unit/compile-bindings.test.js dist/test/unit/compile-actions.test.js`
  - `npm test`
  - `npm run lint`
