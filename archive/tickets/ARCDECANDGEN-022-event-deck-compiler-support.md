# ARCDECANDGEN-022: Event Deck Compiler Cross-Reference Completion

**Status**: ✅ COMPLETED
**Phase**: 8C (Generic Event Deck Subsystem — compiler)
**Priority**: P2
**Complexity**: S
**Dependencies**: ARCDECANDGEN-020 (event deck types), ARCDECANDGEN-008 (CompileSectionResults), ARCDECANDGEN-010 (cross-validation)

## Reassessed Goal

Complete the remaining compiler-side event deck work by adding cross-reference validation for `eventDecks` zone references (deck-level and effect-level).

## Assumption Reassessment (ticket vs current codebase)

1. `eventDecks` compiler plumbing is already implemented.
- Already present in `src/cnl/game-spec-doc.ts`, `src/cnl/section-identifier.ts`, `src/cnl/compiler-core.ts`, `src/cnl/compile-event-cards.ts`, `src/cnl/validate-extensions.ts`, parser wiring, and existing tests.

2. Backward compatibility with legacy `eventCardSet` is not valid for current architecture.
- Current validation explicitly rejects `eventCardSet` data assets (`test/unit/data-assets.test.ts`, `test/unit/validate-spec.test.ts`).
- Per Spec 32 architecture direction and current user constraints, we keep a clean break: no aliasing, no deprecation shim.

3. Structured compile results and cross-validation infrastructure are already in place.
- `CompileSectionResults` exists and is exercised by tests.
- `crossValidateSpec` exists and validates many cross-section references, but not event deck zone references yet.

## Updated Scope

### In Scope
- Add event-deck-specific cross-refs in `src/cnl/cross-validate.ts`:
  - `eventDecks[].drawZone` -> `zones[].id`
  - `eventDecks[].discardZone` -> `zones[].id`
  - event-card effect zone refs (`moveToken`, `draw`, `shuffle`) inside card sides/branches -> `zones[].id`
- Add/strengthen tests for the new cross-ref diagnostics.

### Out of Scope
- No backward compatibility or deprecation path for `eventCardSet`.
- No changes to kernel execution behavior.
- No FITL content migration work.
- No changes to `src/agents/`, `src/sim/`.

## File List (updated)

### Files to modify
- `src/cnl/cross-validate.ts` — add event deck zone-reference validation
- `test/unit/cross-validate.test.ts` — add event deck cross-ref tests

### Optional integration touch (only if needed)
- `test/integration/compile-pipeline.test.ts` or another integration test file — add regression proving event deck cross-refs are enforced in full compile path

## Acceptance Criteria (updated)

### Tests that must pass
- `npm run typecheck`
- `npm run lint`
- `npm test`

### New/updated tests
1. `eventDecks drawZone` missing zone -> emits `CNL_XREF_EVENT_DECK_ZONE_MISSING`
2. `eventDecks discardZone` missing zone -> emits `CNL_XREF_EVENT_DECK_ZONE_MISSING`
3. event-card side/branch effects referencing missing zones -> emit `CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING`
4. valid FITL production compile still emits zero event-deck cross-ref diagnostics

### Invariants
- `eventDecks` remains optional.
- No legacy `eventCardSet` aliasing or fallback path is introduced.
- Cross-ref diagnostics remain deterministic and only run when source+target sections are available.

## Outcome

- **Completion date**: 2026-02-13
- **What changed**:
  - Added deck-level `eventDecks.drawZone` / `eventDecks.discardZone` cross-reference diagnostics in `src/cnl/cross-validate.ts`.
  - Added event-card effect zone cross-reference diagnostics for `eventDecks` in `src/cnl/cross-validate.ts` using shared effect-zone traversal logic.
  - Added unit coverage for both deck-level and event-effect cross-validation in `test/unit/cross-validate.test.ts`.
  - Added integration coverage through parse/compile pipeline in `test/integration/compile-pipeline.test.ts`.
  - Updated `data/games/fire-in-the-lake.md` to explicitly declare `leader` and `played` zones so event-deck lifecycle zones are represented in GameSpecDoc data.
  - Updated ticket assumptions and scope to match the current architecture and no-backward-compatibility policy.
- **Deviations from original plan**:
  - No functional deferral remains; deck-level validation was implemented by fixing the source spec data model (explicit lifecycle zone declarations) rather than adding compatibility aliases or bypasses.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
