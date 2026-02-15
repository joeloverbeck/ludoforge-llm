# GAMESPECDOC-003: Derived Domain Primitives from Vars/Tracks

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium  
**Backwards Compatibility**: None (new canonical modeling pattern)

## What To Change / Add

Add generic domain primitives to remove hardcoded numeric duplication in action params.

1. Introduce query/domain forms that derive integer ranges from declared game variables/tracks (e.g., var min/max metadata).
2. Keep primitives fully game-agnostic (no FITL-specific IDs or branch logic).
3. Update compiler/runtime evaluation and validation for these new forms.
4. Migrate applicable production spec usages that duplicate track caps in action param domains.

## Invariants

1. Domain bounds sourced from variable/track declarations are single-source-of-truth.
2. Changing a variable/track cap automatically updates derived parameter domains without per-action edits.
3. Derived domains remain deterministic and validation-safe.
4. No game-specific behavior is embedded in compiler/kernel.

## Tests

1. **Unit**: derived-domain query resolves to declared var/track bounds.
2. **Unit**: missing/non-integer source var for derived domain yields explicit diagnostic.
3. **Integration**: migrated action(s) compile and legal-move domains align with track bounds.
4. **Regression**: existing static-domain actions still compile and behave identically.
