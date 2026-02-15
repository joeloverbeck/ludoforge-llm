# FITLEVECARENC-015: 1968 Period — VC-First Faction Order Cards

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1968 period cards where VC is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 91 | Bob Hope | VC, US, NVA, ARVN | Medium | Troop relocation + Casualties |
| 92 | SEALORDS | VC, US, NVA, ARVN | Medium | Free Sweep/Assault around Can Tho |
| 94 | Tunnel Rats | VC, US, NVA, ARVN | Medium | Tunnel placement/removal, no shaded |
| 96 | APC | VC, US, ARVN, NVA | High | Free Pacify; Tet Offensive reference |
| 103 | Kent State | VC, NVA, US, ARVN | Medium | Casualties + free LimOp |
| 111 | Agent Orange | VC, ARVN, US, NVA | Medium | Flip + free Air Strikes |
| 113 | Ruff Puff | VC, ARVN, US, NVA | Medium | Police placement; piece replacement |
| 115 | Typhoon Kate | VC, ARVN, US, NVA | Medium | Momentum (unshaded), no shaded |
| 117 | Corps Commander | VC, ARVN, NVA, US | Medium | Troop placement + Sweep; die roll |
| 119 | My Lai | VC, ARVN, NVA, US | Medium | Opposition + piece placement |
| 120 | US Press Corps | VC, ARVN, NVA, US | Medium | Conditional piece movement |

11 cards total.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` — Add 11 card definitions.
- `test/integration/fitl-events-1968-vc.test.ts` — **New file**. Integration tests following the existing 1968 batch pattern.

## Out of Scope

- Other period/faction group cards.
- Game-specific runtime handlers or game-specific branching in kernel/compiler.

## Reassessed Assumptions (2026-02-15)

1. None of the 11 target cards are currently encoded in `data/games/fire-in-the-lake/41-content-event-decks.md` (`card-91`, `92`, `94`, `96`, `103`, `111`, `113`, `115`, `117`, `119`, `120`).
2. Existing 1968 integration coverage currently exists for US/NVA/ARVN first-faction batches only (`fitl-events-1968-us.test.ts`, `fitl-events-1968-nva.test.ts`, `fitl-events-1968-arvn.test.ts`); VC-first coverage is missing.
3. Production FITL content is now composed from directory sources under `data/games/fire-in-the-lake/`; ticket scope should target the split content file rather than a monolithic file path.
4. Cards without shaded events must be encoded as `sideMode: "single"` and omit `shaded` payloads (`card-94`, `card-115`).
5. Momentum cards are represented as `lastingEffects` with `duration: "round"` and boolean setup/teardown toggles; card `115` must follow that established pattern.
6. APC shaded event semantics ("otherwise VC executes General Uprising") are better represented as a generic runtime free-operation grant effect in `EffectAST`, not as FITL-specific code paths.

## Architecture Rationale

- Encoding these cards in the event-deck data file is more beneficial than adding engine branches because it preserves the agnostic, data-driven compiler/kernel architecture.
- For this batch, the highest-value robust behavior is metadata correctness, side-mode correctness, and explicit momentum wiring for card `115`, which is already consumed by operation-profile checks.
- A generic, game-agnostic `grantFreeOperation` effect primitive is preferable to side-specific event-grant wiring because it keeps GameSpecDoc as the source of game behavior while preserving a reusable simulator/kernel API.
- No backwards-compat aliasing is introduced; behavior is expressed through canonical effect vocabulary.

## Encoding Notes

- **Card 96 (APC)**: References Tet Offensive card (#124). Shaded text says "If Tet Offensive played, return it to VC. If not, VC execute 'General uprising'." Complex cross-card reference.
- **Card 115 (Typhoon Kate)**: Momentum. No shaded text. Tags: `["momentum"]`.
- **Cards 94, 115**: No shaded text.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-vc.test.ts`:
   - All 11 cards compile, correct metadata, faction orders.
   - Cards 94 and 115 are asserted as `sideMode: "single"` with no `shaded` payload.
   - Card 115: momentum `lastingEffects` with `duration: "round"`.
   - Card 96 shaded branch encodes explicit executable behavior:
     - if Tet Offensive has been played, move `card-124` from `played:none` to `leader:none`;
     - else emit a `grantFreeOperation` for VC General Uprising execution.
2. New/updated unit coverage for `grantFreeOperation` effect compile/schema/exhaustive typing.
3. `npm run build` passes.
4. `npm run lint` passes.
5. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 11 missing VC-first 1968 cards (`91`, `92`, `94`, `96`, `103`, `111`, `113`, `115`, `117`, `119`, `120`) in `data/games/fire-in-the-lake/41-content-event-decks.md`.
  - Encoded `card-94` and `card-115` as `sideMode: single` with no `shaded` payloads.
  - Implemented `card-115` as a momentum card with `lastingEffects` (`duration: round`) that toggles `mom_typhoonKate` true/false.
  - Encoded `card-96` shaded side as executable conditional behavior: return Tet (`card-124`) from `played:none` to `leader:none`; otherwise grant VC a free operation.
  - Added a new generic `grantFreeOperation` effect primitive in compiler/kernel validation/runtime dispatch (no game-specific branching), and used it from card data.
  - Added/updated tests:
    - `test/integration/fitl-events-1968-vc.test.ts` for APC conditional payload shape and grant fallback.
    - `test/integration/fitl-event-free-operation-grants.test.ts` to verify grants emitted through effect execution.
    - `test/unit/compile-effects.test.ts`, `test/unit/schemas-ast.test.ts`, `test/unit/types-exhaustive.test.ts` for compile/schema/type coverage of `grantFreeOperation`.
    - `test/unit/eval-query.test.ts` for token filter support with `prop: id`.
- **Deviations from original plan**:
  - Corrected stale path assumptions from wildcard `data/games/fire-in-the-lake/*.md` to the actual composed source file `data/games/fire-in-the-lake/41-content-event-decks.md`.
  - Expanded scope beyond data-only encoding to introduce a reusable, game-agnostic effect primitive because APC required executable "otherwise free operation" behavior.
  - Explicitly formalized architecture constraints (single-side encoding, momentum wiring conventions, and generic effect vocabulary) in ticket scope.
- **Verification**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `node --test dist/test/unit/compile-effects.test.js dist/test/unit/schemas-ast.test.js` ✅
  - `node --test dist/test/integration/fitl-events-1968-vc.test.js dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `npm test` ✅
