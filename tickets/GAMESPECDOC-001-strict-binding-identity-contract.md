# GAMESPECDOC-001: Strict Binding Identity Contract (No Aliasing)

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium  
**Backwards Compatibility**: None (intentional breaking change)

## What To Change / Add

Define and enforce one canonical binding naming contract across GameSpecDoc and runtime:

1. Binding names used by action params, `bind` declarations, and `{ ref: binding, name: ... }` references must follow one strict style with no implicit aliasing.
2. Remove any remaining implicit normalization/alias behavior between compile-time and runtime binding names.
3. Add compiler diagnostics that explicitly report binding-style violations and unknown binding references with actionable guidance.
4. Update docs/spec comments to state the binding contract as normative for all games.

Suggested strict rule (recommended):
- Declared binding identifiers (`params[].name`, `bind`) must begin with `$`.
- Binding references must match declared identifiers exactly.

## Invariants

1. Compile-time and runtime binding lookup semantics are identical.
2. No implicit conversion between `name` and `$name` exists anywhere.
3. Any binding reference that does not exactly match a declared in-scope binding fails deterministically at compile-time.
4. Diagnostics for binding mismatches are stable and explicit.

## Tests

1. **Unit**: valid action using canonical binding style compiles and executes.
2. **Unit**: non-canonical declaration style is rejected with a dedicated diagnostic.
3. **Unit**: reference mismatch (`$x` declared, `x` referenced or inverse) is rejected.
4. **Unit**: nested scope shadowing still resolves by exact name and scope.
5. **Integration**: production spec compiles after migration to canonical style.
