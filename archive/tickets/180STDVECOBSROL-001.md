# 180STDVECOBSROL-001: Phase 0 - Ordinary-operation standing-projection witness

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Tests only - no production implementation.
**Deps**: `archive/tickets/179ACTSELPRE-009.md`

## Problem

Spec 179 proved the synthetic `outcomeGrantResolve` opt-in substrate, but current production FITL ordinary operations and event/free-operation grants do not provide a closing `outcomeGrantResolve` witness. Spec 180 now owns the ordinary-operation standing visibility successor. Before implementation starts, this ticket must add the first focused failing witness and preserve the current outer-preview silent-0 bug as a testable invariant.

## Assumption Reassessment (2026-05-17)

1. `archive/tickets/179ACTSELPRE-009.md` selected Spec 180 as the successor architecture and rejected a separate `previewEffect.*` namespace unless the integrated standing route proves insufficient.
2. Current code has status-aware preview outcomes and `unknownPreviewRefs`, but `seatAgg(sum)` over unavailable preview cells can still collapse to numeric `0`.
3. The first implementation ticket needs a generic fixture that proves ordinary-operation standing signal without relying on FITL-specific engine branches or production `outcomeGrantResolve` activation.

## Architecture Check

1. The witness must exercise the one-rules protocol: published action-selection candidate, generic apply path, bounded continuation, and terminal margin/ranking recomputation.
2. The fixture must be game-agnostic: four generic seats, terminal margins, and ordinary operation effects expressed in GameSpecDoc/GameDef-compatible data.
3. No compatibility aliasing or alternate preview namespace is introduced by this test-only phase.

## What to Change

### 1. Add the ordinary-operation standing witness

Create `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts`.

The test should currently fail because the engine lacks Spec 180's standing-projection route. The fixture must publish two action-selection candidates:

- one candidate reaches an ordinary operation body that changes an opponent terminal margin through the normal published-decision/apply path;
- one candidate does not change opponent standing.

The expected post-fix assertion is that the value-bearing candidate reports a ready differentiated opponent standing cell, while capped/unobservable projection reports an explicit unavailable status rather than numeric `0`.

### 2. Pin the outer-preview silent-zero bug

Create `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` or extend the closest existing preview-integrity test if it already owns this invariant. The witness records current behavior where preview-derived `seatAgg(sum)` can contribute numeric `0` when all per-seat cells are unavailable.

## Files to Touch

- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` (new)
- `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` (new or nearest existing test modified)

## Out of Scope

- Production standing-projection implementation.
- `seatAgg.availability` implementation.
- FITL ARVN campaign reruns.
- New public `previewEffect.*` namespace.

## Acceptance Criteria

### Tests That Must Pass

1. The silent-zero witness passes and records the current bug shape.
2. The ordinary-operation standing witness is checked in as the focused RED witness for `tickets/180STDVECOBSROL-002.md`.
3. `pnpm -F @ludoforge/engine build`.
4. `pnpm run check:ticket-deps`.

### Invariants

1. The failing witness uses only generic GameSpecDoc/GameDef constructs.
2. The witness does not claim production FITL `outcomeGrantResolve` activation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` - focused RED witness for ordinary-operation standing projection.
2. `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` - current silent-0 bug pin.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled test command for the silent-zero witness.
3. Focused compiled test command for the ordinary-operation RED witness, recorded as expected failing evidence for ticket 002.
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-17)

Outcome amended: 2026-05-17

Phase 0 landed as a test-only witness slice. No production standing-projection implementation, `seatAgg.availability`, FITL campaign rerun, schema change, generated artifact, or `previewEffect.*` namespace was introduced.

What landed:

- `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts` adds the generic four-seat standing-preview fixture used by both witnesses. It has ordinary operation candidates for no standing change, east-opponent standing change, and a deeper south-opponent standing body.
- `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` pins the current outer-preview bug shape: `seatAgg(sum)` over unavailable opponent preview cells records a numeric `0` contribution, has zero ready ref values, and does not fire an explicit fallback.
- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` is checked in as the focused RED witness for `tickets/180STDVECOBSROL-002.md`. The public ordinary-operation candidate already differentiates a ready opponent-standing value, and the future-facing RED assertion requires the unavailable opponent-standing path to become status-bearing (`hidden`) instead of a numeric zero contribution.

Touched-file scope correction:

- The ticket named two test files. The implementation also added `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts` as owned test-fixture fallout so both witnesses use the same generic GameDef, policy catalog, and action-selection/apply path.

Generated/schema fallout: none. The change is test-only and does not touch schema sources, generated schemas, GameDef goldens, trace schemas, or production profile data.

Source-size check:

- `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts`: new file, 272 lines, under the 800-line cap.
- `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts`: new file, 26 lines.
- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts`: new file, 39 lines.

Verification:

- `pnpm -F @ludoforge/engine build` - passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.js` - passed, 1 test.
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.js` - expected RED, exit 1. The failing assertion is the future contract for ticket 002: current `hiddenHarmEast.unknownPreviewRefs` is `[]`, but the witness expects `[{ refId: "victoryCurrentMargin.currentMargin.$seat", reason: "hidden" }]` and no numeric zero contribution.
- `pnpm run check:ticket-deps` - passed; `Ticket dependency integrity check passed for 9 active tickets and 2401 archived tickets.`

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/replaced/not run | final citation |
| --- | --- | --- | --- |
| Acceptance/Test Plan | `pnpm -F @ludoforge/engine build` | run directly | passed |
| Acceptance/Test Plan | Focused compiled test command for the silent-zero witness | replaced by repo-valid compiled Node runner path | passed: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.js` |
| Acceptance/Test Plan | Focused compiled test command for the ordinary-operation RED witness | replaced by repo-valid compiled Node runner path | expected RED: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.js` |
| Acceptance/Test Plan | `pnpm run check:ticket-deps` | run directly after terminal status patch | passed; `Ticket dependency integrity check passed for 9 active tickets and 2401 archived tickets.` |

AGENTS canonical lane reconciliation:

| AGENTS canonical lane | required by ticket? | ran/subsumed/not applicable | rationale |
| --- | --- | --- | --- |
| `pnpm turbo build` | no | not applicable | ticket-owned surface is engine test-only; package build is the named build proof |
| `pnpm turbo test` | no | not applicable | ticket explicitly expects one focused RED witness, so broad test cannot be final green evidence until ticket 002 |
| `pnpm turbo lint` | no | not applicable | no lint lane named; TypeScript build covers the new test sources |
| `pnpm turbo typecheck` | no | not applicable | package build ran `tsc` for the engine package and compiled the new tests |
| `pnpm turbo schema:artifacts` | no | not applicable | no schema source or generated artifact changed |

Late-edit proof validity: terminal status/proof transcription plus exact post-status dependency-check transcription only; no source, test, schema, generated artifact, scope, acceptance command, touched-file ownership, dependency, or follow-up boundary changed after the final build/silent-zero/expected-RED proof set. The post-status ticket-dependency integrity lane passed, and this transcription does not change graph facts.

Archive status: archived at `archive/tickets/180STDVECOBSROL-001.md`. Follow-up implementation completed and archived at `archive/tickets/180STDVECOBSROL-002.md`.
