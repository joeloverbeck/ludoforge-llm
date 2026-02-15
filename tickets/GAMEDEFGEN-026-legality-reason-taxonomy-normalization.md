# GAMEDEFGEN-026: Legality Reason Taxonomy Normalization

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What must be added/fixed

1. Extend legality reason taxonomy to represent distinct failure classes that are currently collapsed (for example atomic cost validation failure vs legality predicate failure).
2. Normalize mapping rules between:
   - `ChoiceIllegalReason`
   - legal move exclusion reasons
   - `applyMove` illegal metadata/reason codes
3. Eliminate lossy reason translation that prevents precise diagnostics.
4. Keep backward compatibility out of scope: update all affected tests/contracts to the normalized taxonomy.

## 2) Invariants that must pass

1. Each distinct viability failure class has one canonical reason identity.
2. Reason projection between surfaces is deterministic and non-lossy.
3. Illegal reason payloads remain machine-comparable and stable for regression tests.
4. No game-specific reason branches are introduced.

## 3) Tests that must pass

1. Unit: exhaustive mapping table test for all legality outcomes and metadata projections.
2. Unit: parity tests assert that identical root causes map to aligned reasons across surfaces.
3. Unit/Integration: atomic cost-failure scenarios assert dedicated taxonomy values (not legality-failed aliases).
4. Regression: existing move legality and pipeline policy tests pass after taxonomy migration.
