# AGNOSTIC-010: Explicit Token Visual Ownership Contract (Remove Runner Heuristics)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Engine + runner
**Deps**: specs/35-00-frontend-implementation-roadmap.md

## Assumptions Reassessment (2026-02-18)

1. The engine already emits a canonical ownership signal: `GameDef.tokenTypes[].faction` (derived from CNL/piece catalog when available). A brand-new top-level GameDef field is not required for this ticket.
2. The current runner still applies heuristic inference in `packages/runner/src/model/derive-render-model.ts`:
   - alias-normalized `token.props.faction` matching,
   - token type prefix guessing (e.g. `us-*`),
   - owner/turn-order fallback for player-owned zones.
3. Existing tests currently assert heuristic behavior (for example faction derivation from owner turn-order and alias-normalized token props in `packages/runner/test/model/derive-render-model-zones.test.ts`).
4. Engine validation currently enforces canonical token-type faction metadata only for stacking constraints, but does not yet guarantee visual ownership references are valid against declared `GameDef.factions` when those factions exist.

## Architecture Decision

1. Canonical visual ownership source: `tokenTypes[].faction` only.
2. Runner must stop inferring visual ownership from token instance props, naming conventions, or owner seat.
3. No aliasing/back-compat shims: non-canonical or missing ownership data should surface as neutral rendering (or validation errors where enforceable), not inferred behavior.
4. Keep engine/runtime generic: no game-specific conditionals, no FITL-specific branches.

## What Needs to Change

1. Runner:
   - Replace `derive-render-model` token faction resolution with explicit lookup from `GameDef.tokenTypes[].faction`.
   - Remove alias normalization/prefix/owner-fallback faction inference paths.
2. Engine validation:
   - Add structural validation that `tokenTypes[].faction` references a declared faction id when `GameDef.factions` is present.
   - Emit deterministic diagnostics for invalid visual ownership declarations.
3. Tests:
   - Update runner model tests to assert explicit contract behavior and assert that former heuristics are no longer used.
   - Add/adjust engine validation tests for invalid token-type faction references.
4. Maintain game-agnostic architecture and avoid introducing new per-game schema/contracts.

## Invariants

1. Runner token faction resolution does not rely on string-prefix guessing, alias normalization, or owner-based inference.
2. Token visual ownership identity is explicit, deterministic, and sourced from `GameDef.tokenTypes[].faction`.
3. Invalid ownership references are surfaced via diagnostics; runtime render fallback remains deterministic.
4. Contract remains game-agnostic and reusable across arbitrary games.

## Tests That Should Pass

1. Engine validation/compiler tests (new or updated) proving canonical token visual ownership references are validated.
2. `packages/runner/test/model/derive-render-model-zones.test.ts`
   - Replace heuristic-specific assertions with explicit `tokenTypes[].faction` contract assertions.
3. `packages/runner/test/canvas/renderers/token-renderer.test.ts`
   - Regression coverage for deterministic token color resolution from explicit faction ids and neutral fallback for non-faction tokens.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-18
- Actually changed:
  - Runner token faction derivation now resolves strictly from `GameDef.tokenTypes[].faction` in `packages/runner/src/model/derive-render-model.ts`.
  - Removed runner faction heuristics (token prop alias normalization, token-type prefix guessing, and owner/turn-order fallback).
  - Added engine validation diagnostic `TOKEN_TYPE_FACTION_UNDECLARED` in `packages/engine/src/kernel/validate-gamedef-structure.ts` when token-type faction ids are not present in declared `factions`.
  - Updated tests in `packages/runner/test/model/derive-render-model-zones.test.ts` and `packages/engine/test/unit/validate-gamedef.test.ts`.
- Deviations from original plan:
  - No new GameDef contract field was added because canonical ownership data already existed as `tokenTypes[].faction`; ticket scope was corrected to use this existing contract.
  - `packages/runner/test/canvas/renderers/token-renderer.test.ts` required no changes because renderer behavior already consumed explicit `factionId` and remained valid.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo lint` passed.
