# AGNOSTIC-010: Explicit Token Visual Ownership Contract (Remove Runner Heuristics)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Engine + runner
**Deps**: None

## What Needs to Change

1. Define a game-agnostic data contract for token visual ownership/faction identity in compiled `GameDef`.
2. Remove runner-only inference heuristics based on token type prefixes and alias normalization.
3. Ensure compilation/validation emits deterministic token visual identity fields consumable by runner render model.
4. Preserve generic rendering behavior across arbitrary games without FITL-specific fields.
5. Add diagnostics for ambiguous/invalid visual ownership declarations.

## Invariants

1. Runner token color/faction resolution does not rely on string-prefix guessing.
2. Token visual ownership identity is explicit, deterministic, and data-driven from compiled spec.
3. Existing valid games keep current rendering behavior unless data is invalid/ambiguous.
4. Contract remains game-agnostic and reusable across card/board game families.

## Tests That Should Pass

1. Engine validation/compiler tests (new or updated) proving token visual identity contract is emitted and validated.
2. `packages/runner/test/model/derive-render-model-zones.test.ts`
   - Replace/update heuristic-specific tests with explicit contract-driven assertions.
3. `packages/runner/test/canvas/renderers/token-renderer.test.ts`
   - Regression coverage for token color resolution via explicit contract.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/runner test`

