# GAMEDEFGEN-021: Canonical Runtime Reason Taxonomy Across Kernel Errors

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Define one canonical runtime reason taxonomy module for all kernel runtime error reasons (not only legality outcomes).
2. Remove scattered reason string literals (for example selector invalid-spec reason, pipeline evaluation reasons, and related runtime error reason tags) and replace them with canonical typed reason constants/unions.
3. Ensure runtime helpers and error emitters consume canonical reason exports instead of inlined strings.
4. Preserve behavior and message semantics while eliminating reason drift and aliasing.

## 2) Invariants That Should Pass

1. Runtime reason values are owned in one canonical module and imported everywhere else.
2. No duplicate semantic reasons exist under different strings.
3. Runtime reason taxonomy remains engine-generic and reusable across game specs.
4. Existing runtime error behavior remains stable while reason ownership becomes canonical.

## 3) Tests That Should Pass

1. Unit: canonical reason registry tests assert expected reason set and mappings.
2. Unit: runtime error producers (`selector`, `pipeline`, `illegal move` paths) emit only canonical reason members.
3. Unit: parity tests confirm equivalent failures across surfaces retain consistent canonical reasons.
4. Regression: existing legality/runtime-contract suites pass with canonical reason ownership enforced.

