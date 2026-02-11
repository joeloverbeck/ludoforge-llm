# FITLEVEFRAANDINICARPAC-005 - Lasting Effects and Free-Operation Interactions

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-003`, `FITLEVEFRAANDINICARPAC-004`

## Goal
Harden the currently implemented generic free-operation/eligibility behavior and align ticket assumptions with the present event framework baseline from Spec 20.

## Reassessed assumptions (2026-02-11)
- The original ticket assumed a dedicated runtime lasting-effect registry and expiration engine already existed in `turnFlow` lifecycle state. It does not.
- Current code already supports:
  - generic `duration` enums (`card`, `nextCard`, `coup`, `campaign`) in top-level turn-flow and event-card lasting-effect schemas,
  - deterministic coup lifecycle windows (`coupToLeader`, `coupHandoff`) and coup reset integration hooks,
  - generic eligibility override directives with `nextCard` duration semantics,
  - free-op metadata being non-mutating unless explicit `eligibilityOverride:*` directives are supplied.
- The original file/test list was over-scoped:
  - no `test/unit/turn-flow-lifecycle.test.ts` exists (lifecycle coverage is in `test/integration/fitl-card-lifecycle.test.ts` and `test/unit/phase-advance.test.ts`),
  - this ticket does not require schema/type/public API expansion for a new lasting-effect runtime store.
- Implementing full lasting-effect activation/expiration execution for event cards would require additional generic runtime contracts beyond this ticket and is out of minimal scope here.

## Scope
- Keep public APIs unchanged.
- Strengthen regression coverage that free-op metadata does not implicitly create eligibility overrides or hidden eligibility deltas.
- Validate against existing lifecycle/eligibility integration tests referenced by Spec 20.

## Implementation tasks
1. Adjust ticket assumptions/scope to match current engine capabilities and existing tests.
2. Add one focused regression test around free-op metadata and override trace behavior.
3. Run required build/unit/integration checks.

## File list it expects to touch
- `test/integration/fitl-eligibility-window.test.ts`
- `tickets/FITLEVEFRAANDINICARPAC-005-lasting-effects-and-free-operation-interactions.md`

## Out of scope
- New runtime state model for event-card lasting effects (capability/momentum registry).
- New compiler/runtime lowering path that executes `eventCard.lastingEffects` at runtime.
- FITL-specific branching keyed on card ids/faction ids/map ids.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`

### Invariants that must remain true
- Free-operation metadata remains zero-cost by construction and does not alter eligibility unless explicit override directives are present.
- Eligibility override application remains generic, deterministic, and trace-visible.
- Lifecycle windows used by coup boundaries remain deterministic and trace-visible.
- No FITL-specific branching is introduced in runtime logic.

## Outcome
- Completion date: 2026-02-11.
- What changed:
  - Reassessed and corrected ticket assumptions to match current runtime architecture and existing test coverage.
  - Added a focused integration regression check ensuring free-op metadata alone does not emit `overrideCreate` entries and does not carry overrides at `cardEnd`.
- Deviations from original plan:
  - Did not implement a lasting-effect runtime registry/expiration executor for event-card `lastingEffects`; current runtime only has schema/data contracts for these and no execution path yet.
  - Removed the non-existent `turn-flow-lifecycle` unit test target from acceptance criteria.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/apply-move.test.js` passed.
  - `node --test dist/test/unit/legal-moves.test.js` passed.
  - `node --test dist/test/integration/fitl-eligibility-window.test.js` passed.
  - `node --test dist/test/integration/fitl-card-lifecycle.test.js` passed.
