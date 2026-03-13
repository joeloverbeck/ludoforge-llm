# FITLEVEAUTHAR-007: Audit and migrate exact-fit remaining FITL event cards onto replacement/routing macros

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — FITL game data and tests only
**Deps**: FITLEVEAUTHAR-002, FITLEVEAUTHAR-003, FITLEVEAUTHAR-004

## Problem

The current ticket series creates the cookbook, introduces reusable FITL-local replacement/routing macros, and proves them on CIDG. That is necessary but not sufficient.

Multiple event cards across the production FITL data still contain open-coded replacement, routing, posture-setting, and terrain/country-filtering sequences that are architecturally the same class of debt as CIDG. If that debt remains unowned, the codebase keeps the worst part of both architectures:

- macros exist, but authors still have to rediscover and duplicate low-level sequences
- one exemplar card is clean, while similar cards drift apart
- future fixes must be repeated across card-specific YAML instead of landing once in the macro layer

This ticket owns the remaining exact-fit migration backlog so the macro architecture becomes the canonical path where it materially improves authoring, without forcing macro calls into cards that are already clearer in their current form.

## Assumption Reassessment (2026-03-13)

1. `FITLEVEAUTHAR-002`, `FITLEVEAUTHAR-003`, and `FITLEVEAUTHAR-004` are already completed and archived under `archive/tickets/` — corrected.
2. The relevant spec reference is `archive/specs/62-fitl-event-authoring-hardening.md`; there is not a live family of `specs/62-fitl*` implementation files in `specs/` anymore — corrected.
3. The post-CIDG migration backlog is smaller than originally assumed. A focused audit of the production FITL event files found only two clean exact-fit candidates for the current macro contracts:
   - `card-29` shaded (`Tribesmen`) for in-place VC guerrilla replacement plus routed Irregular removal
   - `card-51` unshaded (`301st Supply Bn`) for faction-aware routing of removed insurgent pieces
4. Other cards still contain explicit routing or placement logic, but several reviewed cases do not justify macro migration with the current contracts because the macro would only wrap a single obvious `moveToken`, or would hide card-specific destination choice/flow without reducing real duplication. Examples reviewed during audit:
   - `card-2` unshaded (`Kissinger`)
   - `card-80` unshaded (`Light at the End of the Tunnel`)
5. The architectural boundary remains unchanged: consolidate recurring FITL authoring patterns in FITL-local macros and tests, not in the engine/runtime/kernel — confirmed.

## Architecture Check

1. This migration is beneficial only when the macro removes a genuinely repeated FITL-local mechanic. "Can call a macro" is not enough.
2. The migration must stay selective, not mechanical: only patterns that exactly match the current macro contracts should be rewritten.
3. No backwards-compatibility aliases should be introduced. Cards should be rewritten in place to the canonical macro-based shape or left alone.
4. For cards like `card-80`, replacing a direct `moveToken` with `fitl-place-selected-piece-in-zone` would not improve the architecture because it would obscure an already explicit per-piece destination flow with no meaningful DRY gain.
5. The shared event-fidelity helpers from `FITLEVEAUTHAR-003` should be used when they improve clarity, but this ticket does not need to force helper migration into already-stable suites unless the migration benefits the tests.

## What to Change

### 1. Use the audited candidate list, not a fresh open-ended backlog scan

The audit is complete for this ticket. Migrate only the cards that are already verified as clean exact fits:

- `card-29` shaded (`Tribesmen`)
  - replace the open-coded "take 1 VC guerrilla from Available into the removed Irregular's source zone" sequence with `fitl-place-selected-piece-in-zone-underground-by-type`
  - replace the open-coded "route removed Irregular to Available" step with `fitl-route-removed-piece-to-force-pool`
- `card-51` unshaded (`301st Supply Bn`)
  - replace the explicit faction branch routing with `fitl-route-removed-piece-to-force-pool`

Reviewed non-candidates for this ticket:

- `card-2` unshaded (`Kissinger`) — routing exists, but the ticket should not broaden again unless the resulting YAML is demonstrably clearer than the current straightforward sequence.
- `card-80` unshaded (`Light at the End of the Tunnel`) — current flow is dominated by per-removed-piece follow-up decisions; macro insertion would not improve the structure.

### 2. Migrate only the two exact-fit cards

For each audited candidate:

- replace only the shared routing/replacement sequence with the canonical macro call
- preserve compiled behavior exactly unless a rules-verified bug is found
- keep card-specific legality, counts, space selection, and follow-up effects explicit in the card

Do not broaden the migration set during implementation unless another card proves to be an equally exact fit and also has credible test coverage ready to strengthen in the same change.

### 3. Strengthen per-card fidelity coverage where needed

For the migrated cards, verify at least these invariants:

- `card-29` shaded
  - exact event text still matches
  - compiled structural contract now references the canonical routing/placement macros
  - each removed Irregular routes to `available-US:none`
  - each replacement VC guerrilla is placed in the removed Irregular's source zone and is underground
  - limited-availability fallback still removes all Irregulars even when fewer VC guerrillas are available
- `card-51` unshaded
  - exact event text still matches
  - compiled structural contract now references the canonical routing macro
  - selected NVA pieces route to `available-NVA:none`
  - selected VC pieces route to `available-VC:none`
  - fewer-than-6 and zero-eligible no-op behavior remain intact

### 4. Record reviewed non-migrated cards explicitly

Document the reviewed non-candidates in the final `Outcome` with their reason, especially where the card still contains explicit routing or placement logic but should remain as-is because:

- the pattern is not repeated enough to justify the abstraction
- the current macro surface would reduce clarity rather than improve it
- the card's flow is dominated by card-specific choice sequencing

If implementation exposes a genuinely repeated pattern that deserves a new FITL-local macro, stop and raise a follow-up ticket rather than silently broadening this ticket.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/001-032.md` (modify — `card-29` shaded only)
- `data/games/fire-in-the-lake/41-events/033-064.md` (modify — `card-51` unshaded only)
- `packages/engine/test/integration/fitl-events-tribesmen.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-301st-supply-bn.test.ts` (modify)
- this ticket file (update candidate list, completion status, and final outcome)

## Out of Scope

- Modifying engine source code (compiler, kernel, agents, sim).
- Reworking cards whose logic does not actually match the new macro contracts.
- Introducing compatibility aliases for old authoring patterns.
- Changing Spec 29 archival or repo-guidance references.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`

### Invariants

1. No engine source files are modified.
2. Only `card-29` shaded and `card-51` unshaded are migrated in this ticket.
3. Every migrated card uses the new macros only where the abstraction is genuinely correct.
4. Every migrated card preserves behavior unless a rules-verified bug is explicitly called out.
5. Each migrated card has test coverage for any replacement/routing/posture/fallback invariant that could regress.
6. Reviewed non-candidates are explicitly documented rather than left implicit.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tribesmen.test.ts` — add structural assertions for macro usage and preserve shaded routing/replacement/fallback behavior coverage.
2. `packages/engine/test/integration/fitl-events-301st-supply-bn.test.ts` — add structural assertions for routing macro usage and preserve unshaded routing/no-op behavior coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - Reassessed the backlog assumptions and narrowed this ticket to the two remaining exact-fit macro migrations: `card-29` shaded (`Tribesmen`) and `card-51` unshaded (`301st Supply Bn`).
  - Rewrote `card-29` shaded to use `fitl-place-selected-piece-in-zone-underground-by-type` for in-zone VC replacement and `fitl-route-removed-piece-to-force-pool` for routed Irregular removal.
  - Rewrote `card-51` unshaded to use `fitl-route-removed-piece-to-force-pool` for faction-correct insurgent routing.
  - Strengthened the `Tribesmen` and `301st Supply Bn` integration suites with structural assertions that the canonical macros are now present while preserving behavioral coverage.
  - Fixed an unrelated runner test typing issue in `packages/runner/test/canvas/viewport-setup.test.ts` so repository-wide `pnpm turbo typecheck` could pass.
- Deviations from original plan:
  - Did not broaden the migration backlog. The audit showed that `card-2` unshaded and `card-80` unshaded should remain explicit because the current macro surface would not improve clarity or reuse.
  - The archived dependency tickets were not re-opened; this ticket now reflects their archived status rather than assuming they are still active.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/integration/fitl-events-tribesmen.test.js`
  - `node packages/engine/dist/test/integration/fitl-events-301st-supply-bn.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
