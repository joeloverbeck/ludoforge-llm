# GAMEDEFGEN-015: Expand Selector Contract Enforcement to Additional Selector Surfaces

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) What To Fix / Add

1. Extend unified selector contract enforcement beyond action actor/executor into additional selector-bearing surfaces (for example zone-owner qualifiers, turn-flow selector objects, trigger selector-like inputs).
2. Normalize these surfaces to use shared contract infrastructure and diagnostics style.
3. Remove ad-hoc one-off selector checks where equivalent registry-backed checks can be used.
4. Keep all contracts generic and reusable across games and future GameSpecDoc capabilities.

## 2) Invariants That Should Pass

1. Selector-bearing surfaces follow one consistent enforcement model and diagnostic convention.
2. Contract drift between modules is eliminated for newly covered selector surfaces.
3. Valid existing specs remain valid; invalid specs fail earlier with clearer diagnostics.
4. No game-specific branching is introduced in compiler/kernel selector enforcement.

## 3) Tests That Should Pass

1. Unit: each newly-covered selector surface has explicit valid/invalid contract tests.
2. Unit: diagnostics for newly-covered surfaces are deterministic (code/path/message).
3. Integration: representative GameSpecDoc flows that touch these surfaces compile and execute correctly.
4. Regression: existing selector suites continue passing without loosening strictness.
