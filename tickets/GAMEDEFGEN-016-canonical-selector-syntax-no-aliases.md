# GAMEDEFGEN-016: Canonical Selector Syntax (No Aliases)

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Define one canonical selector vocabulary for GameSpecDoc player selectors and enforce it uniformly in compiler normalization and validation.
2. Remove selector aliases that create dual spellings for the same meaning (for example `activePlayer` vs `active`) and require only canonical spellings.
3. Ensure diagnostics for non-canonical selector tokens are explicit, deterministic, and include the canonical replacement.
4. Keep selector syntax engine-generic and reusable across games; do not add game-specific exceptions.
5. Document canonical selector tokens in compiler-facing docs/spec references used by GameSpec authors.

## 2) Invariants That Should Pass

1. Every accepted selector token has exactly one canonical textual representation.
2. Non-canonical selector aliases fail compilation with deterministic diagnostics.
3. Runtime receives only canonical selector forms from compiled GameDefs.
4. No game-specific selector branches are introduced in compiler or kernel.

## 3) Tests That Should Pass

1. Unit: selector normalization accepts canonical tokens and rejects alias tokens with stable diagnostic code/path/message/suggestion.
2. Unit: compile flows using alias selector tokens fail deterministically at expected paths.
3. Unit: compile flows using canonical tokens still compile and lower to expected canonical selector AST.
4. Regression: selector-related compiler/runtime test suites pass with alias handling removed.
